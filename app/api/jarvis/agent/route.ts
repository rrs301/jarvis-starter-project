import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { selectAi, type ChatTurn } from "@/lib/ai";
import { runAgent, type ToolOutcome } from "@/lib/ai/agent";
import {
  calculate,
  fetchPage,
  TOOL_CALC,
  TOOL_CONNECT,
  TOOL_LOCATION,
  TOOL_TIME,
  TOOL_WEB_FETCH,
  TOOL_WEB_SEARCH,
  webSearch,
  type ClientTool,
} from "@/lib/ai/agent-tools";
import { classifyIntent } from "@/lib/ai/intent";
import { getBoard, getWidgets } from "@/lib/data";
import { TOOLKIT_BY_ID, isToolkitId, type ToolkitId } from "@/lib/integrations/catalog";
import { composioConfigured, connectedToolkits, executeTool, toolsFor, type AgentTool } from "@/lib/integrations/composio";
import { sseResponse } from "@/lib/sse";

export const dynamic = "force-dynamic";

type Loc = { lat: number; lon: number; city?: string } | { city: string };

function parseLocation(v: unknown): Loc | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.lat === "number" && typeof o.lon === "number" && Math.abs(o.lat) <= 90 && Math.abs(o.lon) <= 180) {
    return { lat: Math.round(o.lat * 100) / 100, lon: Math.round(o.lon * 100) / 100, city: typeof o.city === "string" ? o.city.slice(0, 80) : undefined };
  }
  if (typeof o.city === "string" && o.city.trim()) return { city: o.city.trim().slice(0, 80) };
  return null;
}

/**
 * Jarvis chat (board composer and the New widget screen).
 * 1. Intent: "widget" requests are routed to the design flow (event "route").
 * 2. Otherwise an agent answers, streaming text, with built-in tools (web
 *    search/fetch, time, location, calculator) and the user's connected apps.
 *    Reads run directly; writes stop at a confirm card; missing apps or
 *    location stop at a suggestion card and the client resumes afterwards.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Sign in first." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const messages: ChatTurn[] = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m: ChatTurn) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-14)
    .map((m: ChatTurn) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (messages.at(-1)?.role !== "user") return NextResponse.json({ message: "Ask Jarvis something." }, { status: 400 });
  const location = parseLocation(body.location);
  const timezone = typeof body.timezone === "string" && /^[A-Za-z_]+\/[A-Za-z_\/-]+$/.test(body.timezone) ? body.timezone : "UTC";
  const skipIntent = body.skipIntent === true;
  const designsShown = body.designsShown === true;
  const sel = await selectAi(user.id, "chat");

  return sseResponse(request, async (send, signal) => {
    // 1. Intent.
    const intent = skipIntent ? { intent: "answer" as const, toolkits: [] as ToolkitId[] } : await classifyIntent(user.id, messages, designsShown, signal);
    send("intent", intent);
    if (intent.intent === "widget") {
      send("route", { to: "widget" });
      return;
    }
    if (!sel) {
      send("meta", { provider: null, label: "Offline", model: null });
      send("text", { delta: "No AI provider is connected yet. Add ANTHROPIC_API_KEY (or GEMINI_API_KEY, or cloudhike AI) to .env.local." });
      return;
    }
    send("meta", sel);

    // 2. Context + tools.
    const name = (user.name || user.email.split("@")[0]).split(/\s+/)[0];
    const now = new Date();
    let boardContext = "";
    if (typeof body.boardId === "string") {
      const board = await getBoard(user.id, body.boardId).catch(() => null);
      if (board) {
        const widgets = await getWidgets(user.id, board.id).catch(() => []);
        boardContext = `The user is on their "${board.name}" board with widgets: ${widgets.map((w) => w.title).join(", ") || "none"}.`;
      }
    }
    const composio = composioConfigured();
    const connected = composio ? await connectedToolkits(user.id).catch(() => [] as ToolkitId[]) : [];
    const lastText = messages.at(-1)!.content;
    const needed = Array.from(new Set(intent.toolkits));
    const appTools: AgentTool[] = [];
    for (const t of needed.filter((t) => connected.includes(t)).slice(0, 2)) {
      appTools.push(...(await toolsFor(t).catch(() => [])));
    }
    const missing = needed.filter((t) => !connected.includes(t));
    const tools: ClientTool[] = [
      TOOL_TIME,
      TOOL_CALC,
      TOOL_LOCATION,
      TOOL_WEB_SEARCH,
      TOOL_WEB_FETCH,
      TOOL_CONNECT,
      ...appTools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters, status: TOOLKIT_BY_ID[t.toolkit].checking, toolkit: t.toolkit })),
    ];
    const appByName = new Map(appTools.map((t) => [t.name, t]));

    const system = [
      `You are Jarvis, a concise personal assistant on the user's dashboard ("Jarvis Board"). The user's first name is ${name}. Now: ${now.toISOString()} (user timezone ${timezone}).`,
      boardContext,
      "Answer the question directly in chat. Do not design widgets here; if a persistent widget would genuinely help, you may add one short last line starting with \"Widget idea:\".",
      "Use tools when they help: web search for anything current or factual (places, prices, news, weather, recommendations) and cite what you use; calculate for arithmetic; get_current_time for dates; get_user_location only when the answer depends on where the user is and no place was named.",
      location ? `The user's location: ${"lat" in location ? `${location.city ?? ""} (${location.lat}, ${location.lon})` : location.city}.` : "",
      composio
        ? `Connected apps: ${connected.map((c) => TOOLKIT_BY_ID[c].name).join(", ") || "none"}. ${missing.length ? `This request may need: ${missing.map((m) => TOOLKIT_BY_ID[m].name).join(", ")} (not connected) — call suggest_connect for it instead of guessing.` : ""} Reading app data is fine; anything that sends, creates, edits or deletes is confirmed by the user before it runs.`
        : "No apps (email, calendar…) can be connected yet; say so briefly if the user asks for their app data.",
      "Format: short paragraphs or '- ' bullets, plain text, no tables or headings. Put the most useful answer first.",
    ]
      .filter(Boolean)
      .join("\n");

    const execute = async (tool: string, args: Record<string, unknown>, sig: AbortSignal): Promise<ToolOutcome> => {
      switch (tool) {
        case "get_current_time":
          return { content: now.toLocaleString("en-US", { timeZone: timezone, dateStyle: "full", timeStyle: "short" }) + ` (${timezone})` };
        case "calculate":
          return { content: String(calculate(String(args.expression ?? ""))) };
        case "get_user_location":
          if (location) return { content: JSON.stringify(location) };
          return { halt: { event: "location", data: { reason: "To answer this I need your location." } } };
        case "web_search": {
          const r = await webSearch(String(args.query ?? lastText), sig);
          return { content: `${r.answer}\n\nSources:\n${r.sources.map((s) => `- ${s.title}: ${s.url}`).join("\n")}`, sources: r.sources };
        }
        case "web_fetch": {
          const p = await fetchPage(String(args.url ?? ""));
          return { content: `${p.title}\n${p.text}`, sources: [{ title: p.title, url: p.url }] };
        }
        case "suggest_connect": {
          const tk = isToolkitId(args.toolkit) ? args.toolkit : null;
          if (!tk) return { content: "Unknown app." };
          if (!composio) return { content: "App connections aren't set up on this server yet (COMPOSIO_API_KEY missing). Tell the user briefly." };
          if (connected.includes(tk)) return { content: `${TOOLKIT_BY_ID[tk].name} is already connected.` };
          return { halt: { event: "connect", data: { toolkit: tk, reason: typeof args.reason === "string" ? args.reason.slice(0, 160) : TOOLKIT_BY_ID[tk].why } } };
        }
        default: {
          const t = appByName.get(tool);
          if (!t) return { content: `Unknown tool ${tool}` };
          if (!t.readOnly) {
            return { halt: { event: "confirm", data: { tool: t.name, toolkit: t.toolkit, args, description: t.description.slice(0, 200) } } };
          }
          const res = await executeTool(user.id, tool, args);
          return { content: res.successful ? JSON.stringify(res.data ?? {}).slice(0, 10_000) : `Error: ${res.error ?? "failed"}` };
        }
      }
    };

    // Connect suggestions up front for apps the request needs but aren't connected.
    if (composio && missing.length && intent.intent === "action") {
      send("connect", { toolkit: missing[0], reason: TOOLKIT_BY_ID[missing[0]].why });
    }

    await runAgent(sel, { system, messages, tools, execute, signal, maxSteps: 6 }, (e) => {
      if (e.type === "text") send("text", { delta: e.delta });
      else if (e.type === "status") send("status", e);
      else if (e.type === "sources") send("sources", { items: e.items });
      else if (e.type === "halt") send(e.event, e.data);
      else if (e.type === "fallback") send("fallback", e.sel);
    });
  });
}
