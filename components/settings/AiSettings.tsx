"use client";

import { Check, Cpu } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { setAiProviderAction } from "@/app/board/settings/actions";

type ProviderId = "anthropic" | "gemini" | "cloudhike";
type Status = { id: ProviderId; label: string; configured: boolean; models: { default: string; fast: string; heavy: string } };

const KEY_HINT: Record<ProviderId, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  cloudhike: "AI_BASE_URL + AI_API_KEY",
};

export function AiSettings({
  providers,
  chosen,
  envDefault,
  envDefaultLabel,
  active,
}: {
  providers: Status[];
  chosen: ProviderId | null;
  envDefault: ProviderId;
  envDefaultLabel: string;
  active: ProviderId | null;
}) {
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(chosen);
  const selected = optimistic ?? envDefault;
  const activeStatus = providers.find((p) => p.id === active);

  function pick(id: ProviderId | null) {
    start(async () => {
      setOptimistic(id);
      await setAiProviderAction(id);
    });
  }

  return (
    <section aria-labelledby="ai-heading" className="flex flex-col gap-4 rounded-[26px] border border-line bg-card p-[18px] shadow-card">
      <div className="flex items-center gap-2">
        <Cpu size={17} strokeWidth={1.8} className="text-muted" aria-hidden />
        <h2 id="ai-heading" className="m-0 flex-1 text-sm font-medium text-muted">
          AI provider
        </h2>
        {pending && <span className="text-xs text-faint">Saving…</span>}
      </div>

      <div className="rounded-[18px] bg-card2 p-4">
        <p className="m-0 text-[13px] text-muted">Jarvis is using</p>
        {activeStatus ? (
          <>
            <p className="m-0 mt-1 text-[22px] font-semibold tracking-[-0.02em]">{activeStatus.label}</p>
            <p className="m-0 mt-1 font-mono text-xs text-muted">
              {activeStatus.models.default} · ideas: {activeStatus.models.fast}
            </p>
            {active !== selected && (
              <p className="m-0 mt-2 text-[13px] text-coral-text">
                {providers.find((p) => p.id === selected)?.label} has no API key yet, so Jarvis falls back to {activeStatus.label}.
              </p>
            )}
          </>
        ) : (
          <p className="m-0 mt-1 font-semibold">No provider configured. Add a key to .env.local.</p>
        )}
      </div>

      <div role="radiogroup" aria-label="AI provider" className="flex flex-col gap-2">
        {providers.map((p) => {
          const on = p.id === selected;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => pick(p.id)}
              disabled={pending}
              className={`flex items-center gap-3 rounded-[20px] border-2 p-3.5 text-left transition-colors ${on ? "border-coral" : "border-transparent bg-card2 hover:border-line-strong"}`}
              style={on ? { background: "color-mix(in srgb, var(--coral) 8%, var(--card))" } : undefined}
            >
              <span
                aria-hidden
                className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full ${on ? "bg-coral text-white" : "border-[1.5px] border-faint text-transparent"}`}
              >
                <Check size={12} strokeWidth={3} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 font-semibold">
                  {p.label}
                  {p.id === envDefault && <span className="rounded-full bg-card px-2 py-0.5 text-[11px] font-medium text-muted">App default</span>}
                </span>
                <span className="mt-0.5 block truncate font-mono text-xs text-muted">{p.models.default}</span>
              </span>
              <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] ${p.configured ? "bg-card text-muted" : "bg-card text-coral-text"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${p.configured ? "bg-green" : "bg-coral"}`} />
                {p.configured ? "Key set" : `Needs ${KEY_HINT[p.id]}`}
              </span>
            </button>
          );
        })}
      </div>

      {chosen !== null && (
        <button type="button" onClick={() => pick(null)} disabled={pending} className="self-start text-[13px] font-medium text-muted underline-offset-4 hover:underline">
          Reset to app default ({envDefaultLabel})
        </button>
      )}
    </section>
  );
}
