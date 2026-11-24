"use client";

import { Lightbulb, Sparkles, Square, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { streamSSE } from "@/lib/sse-client";
import { Orb } from "@/components/ui/Orb";
import { WidgetCard } from "./WidgetCard";
import { uid, useWidgetData } from "./hooks";
import { num, str, type WidgetProps } from "./types";

type Idea = { id: string; text: string; starred: boolean };

export function IdeasWidget({ id, title, config, data, preview, actions }: WidgetProps) {
  const topic = str(config.topic, "New ideas");
  const count = Math.min(Math.max(num(config.count, 5), 3), 8);
  const cards = config.style === "cards";
  const [state, setState] = useWidgetData(id, { ideas: Array.isArray(data?.ideas) ? (data!.ideas as Idea[]) : [] }, Boolean(preview));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function generate() {
    if (preview) return;
    if (busy) {
      abortRef.current?.abort();
      return;
    }
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setError(null);
    // Keep starred ideas; new ones stream in after them.
    setState((s) => ({ ideas: s.ideas.filter((i) => i.starred) }));
    try {
      await streamSSE(
        "/api/widgets/ideas",
        { topic, count, avoid: state.ideas.map((i) => i.text) },
        (event, data) => {
          if (event === "idea") setState((s) => ({ ideas: [...s.ideas, { id: uid("i"), text: String(data.text), starred: false }] }));
          if (event === "error") setError(String(data.message));
        },
        ac.signal,
      );
    } catch (e) {
      if (!ac.signal.aborted) setError(e instanceof Error ? e.message : "Could not generate ideas.");
    } finally {
      setBusy(false);
    }
  }
  const toggle = (iid: string) => setState((s) => ({ ideas: s.ideas.map((i) => (i.id === iid ? { ...i, starred: !i.starred } : i)) }));

  const shown = preview && state.ideas.length === 0 ? null : state.ideas;

  return (
    <WidgetCard tone="sky" icon={Lightbulb} title={title} meta={topic !== title ? topic : undefined} actions={actions}>
      {shown === null ? (
        <ul aria-hidden className={`m-0 list-none p-0 ${cards ? "grid grid-cols-2 gap-2" : "flex flex-col gap-2"}`}>
          {[78, 62, 70].map((w, i) => (
            <li key={i} className="flex h-10 items-center rounded-[14px] bg-card2 px-3.5">
              <span className="h-2.5 rounded-full bg-line-strong/60" style={{ width: `${w}%` }} />
            </li>
          ))}
        </ul>
      ) : shown.length === 0 ? (
        <p className="m-0 py-3 text-[13px] text-muted">Jarvis will brainstorm {count} ideas about “{topic}”.</p>
      ) : (
        <ul className={`m-0 list-none p-0 ${cards ? "grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2" : "flex max-h-[300px] flex-col gap-2 overflow-auto"}`}>
          {shown.map((idea) => (
            <li key={idea.id} className={`flex gap-2 rounded-[14px] bg-card2 py-2 pl-3.5 pr-2 shadow-[0_1px_2px_rgba(20,60,100,0.06)] ${cards ? "min-h-[88px] flex-col justify-between pt-3" : "items-center"}`}>
              <span className="min-w-0 flex-1 font-medium leading-snug">{idea.text}</span>
              <button
                onClick={() => toggle(idea.id)}
                aria-label={idea.starred ? "Unstar idea" : "Star idea"}
                aria-pressed={idea.starred}
                className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center self-end rounded-full ${idea.starred ? "bg-chip text-coral" : "text-faint hover:text-text"}`}
              >
                <Star size={16} fill={idea.starred ? "currentColor" : "none"} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="m-0 text-[13px] text-coral-text">{error}</p>}
      <button
        onClick={generate}
        aria-live="polite"
        className="mt-auto inline-flex h-9 items-center gap-2 self-start rounded-full bg-ink px-4 font-medium text-ink-text transition hover:opacity-90"
      >
        {busy ? <Orb size={16} pulse /> : <Sparkles size={15} />}
        {busy ? "Thinking… stop" : state.ideas.length ? `Generate ${count} more` : `Generate ${count} ideas`}
        {busy && <Square size={11} fill="currentColor" aria-hidden />}
      </button>
    </WidgetCard>
  );
}
