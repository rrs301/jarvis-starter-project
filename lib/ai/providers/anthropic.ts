import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { TextStreamer } from "../types";

const g = globalThis as unknown as { jbAnthropic?: Anthropic };
const client = () => (g.jbAnthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));

// Server-side refusal fallback is supported on Sonnet 5.5 / Opus 5.5, not Haiku.
const supportsFallback = (model: string) => /^claude-(sonnet|opus)-5-5/.test(model);

export const streamAnthropic: TextStreamer = async function* ({ system, messages, model, maxTokens, effort, signal }) {
  const fallback = supportsFallback(model);
  const stream = client().beta.messages.stream(
    {
      model,
      max_tokens: maxTokens,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      output_config: { effort: effort ?? "medium" },
      ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    },
    { signal },
  );
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") throw new Error("Claude declined this request. Try rephrasing it.");
};
