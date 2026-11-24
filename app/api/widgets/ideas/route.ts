import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { selectAi, streamText } from "@/lib/ai";
import { createLineParser, IDEAS_SYSTEM } from "@/lib/ai/features";
import { sseResponse } from "@/lib/sse";

export const dynamic = "force-dynamic";

/**
 * Streams short items one per line (fast model tier). Used by the Idea
 * Generator (`topic`) and by custom widgets' AI actions (`prompt`).
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Sign in first." }, { status: 401 });
  const { topic, prompt, count, avoid, widget } = await request.json().catch(() => ({}));
  const isPrompt = typeof prompt === "string" && prompt.trim().length > 0;
  const subject = String(isPrompt ? prompt : (topic ?? "")).trim().slice(0, 300);
  if (!subject) return NextResponse.json({ message: "Add a topic." }, { status: 400 });
  const n = Math.min(Math.max(Number(count) || 5, 1), 10);
  const avoidList: string[] = Array.isArray(avoid) ? avoid.filter((a: unknown) => typeof a === "string").slice(0, 30).map((a: string) => a.slice(0, 140)) : [];
  const widgetName = typeof widget === "string" ? widget.slice(0, 80) : null;
  const content = [
    widgetName ? `Widget: "${widgetName}"` : null,
    isPrompt ? `Write exactly ${n} short items for this request: ${subject}` : `Give ${n} fresh ideas for: ${subject}`,
    avoidList.length ? `Already in the list (do not repeat or rephrase these):\n- ${avoidList.join("\n- ")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
  const sel = await selectAi(user.id, "ideas");

  return sseResponse(request, async (send, signal) => {
    if (!sel) {
      send("meta", { provider: null, label: "Offline", model: null });
      for (let i = 1; i <= n; i++) send("idea", { text: `${subject.slice(0, 60)}: item ${i} (connect an AI provider)` });
      return;
    }
    send("meta", sel);
    const parser = createLineParser((text) => send("idea", { text }), n);
    for await (const chunk of streamText(
      sel,
      { feature: "ideas", system: IDEAS_SYSTEM, messages: [{ role: "user", content }], maxTokens: 1500, effort: "low", signal },
      (fb) => send("fallback", fb),
    )) {
      parser.push(chunk);
    }
    if (parser.end() === 0) throw new Error("Nothing came back. Try a more specific request.");
  });
}
