import "server-only";
import { TEMPLATES } from "@/lib/registry";
import type { WidgetDraft } from "@/lib/types";

/* ---------- Offline fallback for the create-widget flow ---------- */

/** Deterministic designs so the flow works when no AI provider is configured. */
export function offlineDesigns(prompt: string): { reply: string; options: WidgetDraft[] } {
  const p = prompt.toLowerCase();
  let types: WidgetDraft["type"][] = ["notes", "today", "ideas"];
  if (/idea|brainstorm|content|video|topic/.test(p)) types = ["ideas", "notes", "today"];
  else if (/focus|pomodoro|timer|deep work/.test(p)) types = ["focus", "weekly", "today"];
  else if (/week|habit|track|chart|progress/.test(p)) types = ["weekly", "focus", "notes"];
  else if (/plan|day|schedule|calendar|task/.test(p)) types = ["today", "notes", "focus"];
  else if (/mail|inbox|email/.test(p)) types = ["inbox", "notes", "today"];
  const sizes: WidgetDraft["size"][] = ["M", "S", "L"];
  return {
    reply: "No AI provider is connected yet, so here are three starter designs based on your request.",
    options: types.map((t, i) => ({
      type: t,
      title: TEMPLATES[t].name,
      size: sizes[i],
      config: { ...TEMPLATES[t].defaultConfig },
      context: { intent: prompt },
      label: ["Classic", "Compact", "Wide"][i] + " " + TEMPLATES[t].name.toLowerCase(),
    })),
  };
}

/* ---------- Idea Generator ---------- */

export const IDEAS_SYSTEM =
  "You generate short, specific, non-generic ideas. Output one idea per line, plain text, no numbering, no bullets, no blank lines, no intro or outro. Each idea under 90 characters.";

export function createLineParser(onLine: (l: string) => void, max: number) {
  let buf = "";
  let n = 0;
  const emit = (raw: string) => {
    const l = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/\*\*/g, "").trim();
    if (l && n < max) {
      n++;
      onLine(l.slice(0, 140));
    }
  };
  return {
    push(chunk: string) {
      buf += chunk;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        emit(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    },
    end() {
      emit(buf);
      buf = "";
      return n;
    },
  };
}

/* ---------- Board chat ---------- */

export const CHAT_SYSTEM = `You are Jarvis, a friendly, concise personal assistant living on the user's dashboard ("Jarvis Board").
Help with planning, research and quick questions. Keep answers short and scannable: a few sentences or a short list, plain text with simple "- " bullets, no headings or tables.
You can't yet read the user's email or calendar (those connections come later); don't pretend you can.
If a widget would help (notes, idea generator, focus timer, today timeline, weekly bars), suggest it in one short final line starting with "Widget idea:".`;
