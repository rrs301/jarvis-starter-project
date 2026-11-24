import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { selectAi, streamText, type ChatTurn } from "@/lib/ai";
import { CHAT_SYSTEM } from "@/lib/ai/features";
import { sseResponse } from "@/lib/sse";
import { getBoard, getWidgets } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Board composer: streams Jarvis's answer token by token. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Sign in first." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const messages: ChatTurn[] = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m: ChatTurn) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-12)
    .map((m: ChatTurn) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (messages.at(-1)?.role !== "user") return NextResponse.json({ message: "Ask Jarvis something." }, { status: 400 });
  const sel = await selectAi(user.id, "chat");
  // Context: the board the user is on and the widgets on it (titles + types only).
  let boardContext = "";
  if (typeof body.boardId === "string") {
    const board = await getBoard(user.id, body.boardId).catch(() => null);
    if (board) {
      const widgets = await getWidgets(user.id, board.id).catch(() => []);
      boardContext = `\nThe user is on their "${board.name}" board. Widgets on it: ${widgets.map((w) => `${w.title} (${w.type === "custom" ? "custom" : w.type})`).join(", ") || "none"}.`;
    }
  }
  const name = (user.name || user.email.split("@")[0]).split(/\s+/)[0];
  const today = new Date().toDateString();

  return sseResponse(request, async (send, signal) => {
    if (!sel) {
      send("meta", { provider: null, label: "Offline", model: null });
      send("text", { delta: "No AI provider is connected yet. Add ANTHROPIC_API_KEY (or GEMINI_API_KEY, or cloudhike AI) to .env.local and I'll be able to answer." });
      return;
    }
    send("meta", sel);
    for await (const delta of streamText(
      sel,
      { feature: "chat", system: `${CHAT_SYSTEM}\nThe user's first name is ${name}. Today is ${today}.${boardContext}`, messages, maxTokens: 2000, effort: "low", signal },
      (fb) => send("fallback", fb),
    )) {
      send("text", { delta });
    }
  });
}
