import "server-only";

/**
 * AI provider configuration. One place for provider + model selection.
 *
 * Env (all optional except a key for the provider you want to use):
 *   AI_PROVIDER         anthropic | gemini | cloudhike   (default: anthropic)
 *   ANTHROPIC_API_KEY   ANTHROPIC_MODEL (default claude-sonnet-5-5)
 *   ANTHROPIC_FAST_MODEL (default claude-haiku-5-5)  ANTHROPIC_HEAVY_MODEL (default claude-opus-5-5)
 *   GEMINI_API_KEY      GEMINI_MODEL (default gemini-4-hydrogen)  GEMINI_FAST_MODEL (default gemini-3.5-flash-lite)
 *   AI_BASE_URL / AI_API_KEY  cloudhike AI (OpenAI-compatible)  AI_MODEL / AI_FAST_MODEL
 */

export const PROVIDERS = ["anthropic", "gemini", "cloudhike"] as const;
export type Provider = (typeof PROVIDERS)[number];

/** Model tier per feature: fast for cheap/quick calls, heavy for agent work. */
export type Tier = "default" | "fast" | "heavy";
export type Feature = "chat" | "designs" | "ideas" | "agent" | "intent";

export const FEATURE_TIER: Record<Feature, Tier> = {
  chat: "default",
  designs: "default",
  ideas: "fast",
  agent: "heavy",
  intent: "fast",
};

export const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  cloudhike: "cloudhike AI",
};

const env = (k: string) => process.env[k]?.trim() || undefined;

export function isProvider(v: unknown): v is Provider {
  return typeof v === "string" && (PROVIDERS as readonly string[]).includes(v);
}

export function providerConfigured(p: Provider): boolean {
  if (p === "anthropic") return Boolean(env("ANTHROPIC_API_KEY"));
  if (p === "gemini") return Boolean(env("GEMINI_API_KEY"));
  return Boolean(env("AI_BASE_URL") && env("AI_API_KEY"));
}

export function defaultProvider(): Provider {
  const p = env("AI_PROVIDER");
  return isProvider(p) ? p : "anthropic";
}

export function modelFor(p: Provider, tier: Tier): string {
  if (p === "anthropic") {
    if (tier === "fast") return env("ANTHROPIC_FAST_MODEL") ?? "claude-haiku-5-5";
    if (tier === "heavy") return env("ANTHROPIC_HEAVY_MODEL") ?? "claude-opus-5-5";
    return env("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";
  }
  if (p === "gemini") {
    if (tier === "fast") return env("GEMINI_FAST_MODEL") ?? "gemini-3.5-flash-lite";
    return env("GEMINI_MODEL") ?? "gemini-4-hydrogen";
  }
  if (tier === "fast") return env("AI_FAST_MODEL") ?? "anthropic/claude-haiku-5.5";
  return env("AI_MODEL") ?? "anthropic/claude-sonnet-5.5";
}

const warned = new Set<string>();
function warnOnce(key: string, msg: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[jarvis-ai] ${msg}`);
}

/**
 * Picks the provider to use: the requested one if it has a key, otherwise
 * falls back (with a console warning) to the first configured provider,
 * preferring cloudhike. Returns null when nothing is configured.
 */
export function resolveProvider(requested?: Provider | null): Provider | null {
  const want = requested ?? defaultProvider();
  if (providerConfigured(want)) return want;
  const order: Provider[] = ["cloudhike", "anthropic", "gemini"];
  const fallback = order.find((p) => p !== want && providerConfigured(p)) ?? null;
  const keyName = want === "anthropic" ? "ANTHROPIC_API_KEY" : want === "gemini" ? "GEMINI_API_KEY" : "AI_BASE_URL/AI_API_KEY";
  warnOnce(
    `missing-${want}`,
    `${PROVIDER_LABEL[want]} selected but ${keyName} is not set in .env.local; ` +
      (fallback ? `falling back to ${PROVIDER_LABEL[fallback]}.` : "no AI provider is configured."),
  );
  return fallback;
}

export function providerStatus() {
  return PROVIDERS.map((p) => ({
    id: p,
    label: PROVIDER_LABEL[p],
    configured: providerConfigured(p),
    models: { default: modelFor(p, "default"), fast: modelFor(p, "fast"), heavy: modelFor(p, "heavy") },
  }));
}
