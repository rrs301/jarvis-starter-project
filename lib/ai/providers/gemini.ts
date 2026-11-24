import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { TextStreamer } from "../types";

const g = globalThis as unknown as { jbGemini?: GoogleGenAI };
const client = () => (g.jbGemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

export const streamGemini: TextStreamer = async function* ({ system, messages, model, maxTokens, signal }) {
  const stream = await client().models.generateContentStream({
    model,
    contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    config: { systemInstruction: system, maxOutputTokens: maxTokens, abortSignal: signal },
  });
  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) yield text;
  }
};
