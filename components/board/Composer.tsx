"use client";

import { ArrowUp, LayoutGrid, Mic, RotateCcw, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnswerView } from "@/components/chat/AnswerView";
import { newAnswer, streamAgent, type AnswerTurn } from "@/components/chat/agent-client";
import { useConnected } from "@/components/integrations/connect";

const MODES = [
  { label: "Ask", placeholder: "Ask Jarvis anything, like “best coffee near me” or “18% tip on 2,450”" },
  { label: "Make a widget", placeholder: "Describe a widget, like “a focus timer for 50 minutes”", widget: true },
  { label: "Plan my day", placeholder: "What's on today? Jarvis will help you plan it", prefix: "Help me plan my day: " },
  { label: "Deep research", placeholder: "A topic to research", prefix: "Research this for me with sources: " },
];

type Turn = { role: "user"; content: string } | AnswerTurn;

/**
 * Home prompt composer. Questions get a direct streamed answer (with web
 * search, apps and other tools); clear widget requests go to the designer.
 */
export function Composer({ boardId }: { boardId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState(0);
  const [text, setText] = useState("");
  const [thread, setThread] = useState<Turn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const threadRef = useRef<Turn[]>([]);
  threadRef.current = thread;

  useEffect(() => () => abortRef.current?.abort(), []);

  const toWidget = useCallback((q: string) => router.push(`/board/new?b=${boardId}&q=${encodeURIComponent(q)}`), [boardId, router]);

  const run = useCallback(
    async (question: string, base: Turn[], skipIntent = false) => {
      const history = [...base, { role: "user" as const, content: question }];
      setThread([...history, newAnswer(question)]);
      setStreaming(true);
      const ac = new AbortController();
      abortRef.current = ac;
      const update = (fn: (t: AnswerTurn) => AnswerTurn) =>
        setThread((t) => {
          const last = t[t.length - 1];
          return last?.role === "answer" ? [...t.slice(0, -1), fn(last)] : t;
        });
      try {
        const routed = await streamAgent(
          { messages: history.map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content })), boardId, skipIntent },
          update,
          ac.signal,
        );
        if (routed === "widget") {
          setThread(base);
          toWidget(question);
          return;
        }
      } catch (err) {
        if (!ac.signal.aborted) update((t) => ({ ...t, error: err instanceof Error ? err.message : "Jarvis hit an error." }));
      } finally {
        update((t) => ({ ...t, streaming: false }));
        setStreaming(false);
      }
    },
    [boardId, toWidget],
  );

  /** Re-runs the last question (after sharing location or connecting an app). */
  const resume = useCallback(() => {
    const t = threadRef.current;
    const lastUserIdx = t.map((x) => x.role).lastIndexOf("user");
    if (lastUserIdx < 0) return;
    void run(t[lastUserIdx].content, t.slice(0, lastUserIdx), true);
  }, [run]);

  useConnected(useCallback((_tk, ok) => ok && resume(), [resume]));

  // After a full-page connect redirect, pick the original request back up.
  useEffect(() => {
    const url = new URL(window.location.href);
    const q = url.searchParams.get("resume");
    if (!q) return;
    url.searchParams.delete("resume");
    url.searchParams.delete("connected");
    history.replaceState(null, "", url.pathname + url.search);
    const t = setTimeout(() => void run(q, [], true), 0);
    return () => clearTimeout(t);
  }, [run]);

  function send(e?: React.FormEvent) {
    e?.preventDefault();
    const q = text.trim();
    if (!q || streaming) return;
    const m = MODES[mode];
    setText("");
    if (m.widget) return toWidget(q);
    void run(thread.length ? q : (m.prefix ?? "") + q, thread);
  }

  const lastAnswer = [...thread].reverse().find((t): t is AnswerTurn => t.role === "answer");

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={send} className="field flex flex-col gap-3.5 rounded-[28px] border border-line bg-card px-[18px] pb-3.5 pt-[18px] shadow-card">
        <label className="flex items-center gap-2.5">
          <span className="sr-only">Ask Jarvis</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={thread.length && !MODES[mode].widget ? "Ask a follow-up…" : MODES[mode].placeholder}
            className="h-10 min-w-0 flex-1 text-ellipsis bg-transparent text-[17px] outline-none placeholder:text-faint"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {MODES.map((m, i) => (
            <button
              key={m.label}
              type="button"
              aria-pressed={i === mode}
              onClick={() => setMode(i)}
              className={`h-9 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium transition-colors ${
                i === mode ? "border-ink bg-ink text-ink-text" : "border-line text-muted hover:text-text"
              }`}
            >
              {m.label}
            </button>
          ))}
          <span className="flex-1" />
          <button type="button" aria-label="Talk to Jarvis (voice coming soon)" title="Voice is coming soon" aria-disabled className="flex h-[42px] w-[42px] items-center justify-center rounded-full border border-line text-muted">
            <Mic size={18} strokeWidth={1.7} />
          </button>
          {streaming ? (
            <button type="button" onClick={() => abortRef.current?.abort()} aria-label="Stop Jarvis" className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-ink text-ink-text">
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button type="submit" aria-label="Send" disabled={!text.trim()} className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-ink text-ink-text disabled:opacity-40">
              <ArrowUp size={18} strokeWidth={2} />
            </button>
          )}
        </div>
      </form>

      {thread.length > 0 && (
        <section aria-label="Jarvis's answer" className="flex max-h-[460px] flex-col gap-3 overflow-auto rounded-[26px] border border-line bg-card p-[18px] shadow-card">
          {thread.map((t, i) =>
            t.role === "user" ? (
              i > 0 ? (
                <p key={i} className="m-0 self-end rounded-[18px_18px_6px_18px] bg-ink px-3.5 py-2 text-[14px] text-ink-text">
                  {t.content}
                </p>
              ) : null
            ) : (
              <AnswerView
                key={i}
                turn={t}
                onResume={resume}
                onHalt={(h) => setThread((all) => all.map((x, j) => (j === i && x.role === "answer" ? { ...x, halt: h } : x)))}
                footer={
                  t === lastAnswer ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {t.content && (
                        <button
                          type="button"
                          onClick={() => toWidget(`Make a widget for: ${t.question}`)}
                          className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-3 text-[12px] font-medium text-muted hover:text-text"
                        >
                          <LayoutGrid size={13} /> Turn into a widget
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          abortRef.current?.abort();
                          setThread([]);
                        }}
                        className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-3 text-[12px] font-medium text-muted hover:text-text"
                      >
                        <RotateCcw size={13} /> New question
                      </button>
                      {t.via && <span className="text-xs text-faint">via {t.via}</span>}
                    </div>
                  ) : null
                }
              />
            ),
          )}
        </section>
      )}
    </div>
  );
}
