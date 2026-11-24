import "server-only";
import OpenAI from "openai";
import type { TextStreamer } from "../types";

// cloudhike AI models: OpenAI-compatible endpoint, server only.
const g = globalThis as unknown as { jbCloudhikeAi?: OpenAI };
const client = () => (g.jbCloudhikeAi ??= new OpenAI({ baseURL: process.env.AI_BASE_URL, apiKey: process.env.AI_API_KEY }));

export const streamCloudhike: TextStreamer = async function* ({ system, messages, model, maxTokens, signal }) {
  const stream = await client().chat.completions.create(
    {
      model,
      stream: true,
      max_tokens: maxTokens,
      messages: [{ role: "system", content: system }, ...messages.map((m) => ({ role: m.role, content: m.content }))],
    },
    { signal },
  );
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
};
