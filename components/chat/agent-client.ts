"use client";

import { streamSSE } from "@/lib/sse-client";
import type { ToolkitId } from "@/lib/integrations/catalog";

export type Status = { id: string; label: string; state: "start" | "done" | "error"; toolkit?: string };
export type Source = { title: string; url: string };
export type Halt =
  | { kind: "location"; reason: string }
  | { kind: "connect"; toolkit: ToolkitId; reason: string }
  | { kind: "confirm"; tool: string; toolkit: ToolkitId; args: Record<string, unknown>; description: string; done?: string; failed?: string };

/** One streamed Jarvis answer. */
export type AnswerTurn = {
  role: "answer";
  content: string;
  streaming: boolean;
  statuses: Status[];
  sources: Source[];
  halt: Halt | null;
  /** Connect suggestion shown alongside the answer (e.g. an action needs Gmail). */
  connect: { toolkit: ToolkitId; reason: string } | null;
  via?: string;
  error?: string;
  /** The question this answers (used by "Turn into a widget" and resume). */
  question: string;
};

export const newAnswer = (question: string): AnswerTurn => ({ role: "answer", content: "", streaming: true, statuses: [], sources: [], halt: null, connect: null, question });

function savedLocation(): unknown {
  try {
    const raw = localStorage.getItem("jb-location");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveLocation(loc: { lat: number; lon: number } | { city: string }) {
  try {
    localStorage.setItem("jb-location", JSON.stringify(loc));
  } catch {
    /* storage blocked: location is still sent for this request */
  }
  (window as unknown as { __jbLoc?: unknown }).__jbLoc = loc;
}

/**
 * Streams /api/jarvis/agent. Returns "widget" if Jarvis routed the request to
 * the widget designer instead of answering.
 */
export async function streamAgent(
  body: { messages: Array<{ role: "user" | "assistant"; content: string }>; boardId?: string; skipIntent?: boolean; designsShown?: boolean },
  update: (fn: (t: AnswerTurn) => AnswerTurn) => void,
  signal: AbortSignal,
): Promise<"widget" | "answer"> {
  let routed: "widget" | "answer" = "answer";
  await streamSSE(
    "/api/jarvis/agent",
    {
      ...body,
      location: (window as unknown as { __jbLoc?: unknown }).__jbLoc ?? savedLocation(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    (event, data) => {
      switch (event) {
        case "route":
          routed = "widget";
          break;
        case "meta":
          update((t) => ({ ...t, via: String(data.label ?? "") }));
          break;
        case "fallback":
          update((t) => ({ ...t, via: `${data.label} (fallback)` }));
          break;
        case "text":
          update((t) => ({ ...t, content: t.content + String(data.delta) }));
          break;
        case "status": {
          const s = data as unknown as Status;
          update((t) => {
            const i = t.statuses.findIndex((x) => x.id === s.id);
            if (i < 0) return s.label ? { ...t, statuses: [...t.statuses, s] } : t;
            const next = [...t.statuses];
            next[i] = { ...next[i], state: s.state };
            return { ...t, statuses: next };
          });
          break;
        }
        case "sources": {
          const items = (data.items as Source[]) ?? [];
          update((t) => {
            const seen = new Set(t.sources.map((s) => s.url));
            return { ...t, sources: [...t.sources, ...items.filter((s) => !seen.has(s.url) && seen.add(s.url))].slice(0, 8) };
          });
          break;
        }
        case "location":
          update((t) => ({ ...t, halt: { kind: "location", reason: String(data.reason ?? "") } }));
          break;
        case "connect":
          update((t) =>
            t.statuses.length || t.content
              ? { ...t, halt: { kind: "connect", toolkit: data.toolkit as ToolkitId, reason: String(data.reason ?? "") } }
              : { ...t, connect: { toolkit: data.toolkit as ToolkitId, reason: String(data.reason ?? "") } },
          );
          break;
        case "confirm":
          update((t) => ({
            ...t,
            halt: { kind: "confirm", tool: String(data.tool), toolkit: data.toolkit as ToolkitId, args: (data.args as Record<string, unknown>) ?? {}, description: String(data.description ?? "") },
          }));
          break;
        case "error":
          update((t) => ({ ...t, error: String(data.message) }));
          break;
      }
    },
    signal,
  );
  return routed;
}
