import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { selectAi, streamText, type AiSelection, type ChatTurn } from "@/lib/ai";
import { offlineDesigns } from "@/lib/ai/features";
import {
  createPlanSplitter,
  DESIGN_SPEC_SYSTEM,
  designPrompt,
  parsePlan,
  parseSpec,
  resolveTargets,
  specToDraft,
  UNDERSTAND_SYSTEM,
} from "@/lib/ai/widget-design";
import { sanitizeSpec, type WidgetSpec } from "@/lib/spec/schema";
import { sseResponse, type SendEvent } from "@/lib/sse";
import { TOOLKIT_BY_ID, isToolkitId } from "@/lib/integrations/catalog";
import { composioConfigured, connectedToolkits } from "@/lib/integrations/composio";

export const dynamic = "force-dynamic";

const LETTERS = ["A", "B", "C"] as const;

function parseHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is ChatTurn => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string")
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
}

type PrevOption = { label: string; spec: WidgetSpec } | null;

function parsePrevious(raw: unknown): PrevOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 3).map((o) => {
    const spec = sanitizeSpec((o as { config?: { spec?: unknown } })?.config?.spec);
    return spec ? { label: String((o as { label?: unknown }).label ?? spec.title).slice(0, 40), spec } : null;
  });
}

/** Generates one spec, retrying once if the model returns something invalid. */
async function generateSpec(sel: AiSelection, prompt: string, signal: AbortSignal, send: SendEvent): Promise<WidgetSpec | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let text = "";
    for await (const chunk of streamText(
      sel,
      { feature: "designs", system: DESIGN_SPEC_SYSTEM, messages: [{ role: "user", content: attempt ? `${prompt}\n\nReturn valid JSON for the WidgetSpec only.` : prompt }], maxTokens: 6000, effort: "low", signal },
      (fb) => send("fallback", fb),
    )) {
      text += chunk;
    }
    const spec = parseSpec(text);
    if (spec) return spec;
  }
  return null;
}

/**
 * Create-widget flow, streamed as Server-Sent Events:
 * 1. "text": Jarvis's understanding of the request, token by token.
 * 2. "questions" (and stop) when key details are genuinely ambiguous, or
 *    "plan" with three design approaches.
 * 3. "option": each newly generated, validated widget spec as it finishes
 *    (designs are generated in parallel; revisions regenerate only those asked).
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Sign in first." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const history = parseHistory(body.history);
  const lastUser = [...history].reverse().find((m) => m.role === "user")?.content;
  if (!lastUser) return NextResponse.json({ message: "Tell Jarvis what you want on your board." }, { status: 400 });
  const previous = parsePrevious(body.previous);
  const selected = Number.isInteger(body.selected) && body.selected >= 0 && body.selected < 3 && previous[body.selected] ? (body.selected as number) : null;
  const boardName = typeof body.boardName === "string" ? body.boardName.slice(0, 60) : null;
  const sel = await selectAi(user.id, "designs");

  return sseResponse(request, async (send, signal) => {
    if (!sel) {
      const off = offlineDesigns(lastUser);
      send("meta", { provider: null, label: "Offline", model: null });
      send("text", { delta: off.reply });
      send("plan", { understood: lastUser, approaches: off.options.map((o) => ({ label: o.label, idea: "" })), revise: null });
      off.options.forEach((draft, index) => send("option", { index, draft }));
      return;
    }
    send("meta", sel);

    // Step A: understand (and resolve edit targets) with full context:
    // the whole conversation, the target board, every shown design's spec,
    // and which design the user has selected.
    const transcript = history.map((m) => `${m.role === "user" ? "User" : "Jarvis"}: ${m.content}`).join("\n");
    const context: string[] = [];
    if (boardName) context.push(`Target board: ${boardName}`);
    if (previous.some(Boolean)) {
      context.push(
        "Designs currently shown:\n" +
          previous.map((p, i) => (p ? `${LETTERS[i]} — "${p.label}" (title "${p.spec.title}"): ${JSON.stringify(p.spec.root).slice(0, 1500)}` : `${LETTERS[i]} — (none)`)).join("\n"),
      );
      context.push(selected !== null ? `SELECTED design: ${LETTERS[selected]} ("${previous[selected]!.label}")` : "SELECTED design: none");
    }
    const splitter = createPlanSplitter((delta) => send("text", { delta }));
    for await (const chunk of streamText(
      sel,
      {
        feature: "designs",
        system: UNDERSTAND_SYSTEM,
        messages: [{ role: "user", content: `Conversation:\n${transcript}${context.length ? `\n\n${context.join("\n\n")}` : ""}` }],
        maxTokens: 2000,
        effort: "low",
        signal,
      },
      (fb) => send("fallback", fb),
    )) {
      splitter.push(chunk);
    }
    const plan = parsePlan(splitter.end());
    if (!plan) throw new Error("Jarvis couldn't work out that request. Try describing it another way.");

    // Suggest connecting apps the widget needs (designs still use them; they show a connect prompt until then).
    if (composioConfigured()) {
      const connected = await connectedToolkits(user.id).catch(() => [] as string[]);
      for (const t of plan.toolkits.filter(isToolkitId).filter((t) => !connected.includes(t)).slice(0, 2)) {
        send("connect", { toolkit: t, reason: TOOLKIT_BY_ID[t].why });
      }
    }

    const resolved = resolveTargets(plan, selected, previous.map(Boolean));
    if (resolved && "ask" in resolved) {
      send("questions", {
        questions: [{ question: "Which design should I change?", options: previous.map((p, i) => (p ? `Design ${LETTERS[i]} · ${p.label}` : null)).filter(Boolean) }],
        kind: "pickDesign",
      });
      return;
    }
    if (!resolved && plan.needsClarification && plan.questions.length) {
      send("questions", { questions: plan.questions });
      return;
    }

    // Step B: design. Edits regenerate only the resolved designs; the rest are kept.
    const editIdx = resolved?.targets ?? null;
    const approaches = [0, 1, 2].map(
      (i) => plan.approaches[i] ?? (previous[i] ? { label: previous[i]!.label, idea: "Keep this design's approach." } : { label: `Design ${LETTERS[i]}`, idea: "A distinct, clean layout for this need." }),
    );
    send("plan", { understood: plan.understood, approaches, revise: editIdx, change: plan.edit?.change ?? null });

    const brief = plan.understood || lastUser;
    const change = plan.edit?.change || lastUser;
    const jobs = [0, 1, 2].map(async (i) => {
      const prev = previous[i];
      if (editIdx && !editIdx.includes(i)) {
        if (prev) send("option", { index: i, draft: specToDraft(prev.spec, prev.label, brief) });
        return Boolean(prev);
      }
      const prompt = designPrompt(brief, approaches[i], editIdx && prev ? { previous: prev.spec, change, letter: LETTERS[i] } : undefined);
      const spec = await generateSpec(sel, prompt, signal, send);
      if (spec) send("option", { index: i, draft: specToDraft(spec, approaches[i].label, brief) });
      else send("optionFailed", { index: i });
      return Boolean(spec);
    });
    const results = await Promise.all(jobs);
    if (!results.some(Boolean)) throw new Error("Jarvis couldn't produce a valid design. Try again.");
  });
}
