import "server-only";
import { getAiProviderSetting } from "@/lib/data";
import { FEATURE_TIER, PROVIDER_LABEL, isProvider, modelFor, providerConfigured, resolveProvider, type Feature, type Provider } from "./config";
import { streamAnthropic } from "./providers/anthropic";
import { streamCloudhike } from "./providers/cloudhike";
import { streamGemini } from "./providers/gemini";
import type { ChatTurn, TextStreamer } from "./types";

export type { ChatTurn } from "./types";

const STREAMERS: Record<Provider, TextStreamer> = {
  anthropic: streamAnthropic,
  gemini: streamGemini,
  cloudhike: streamCloudhike,
};

export type AiSelection = { provider: Provider; model: string; label: string };

/** The user's saved provider (cloudhike DB), else the env default, resolved to one that has a key. */
export async function selectAi(userId: string, feature: Feature): Promise<AiSelection | null> {
  const saved = await getAiProviderSetting(userId).catch(() => null);
  const provider = resolveProvider(isProvider(saved) ? saved : null);
  if (!provider) return null;
  return { provider, model: modelFor(provider, FEATURE_TIER[feature]), label: PROVIDER_LABEL[provider] };
}

/**
 * Streams text from the selected provider. If the provider fails before the
 * first token (bad key, quota, outage) and cloudhike AI is configured, it
 * retries once on cloudhike and calls onFallback so the UI can show it.
 */
export async function* streamText(
  sel: AiSelection,
  opts: { system: string; messages: ChatTurn[]; maxTokens: number; effort?: "low" | "medium" | "high"; signal?: AbortSignal; feature: Feature },
  onFallback?: (sel: AiSelection) => void,
): AsyncGenerator<string> {
  let started = false;
  try {
    for await (const t of STREAMERS[sel.provider]({ ...opts, model: sel.model })) {
      started = true;
      yield t;
    }
  } catch (err) {
    if (started || opts.signal?.aborted || sel.provider === "cloudhike" || !providerConfigured("cloudhike")) throw err;
    console.warn(`[jarvis-ai] ${sel.label} failed (${err instanceof Error ? err.message : err}); retrying on cloudhike AI.`);
    const fb: AiSelection = { provider: "cloudhike", model: modelFor("cloudhike", FEATURE_TIER[opts.feature]), label: PROVIDER_LABEL.cloudhike };
    onFallback?.(fb);
    yield* STREAMERS.cloudhike({ ...opts, model: fb.model });
  }
}
