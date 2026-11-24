import "server-only";
import { Composio } from "@composio/core";
import { query } from "@/lib/db";
import { TOOLKITS, isToolkitId, toolkitOfTool, type ConnectionStatus, type ToolkitId } from "./catalog";

/**
 * Composio (external tools). Server only. The cloudhike Auth user id is the
 * Composio user id, so every connection and tool call is scoped to that user.
 */

export function composioConfigured() {
  return Boolean(process.env.COMPOSIO_API_KEY?.trim());
}

const g = globalThis as unknown as { jbComposio?: Composio; jbToolCache?: Map<string, { at: number; tools: AgentTool[] }> };
function client(): Composio {
  if (!composioConfigured()) throw new Error("Composio isn't configured (COMPOSIO_API_KEY missing).");
  return (g.jbComposio ??= new Composio({ apiKey: process.env.COMPOSIO_API_KEY, allowTracking: false }));
}

/* ---------- Connections ---------- */

type Row = { toolkit: string; status: string; connected_account_id: string | null; connected_at: Date | null; last_synced_at: Date | null };

export async function getConnections(userId: string): Promise<ConnectionStatus[]> {
  const rows = await query<Row>(`select toolkit, status, connected_account_id, connected_at, last_synced_at from connections where user_id = $1`, [userId]);
  const by = new Map(rows.map((r) => [r.toolkit, r]));
  return TOOLKITS.map((t) => {
    const r = by.get(t.id);
    const status = (r?.status as ConnectionStatus["status"]) ?? "disconnected";
    return {
      toolkit: t.id,
      status: ["connected", "pending", "error"].includes(status) ? status : "disconnected",
      connectedAt: r?.connected_at ? new Date(r.connected_at).toISOString() : null,
      lastSyncedAt: r?.last_synced_at ? new Date(r.last_synced_at).toISOString() : null,
    };
  });
}

export async function connectedToolkits(userId: string): Promise<ToolkitId[]> {
  return (await getConnections(userId)).filter((c) => c.status === "connected").map((c) => c.toolkit);
}

async function upsert(userId: string, toolkit: string, status: string, accountId: string | null) {
  await query(
    `insert into connections (user_id, toolkit, status, connected_account_id, connected_at, updated_at)
     values ($1, $2, $3, $4, case when $3 = 'connected' then now() end, now())
     on conflict (user_id, toolkit) do update set
       status = excluded.status,
       connected_account_id = excluded.connected_account_id,
       connected_at = case when excluded.status = 'connected' then coalesce(connections.connected_at, now()) else null end,
       updated_at = now()`,
    [userId, toolkit, status, accountId],
  );
}

/** Pulls the user's connected accounts from Composio into the connections table. */
export async function syncConnections(userId: string): Promise<ConnectionStatus[]> {
  if (!composioConfigured()) return getConnections(userId);
  const res = await client().connectedAccounts.list({ userIds: [userId], toolkitSlugs: TOOLKITS.map((t) => t.id), limit: 100 });
  const active = new Map<string, string>();
  const pending = new Set<string>();
  for (const a of res.items ?? []) {
    const slug = a.toolkit?.slug?.toLowerCase();
    if (!slug || !isToolkitId(slug)) continue;
    if (a.status === "ACTIVE" && !a.isDisabled) active.set(slug, a.id);
    else if (a.status === "INITIATED" || a.status === "INITIALIZING") pending.add(slug);
  }
  for (const t of TOOLKITS) {
    if (active.has(t.id)) await upsert(userId, t.id, "connected", active.get(t.id)!);
    else await upsert(userId, t.id, pending.has(t.id) ? "pending" : "disconnected", null);
  }
  return getConnections(userId);
}

/** Starts Composio's hosted OAuth flow; returns the URL to send the user to. */
export async function startConnect(userId: string, toolkit: ToolkitId, callbackUrl: string): Promise<string> {
  const session = await client().create(userId, { toolkits: [toolkit] });
  const req = await session.authorize(toolkit, { callbackUrl });
  if (!req.redirectUrl) throw new Error("Composio did not return a sign-in link.");
  await upsert(userId, toolkit, "pending", null);
  return req.redirectUrl;
}

export async function disconnect(userId: string, toolkit: ToolkitId) {
  if (composioConfigured()) {
    const res = await client().connectedAccounts.list({ userIds: [userId], toolkitSlugs: [toolkit], limit: 20 });
    for (const a of res.items ?? []) await client().connectedAccounts.delete(a.id);
  }
  await upsert(userId, toolkit, "disconnected", null);
}

export async function markSynced(userId: string, toolkit: ToolkitId) {
  await query(`update connections set last_synced_at = now() where user_id = $1 and toolkit = $2`, [userId, toolkit]);
}

/* ---------- Tools ---------- */

export type AgentTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  toolkit: ToolkitId;
  version?: string;
  /** Reads run directly; anything else needs the user's confirmation. */
  readOnly: boolean;
};

const READ_NAME = /_(FETCH|LIST|GET|SEARCH|FIND|READ|QUERY|RETRIEVE)(_|$)/;
const WRITE_TAGS = ["destructiveHint", "createHint", "updateHint"];

function isReadOnly(slug: string, tags: string[] = []): boolean {
  if (tags.some((t) => WRITE_TAGS.includes(t))) return false;
  if (tags.includes("readOnlyHint")) return true;
  return READ_NAME.test(slug);
}

/** Curated, relevant tools per toolkit (missing slugs are skipped). */
const PREFERRED: Record<ToolkitId, string[]> = {
  gmail: ["GMAIL_FETCH_EMAILS", "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID", "GMAIL_LIST_DRAFTS", "GMAIL_CREATE_EMAIL_DRAFT", "GMAIL_SEND_EMAIL", "GMAIL_REPLY_TO_THREAD"],
  googlecalendar: ["GOOGLECALENDAR_EVENTS_LIST", "GOOGLECALENDAR_FIND_EVENT", "GOOGLECALENDAR_FIND_FREE_SLOTS", "GOOGLECALENDAR_CREATE_EVENT", "GOOGLECALENDAR_UPDATE_EVENT", "GOOGLECALENDAR_DELETE_EVENT"],
  notion: ["NOTION_SEARCH_NOTION_PAGE", "NOTION_QUERY_DATABASE", "NOTION_FETCH_BLOCK_CONTENTS", "NOTION_CREATE_NOTION_PAGE", "NOTION_ADD_MULTIPLE_PAGE_CONTENT"],
  slack: ["SLACK_LIST_ALL_CHANNELS", "SLACK_FETCH_CONVERSATION_HISTORY", "SLACK_SEARCH_MESSAGES", "SLACK_SEND_MESSAGE"],
  github: ["GITHUB_LIST_REPOSITORY_ISSUES", "GITHUB_SEARCH_ISSUES_AND_PULL_REQUESTS", "GITHUB_LIST_PULL_REQUESTS", "GITHUB_CREATE_AN_ISSUE"],
  googledrive: ["GOOGLEDRIVE_FIND_FILE", "GOOGLEDRIVE_FIND_FOLDER", "GOOGLEDRIVE_CREATE_FILE_FROM_TEXT"],
  linear: ["LINEAR_LIST_LINEAR_ISSUES", "LINEAR_LIST_LINEAR_PROJECTS", "LINEAR_CREATE_LINEAR_ISSUE"],
};

/** A small, relevant tool set for one toolkit (cached for 10 minutes). */
export async function toolsFor(toolkit: ToolkitId, limit = 12): Promise<AgentTool[]> {
  g.jbToolCache ??= new Map();
  const hit = g.jbToolCache.get(toolkit);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.tools;
  let list = await client().tools.getRawComposioTools({ tools: PREFERRED[toolkit] }).catch(() => []);
  if (!list.length) list = await client().tools.getRawComposioTools({ toolkits: [toolkit], important: true, limit });
  const tools: AgentTool[] = list
    .filter((t) => !t.isDeprecated)
    .map((t) => ({
      name: t.slug,
      description: (t.description ?? t.name).slice(0, 900),
      parameters: (t.inputParameters as Record<string, unknown>) ?? { type: "object", properties: {} },
      toolkit,
      version: t.version,
      readOnly: isReadOnly(t.slug, t.tags ?? []),
    }));
  g.jbToolCache.set(toolkit, { at: Date.now(), tools });
  return tools;
}

/**
 * Runs a tool for the user after checking it belongs to one of their connected
 * toolkits. `fixed` is for server-defined widget sources (a known slug that
 * may not be in the small agent tool set).
 */
export async function executeTool(userId: string, slug: string, args: Record<string, unknown>, opts: { fixed?: boolean } = {}) {
  const toolkit = toolkitOfTool(slug);
  if (!toolkit) throw new Error("Unknown tool.");
  if (!(await connectedToolkits(userId)).includes(toolkit)) throw new Error(`Connect ${toolkit} first.`);
  let tool: { version?: string } | undefined = (await toolsFor(toolkit)).find((t) => t.name === slug);
  if (!tool && opts.fixed) {
    const [raw] = await client().tools.getRawComposioTools({ tools: [slug] });
    tool = raw ? { version: raw.version } : undefined;
  }
  if (!tool) throw new Error("That tool isn't available.");
  const res = await client().tools.execute(slug, { userId, arguments: args, version: tool.version });
  await markSynced(userId, toolkit);
  return { successful: res.successful, data: res.data, error: res.error };
}

/* ---------- Logos ---------- */

const gl = globalThis as unknown as { jbLogos?: { at: number; logos: Partial<Record<ToolkitId, string>> } };

/** Toolkit logo URLs from Composio's toolkit metadata, cached for a day. */
export async function toolkitLogos(): Promise<Partial<Record<ToolkitId, string>>> {
  if (!composioConfigured()) return {};
  if (gl.jbLogos && Date.now() - gl.jbLogos.at < 24 * 3600_000) return gl.jbLogos.logos;
  const logos: Partial<Record<ToolkitId, string>> = {};
  await Promise.all(
    TOOLKITS.map(async (t) => {
      try {
        const tk = (await client().toolkits.get(t.id)) as { meta?: { logo?: string } };
        const url = tk.meta?.logo;
        if (url && url.startsWith("https://")) logos[t.id] = url;
      } catch {
        /* keep the bundled fallback for this toolkit */
      }
    }),
  );
  gl.jbLogos = { at: Date.now(), logos };
  return logos;
}
