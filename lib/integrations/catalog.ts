/** Toolkits Jarvis offers (Composio slugs). Shared by server and client. */
export type ToolkitId = "gmail" | "googlecalendar" | "notion" | "slack" | "github" | "googledrive" | "linear";

export type ToolkitInfo = {
  id: ToolkitId;
  name: string;
  short: string;
  color: string;
  /** One line shown on connect suggestions. */
  why: string;
  /** Words that suggest a request needs this toolkit. */
  keywords: RegExp;
  /** Status label while its read tools run. */
  checking: string;
};

export const TOOLKITS: ToolkitInfo[] = [
  { id: "gmail", name: "Gmail", short: "G", color: "#EA4335", why: "Read, summarize and draft email.", keywords: /\b(e-?mails?|inbox|gmail|unread|mail)\b/i, checking: "Checking Gmail…" },
  { id: "googlecalendar", name: "Google Calendar", short: "C", color: "#4285F4", why: "See your schedule and add events.", keywords: /\b(calendar|meetings?|events?|schedule|agenda|free time|availability)\b/i, checking: "Checking Calendar…" },
  { id: "notion", name: "Notion", short: "N", color: "#191919", why: "Search pages and query databases.", keywords: /\bnotion\b/i, checking: "Searching Notion…" },
  { id: "slack", name: "Slack", short: "S", color: "#611F69", why: "Read channels and send messages.", keywords: /\b(slack|channel|dm)\b/i, checking: "Checking Slack…" },
  { id: "github", name: "GitHub", short: "GH", color: "#24292F", why: "Track issues and pull requests.", keywords: /\b(github|repo|repository|pull requests?|prs?|issues?)\b/i, checking: "Checking GitHub…" },
  { id: "googledrive", name: "Google Drive", short: "D", color: "#0F9D58", why: "Find files and docs.", keywords: /\b(google drive|drive|docs?|spreadsheets?|files?)\b/i, checking: "Searching Drive…" },
  { id: "linear", name: "Linear", short: "L", color: "#5E6AD2", why: "Track tickets and projects.", keywords: /\b(linear|tickets?|sprint|backlog)\b/i, checking: "Checking Linear…" },
];

export const TOOLKIT_BY_ID = Object.fromEntries(TOOLKITS.map((t) => [t.id, t])) as Record<ToolkitId, ToolkitInfo>;

export function isToolkitId(v: unknown): v is ToolkitId {
  return typeof v === "string" && v in TOOLKIT_BY_ID;
}

/** Toolkits a free-text request probably needs (cheap keyword pass). */
export function detectToolkits(text: string): ToolkitId[] {
  return TOOLKITS.filter((t) => t.keywords.test(text)).map((t) => t.id);
}

/** Toolkit that owns a Composio tool slug, e.g. GMAIL_FETCH_EMAILS -> gmail. */
export function toolkitOfTool(slug: string): ToolkitId | null {
  const prefix = slug.split("_")[0].toLowerCase();
  return isToolkitId(prefix) ? prefix : null;
}

export type ConnectionStatus = { toolkit: ToolkitId; status: "connected" | "disconnected" | "pending" | "error"; connectedAt: string | null; lastSyncedAt: string | null };
