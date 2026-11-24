import "server-only";
import { z } from "zod";
import { detectToolkits, isToolkitId, type ToolkitId } from "@/lib/integrations/catalog";
import { selectAi, streamText, type ChatTurn } from "./index";

/**
 * Intent routing, run before anything else in every Jarvis chat:
 * answer (questions, info, calculations) | widget (clearly wants something on
 * the board) | action (do something in a connected app) | clarify.
 */

export type Intent = { intent: "answer" | "widget" | "action" | "clarify"; toolkits: ToolkitId[] };

const IntentSchema = z.object({
  intent: z.enum(["answer", "widget", "action", "clarify"]),
  toolkits: z.array(z.string()).max(4).default([]),
});

const SYSTEM = `Classify the user's latest message in a personal-dashboard assistant. Reply with ONLY JSON: {"intent": "answer"|"widget"|"action"|"clarify", "toolkits": [...]}.
- "widget": they clearly want something persistent on their board: say widget/tracker/add to board/make me a … to track, or they are editing widget designs already shown (e.g. "make B more compact", "add a reset button").
- "answer": questions, information, recommendations, calculations, summaries, planning help ("best hotels near me", "what's 18% of 2450", "plan my day"). DEFAULT when unsure.
- "action": they want Jarvis to do something in an app now (send an email, create an event, post to Slack).
- "clarify": too vague to act on at all.
"toolkits": apps whose data the request needs, from: gmail, googlecalendar, notion, slack, github, googledrive, linear (empty if none).`;

const WIDGET_WORDS = /\b(widget|tracker|add (it |this |that )?to (my )?board|on (my )?board|make (me )?a .*(tracker|widget|list|timer|counter|log))\b/i;

function heuristic(text: string, designsShown: boolean): Intent {
  const toolkits = detectToolkits(text);
  if (designsShown && /\b(make|change|add|remove|use|turn|update)\b/i.test(text) && !/\?\s*$/.test(text)) return { intent: "widget", toolkits };
  if (WIDGET_WORDS.test(text)) return { intent: "widget", toolkits };
  if (/\b(send|email .* to|create (an? )?(event|meeting)|post (to|in) slack|schedule (a|an))\b/i.test(text)) return { intent: "action", toolkits };
  return { intent: "answer", toolkits };
}

export async function classifyIntent(userId: string, history: ChatTurn[], designsShown: boolean, signal?: AbortSignal): Promise<Intent> {
  const last = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  const fallback = heuristic(last, designsShown);
  const sel = await selectAi(userId, "intent");
  if (!sel) return fallback;
  const recent = history.slice(-6).map((m) => `${m.role === "user" ? "User" : "Jarvis"}: ${m.content.slice(0, 600)}`).join("\n");
  let text = "";
  try {
    for await (const t of streamText(sel, {
      feature: "intent",
      system: SYSTEM,
      messages: [{ role: "user", content: `${designsShown ? "(Widget designs are currently shown to the user.)\n" : ""}Conversation:\n${recent}` }],
      maxTokens: 200,
      effort: "low",
      signal,
    })) {
      text += t;
    }
    const j = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const p = IntentSchema.safeParse(JSON.parse(j));
    if (!p.success) return fallback;
    const toolkits = Array.from(new Set([...p.data.toolkits.filter(isToolkitId), ...fallback.toolkits])) as ToolkitId[];
    return { intent: p.data.intent, toolkits };
  } catch {
    return fallback;
  }
}
