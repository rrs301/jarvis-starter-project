import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI, type Content, type Part } from "@google/genai";
import OpenAI from "openai";
import { FEATURE_TIER, PROVIDER_LABEL, modelFor, providerConfigured } from "./config";
import type { AiSelection } from "./index";
import type { ChatTurn } from "./types";
import type { ClientTool, Source } from "./agent-tools";

/**
 * Tool-using agent loop over the three providers. Text streams as it is
 * generated; client tools run on our server between turns; a tool may "halt"
 * the run (needs confirmation, location permission, or an app connection).
 */

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "status"; id: string; label: string; state: "start" | "done" | "error"; toolkit?: string }
  | { type: "sources"; items: Source[] }
  | { type: "halt"; event: string; data: Record<string, unknown> }
  | { type: "fallback"; sel: AiSelection };

export type ToolOutcome = { content: string; sources?: Source[] } | { halt: { event: string; data: Record<string, unknown> } };

export type AgentOptions = {
  system: string;
  messages: ChatTurn[];
  tools: ClientTool[];
  execute: (name: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<ToolOutcome>;
  signal: AbortSignal;
  maxSteps?: number;
  maxTokens?: number;
};

type Emit = (e: AgentEvent) => void;

async function runClientTools(
  calls: Array<{ id: string; name: string; args: Record<string, unknown> }>,
  opts: AgentOptions,
  emit: Emit,
): Promise<{ results: Array<{ id: string; name: string; content: string }>; halted: boolean }> {
  const tools = new Map(opts.tools.map((t) => [t.name, t]));
  const results: Array<{ id: string; name: string; content: string }> = [];
  for (const c of calls) {
    const t = tools.get(c.name);
    const sid = `${c.name}-${c.id}`;
    emit({ type: "status", id: sid, label: t?.status ?? "Working…", state: "start", toolkit: t?.toolkit });
    let out: ToolOutcome;
    try {
      out = t ? await opts.execute(c.name, c.args ?? {}, opts.signal) : { content: `Unknown tool ${c.name}` };
    } catch (err) {
      out = { content: `Error: ${err instanceof Error ? err.message : "tool failed"}` };
    }
    if ("halt" in out) {
      emit({ type: "status", id: sid, label: t?.status ?? "Working…", state: "done" });
      emit({ type: "halt", event: out.halt.event, data: out.halt.data });
      return { results, halted: true };
    }
    if (out.sources?.length) emit({ type: "sources", items: out.sources });
    emit({ type: "status", id: sid, label: t?.status ?? "Working…", state: out.content.startsWith("Error:") ? "error" : "done" });
    results.push({ id: c.id, name: c.name, content: out.content.slice(0, 12_000) });
  }
  return { results, halted: false };
}

/* ---------- Anthropic (native web search + fetch) ---------- */

const ga = globalThis as unknown as { jbAgentAnthropic?: Anthropic; jbAgentGemini?: GoogleGenAI; jbAgentOpenAI?: OpenAI };

async function anthropicAgent(model: string, opts: AgentOptions, emit: Emit) {
  const client = (ga.jbAgentAnthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));
  const fallback = /^claude-(sonnet|opus)-5-5/.test(model);
  const tools = [
    ...opts.tools
      .filter((t) => t.name !== "web_search" && t.name !== "web_fetch")
      .map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters as Anthropic.Beta.BetaTool["input_schema"] })),
    { type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 5 },
    { type: "web_fetch_20260209" as const, name: "web_fetch" as const, max_uses: 3 },
  ];
  const messages: Anthropic.Beta.BetaMessageParam[] = opts.messages.map((m) => ({ role: m.role, content: m.content }));
  for (let step = 0; step < (opts.maxSteps ?? 6); step++) {
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: opts.maxTokens ?? 8000,
        system: opts.system,
        messages,
        tools: tools as Anthropic.Beta.BetaToolUnion[],
        output_config: { effort: "low" },
        ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      },
      { signal: opts.signal },
    );
    for await (const ev of stream) {
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") emit({ type: "text", delta: ev.delta.text });
      if (ev.type === "content_block_start") {
        const b = ev.content_block as { type: string; id?: string; name?: string; tool_use_id?: string };
        if (b.type === "server_tool_use" && b.id) {
          const label = b.name === "web_fetch" ? "Reading a page…" : "Searching the web…";
          emit({ type: "status", id: b.id, label, state: "start" });
        } else if (b.tool_use_id && b.type.endsWith("_tool_result")) {
          emit({ type: "status", id: b.tool_use_id, label: "", state: "done" });
        }
      }
    }
    const msg = await stream.finalMessage();
    // Sources: citations on text blocks, else the search results themselves.
    const sources: Source[] = [];
    const host = (u: string) => {
      try {
        return new URL(u).hostname.replace(/^www\./, "");
      } catch {
        return u;
      }
    };
    for (const b of msg.content) {
      if (b.type === "text" && Array.isArray(b.citations)) {
        for (const c of b.citations) {
          const cc = c as { url?: string; title?: string | null };
          if (cc.url) sources.push({ url: cc.url, title: cc.title || host(cc.url) });
        }
      }
    }
    if (!sources.length) {
      for (const b of msg.content) {
        const r = b as { type: string; content?: unknown };
        if (r.type === "web_search_tool_result" && Array.isArray(r.content)) {
          for (const it of r.content as Array<{ url?: string; title?: string }>) if (it.url) sources.push({ url: it.url, title: it.title || host(it.url) });
        }
      }
    }
    if (sources.length) emit({ type: "sources", items: sources });
    if (msg.stop_reason === "refusal") throw new Error("Claude declined this request. Try rephrasing it.");
    messages.push({ role: "assistant", content: msg.content as Anthropic.Beta.BetaContentBlockParam[] });
    if (msg.stop_reason === "pause_turn") continue;
    const uses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (!uses.length) return;
    if (msg.stop_reason === "max_tokens") throw new Error("Jarvis ran out of room mid-answer. Try a narrower question.");
    const { results, halted } = await runClientTools(uses.map((u) => ({ id: u.id, name: u.name, args: (u.input as Record<string, unknown>) ?? {} })), opts, emit);
    if (halted) return;
    messages.push({ role: "user", content: results.map((r) => ({ type: "tool_result" as const, tool_use_id: r.id, content: r.content })) });
  }
}

/* ---------- OpenAI-compatible (cloudhike) ---------- */

async function openaiAgent(model: string, opts: AgentOptions, emit: Emit) {
  const client = (ga.jbAgentOpenAI ??= new OpenAI({ baseURL: process.env.AI_BASE_URL, apiKey: process.env.AI_API_KEY }));
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: opts.system },
    ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  const tools: OpenAI.Chat.ChatCompletionTool[] = opts.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
  for (let step = 0; step < (opts.maxSteps ?? 6); step++) {
    const stream = await client.chat.completions.create({ model, messages, tools, stream: true, max_tokens: opts.maxTokens ?? 4000 }, { signal: opts.signal });
    let text = "";
    const calls: Array<{ id: string; name: string; args: string }> = [];
    for await (const chunk of stream) {
      const d = chunk.choices[0]?.delta;
      if (d?.content) {
        text += d.content;
        emit({ type: "text", delta: d.content });
      }
      for (const tc of d?.tool_calls ?? []) {
        const slot = (calls[tc.index] ??= { id: tc.id ?? `call_${step}_${tc.index}`, name: "", args: "" });
        if (tc.id) slot.id = tc.id;
        if (tc.function?.name) slot.name += tc.function.name;
        if (tc.function?.arguments) slot.args += tc.function.arguments;
      }
    }
    const done = calls.filter(Boolean);
    if (!done.length) return;
    messages.push({ role: "assistant", content: text || null, tool_calls: done.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.args || "{}" } })) });
    const parsed = done.map((c) => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(c.args || "{}");
      } catch {
        /* invalid JSON args: run with none, the tool will report what's missing */
      }
      return { id: c.id, name: c.name, args };
    });
    const { results, halted } = await runClientTools(parsed, opts, emit);
    if (halted) return;
    for (const r of results) messages.push({ role: "tool", tool_call_id: r.id, content: r.content });
  }
}

/* ---------- Gemini ---------- */

async function geminiAgent(model: string, opts: AgentOptions, emit: Emit) {
  const client = (ga.jbAgentGemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));
  const contents: Content[] = opts.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const functionDeclarations = opts.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters }));
  for (let step = 0; step < (opts.maxSteps ?? 6); step++) {
    const stream = await client.models.generateContentStream({
      model,
      contents,
      config: { systemInstruction: opts.system, maxOutputTokens: opts.maxTokens ?? 4000, abortSignal: opts.signal, tools: [{ functionDeclarations }] },
    });
    const parts: Part[] = [];
    for await (const chunk of stream) {
      for (const p of chunk.candidates?.[0]?.content?.parts ?? []) {
        parts.push(p);
        if (p.text && !p.thought) emit({ type: "text", delta: p.text });
      }
    }
    // Keep the model's parts (including thought signatures) unchanged in the history.
    contents.push({ role: "model", parts });
    const calls = parts.filter((p) => p.functionCall).map((p, i) => ({ id: p.functionCall!.id ?? `fc_${step}_${i}`, name: p.functionCall!.name ?? "", args: (p.functionCall!.args as Record<string, unknown>) ?? {} }));
    if (!calls.length) return;
    const { results, halted } = await runClientTools(calls, opts, emit);
    if (halted) return;
    contents.push({ role: "user", parts: results.map((r) => ({ functionResponse: { id: r.id, name: r.name, response: { result: r.content } } })) });
  }
}

/**
 * Runs the agent on the selected provider. If it fails before producing any
 * output and cloudhike AI is configured, retries once on cloudhike.
 */
export async function runAgent(sel: AiSelection, opts: AgentOptions, emit: (e: AgentEvent) => void) {
  let produced = false;
  const wrapped: Emit = (e) => {
    if (e.type === "text" && e.delta) produced = true;
    if (e.type === "status" || e.type === "halt") produced = true;
    emit(e);
  };
  const run = (p: AiSelection) =>
    p.provider === "anthropic" ? anthropicAgent(p.model, opts, wrapped) : p.provider === "gemini" ? geminiAgent(p.model, opts, wrapped) : openaiAgent(p.model, opts, wrapped);
  try {
    await run(sel);
  } catch (err) {
    if (produced || opts.signal.aborted || sel.provider === "cloudhike" || !providerConfigured("cloudhike")) throw err;
    console.warn(`[jarvis-ai] ${sel.label} agent failed (${err instanceof Error ? err.message : err}); retrying on cloudhike AI.`);
    const fb: AiSelection = { provider: "cloudhike", model: modelFor("cloudhike", FEATURE_TIER.chat), label: PROVIDER_LABEL.cloudhike };
    emit({ type: "fallback", sel: fb });
    await run(fb);
  }
}
