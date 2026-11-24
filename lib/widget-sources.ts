import "server-only";
import { webSearch } from "@/lib/ai/agent-tools";
import { query } from "@/lib/db";
import { getWidget, setWidgetData } from "@/lib/data";
import { composioConfigured, connectedToolkits, executeTool } from "@/lib/integrations/composio";
import { SOURCE_TOOLKIT, sanitizeSpec, type Source } from "@/lib/spec/schema";
import type { Widget } from "@/lib/types";

/**
 * Fills widget list state from live data (web search or a connected app).
 * Runs on widget open and from the cloudhike refresh job. Results are
 * normalized into plain {id, text, ...fields} items; nothing executes code.
 */

type Item = { id: string; text: string; [k: string]: string | number | boolean };

const str = (v: unknown, n = 160) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "").replace(/\s+/g, " ").trim().slice(0, n);

/** First array of objects found in a tool's data (tool shapes vary). */
function findArray(data: unknown, depth = 0): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  if (!data || typeof data !== "object" || depth > 3) return [];
  for (const v of Object.values(data as Record<string, unknown>)) {
    const a = findArray(v, depth + 1);
    if (a.length) return a;
  }
  return [];
}

function header(m: Record<string, unknown>, name: string) {
  const hs = ((m.payload as { headers?: Array<{ name?: string; value?: string }> })?.headers ?? []) as Array<{ name?: string; value?: string }>;
  return hs.find((h) => h.name?.toLowerCase() === name)?.value;
}

function normalizeApp(source: Extract<Source, { kind: "app" }>["source"], data: unknown, max: number): Item[] {
  const rows = findArray(data).slice(0, max);
  return rows.map((r, i): Item => {
    if (source.startsWith("gmail")) {
      const id = str(r.messageId ?? r.id ?? i, 60);
      return {
        id: `g${id}`,
        text: str(r.subject ?? header(r, "subject") ?? r.snippet ?? "(no subject)", 140),
        from: str(r.sender ?? r.from ?? header(r, "from"), 80).replace(/<.*>/, "").trim(),
        time: str(r.messageTimestamp ?? r.date ?? header(r, "date"), 40),
        url: id ? `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(id)}` : "",
      };
    }
    if (source.startsWith("calendar")) {
      const start = (r.start as { dateTime?: string; date?: string }) ?? {};
      const t = start.dateTime ?? start.date ?? "";
      return {
        id: `c${str(r.id ?? i, 60)}`,
        text: str(r.summary ?? r.title ?? "(no title)", 140),
        time: t ? new Date(t).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "",
        location: str(r.location, 80),
      };
    }
    const props = (r.properties ?? {}) as Record<string, { title?: Array<{ plain_text?: string }> }>;
    const titleProp = Object.values(props).find((p) => Array.isArray(p?.title));
    return {
      id: `n${str(r.id ?? i, 60)}`,
      text: str(titleProp?.title?.[0]?.plain_text ?? r.title ?? r.name ?? "Untitled", 140),
      url: str(r.url, 300),
      edited: str(r.last_edited_time, 40),
    };
  });
}

function appRequest(src: Extract<Source, { kind: "app" }>): { slug: string; args: Record<string, unknown> } {
  const max = src.max ?? 5;
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const end = new Date(dayStart.getTime() + (src.source === "calendar.week" ? 7 : 1) * 86_400_000);
  switch (src.source) {
    case "gmail.unread":
      return { slug: "GMAIL_FETCH_EMAILS", args: { query: `is:unread ${src.query ?? ""}`.trim(), max_results: max } };
    case "gmail.recent":
      return { slug: "GMAIL_FETCH_EMAILS", args: { query: src.query ?? "", max_results: max } };
    case "calendar.today":
    case "calendar.week":
      return { slug: "GOOGLECALENDAR_EVENTS_LIST", args: { calendarId: "primary", timeMin: dayStart.toISOString(), timeMax: end.toISOString(), singleEvents: true, orderBy: "startTime", maxResults: max } };
    case "notion.search":
      return { slug: "NOTION_SEARCH_NOTION_PAGE", args: { query: src.query ?? "", page_size: max } };
  }
}

async function webItems(src: Extract<Source, { kind: "web" }>, location: string | null): Promise<Item[]> {
  const fields = src.fields ?? [];
  const max = src.max ?? 5;
  const q = `${src.query}${location ? ` (near ${location})` : ""}.
Return ONLY a JSON array (no prose) of up to ${max} objects with keys "text" (name/title)${fields.map((f) => `, "${f}"`).join("")}${fields.includes("url") ? "" : ', "url" (source link)'}. Short values.`;
  const r = await webSearch(q);
  const j = r.answer.slice(r.answer.indexOf("["), r.answer.lastIndexOf("]") + 1);
  let arr: unknown[] = [];
  try {
    arr = JSON.parse(j);
  } catch {
    arr = [];
  }
  return (Array.isArray(arr) ? arr : [])
    .filter((x) => x && typeof x === "object")
    .slice(0, max)
    .map((x, i) => {
      const o = x as Record<string, unknown>;
      const item: Item = { id: `w${i}`, text: str(o.text ?? o.name ?? o.title, 120) };
      for (const f of [...fields, "url"]) {
        const v = str(o[f], f === "url" ? 300 : 60);
        if (v && (f !== "url" || v.startsWith("https://"))) item[f] = v;
      }
      return item;
    })
    .filter((x) => x.text);
}

export type RefreshResult = { state: Record<string, unknown>; refreshedAt: string; errors: Record<string, string>; needs: string[] };

export async function refreshWidgetSources(userId: string, widget: Widget, opts: { location?: string | null } = {}): Promise<RefreshResult | null> {
  const spec = widget.type === "custom" ? sanitizeSpec(widget.config.spec) : null;
  const sources: Record<string, Source> =
    widget.type === "inbox" ? { emails: { kind: "app", source: "gmail.unread", max: 5 } } : (spec?.sources ?? {});
  if (!Object.keys(sources).length) return null;
  const prevState = (widget.data?.state as Record<string, unknown>) ?? spec?.state ?? {};
  const state = { ...prevState };
  const errors: Record<string, string> = {};
  const needs: string[] = [];
  const connected = composioConfigured() ? await connectedToolkits(userId).catch(() => []) : [];
  for (const [key, src] of Object.entries(sources)) {
    try {
      if (src.kind === "web") {
        state[key] = await webItems(src, opts.location ?? null);
      } else {
        const toolkit = SOURCE_TOOLKIT[src.source];
        if (!connected.includes(toolkit)) {
          needs.push(toolkit);
          continue;
        }
        const req = appRequest(src);
        const res = await executeTool(userId, req.slug, req.args, { fixed: true });
        if (!res.successful) throw new Error(res.error ?? "failed");
        state[key] = normalizeApp(src.source, res.data, src.max ?? 5);
      }
    } catch (err) {
      errors[key] = err instanceof Error ? err.message.slice(0, 160) : "Couldn't refresh.";
    }
  }
  const refreshedAt = new Date().toISOString();
  await setWidgetData(userId, widget.id, { ...(widget.data ?? {}), state, refreshedAt, errors, needs });
  return { state, refreshedAt, errors, needs };
}

/** For the scheduled job: every widget that has live sources. */
export async function refreshAllSources(limit = 50) {
  const rows = await query<{ id: string; user_id: string }>(
    `select id, user_id from widgets where type = 'inbox' or (type = 'custom' and config->'spec' ? 'sources') order by created_at limit $1`,
    [limit],
  );
  let refreshed = 0;
  for (const r of rows) {
    const w = await getWidget(r.user_id, r.id);
    if (w && (await refreshWidgetSources(r.user_id, w).catch(() => null))) refreshed++;
  }
  return { due: rows.length, refreshed };
}
