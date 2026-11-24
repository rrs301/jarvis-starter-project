"use client";

import { Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { WidgetCard } from "./WidgetCard";
import { useWidgetData } from "./hooks";
import { num, str, type WidgetProps } from "./types";

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export function FocusWidget({ id, title, size, config, data, preview, actions }: WidgetProps) {
  const focusMin = Math.min(Math.max(num(config.minutes, 25), 1), 180);
  const breakMin = Math.min(Math.max(num(config.breakMinutes, 5), 1), 60);
  const label = str(config.label, "Deep work");

  const [phase, setPhase] = useState<"focus" | "break">("focus");
  const total = (phase === "focus" ? focusMin : breakMin) * 60;
  const [remaining, setRemaining] = useState(total);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [stats, setStats] = useWidgetData(id, { sessions: num(data?.sessions, 0) }, Boolean(preview));

  useEffect(() => {
    if (endsAt === null) return;
    const tick = () => {
      const left = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        setEndsAt(null);
        if (phase === "focus") setStats((s) => ({ sessions: s.sessions + 1 }));
        const next = phase === "focus" ? "break" : "focus";
        setPhase(next);
        setRemaining((next === "focus" ? focusMin : breakMin) * 60);
      }
    };
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [endsAt, phase, focusMin, breakMin, setStats]);

  const running = endsAt !== null;
  const shownRemaining = running || remaining <= total ? remaining : total;
  const progress = 1 - shownRemaining / total;
  const endLabel = running ? new Date(endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;

  function startPause() {
    if (running) {
      setEndsAt(null);
    } else {
      setEndsAt(Date.now() + shownRemaining * 1000);
    }
  }
  function reset() {
    setEndsAt(null);
    setPhase("focus");
    setRemaining(focusMin * 60);
  }

  const R = 52;
  const C = 2 * Math.PI * R;
  const dots = Math.min(Math.max(Math.round(num(config.sessionGoal, 4)), 1), 8);
  const ring = size === "S" ? 104 : 124;

  return (
    <WidgetCard tone="accent" icon={Timer} title={title} meta={stats.sessions ? `${stats.sessions} done` : undefined} actions={actions}>
      <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-3">
        <div className="relative shrink-0" style={{ width: ring, height: ring }}>
          <svg width={ring} height={ring} viewBox="0 0 120 120" aria-hidden>
            <circle cx="60" cy="60" r={R} fill="none" stroke="var(--card2)" strokeWidth="9" />
            <circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke="var(--pop)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - progress)}
              transform="rotate(-90 60 60)"
              className="transition-[stroke-dashoffset] duration-300"
            />
          </svg>
          <p
            className={`absolute inset-0 m-0 flex items-center justify-center font-mono font-semibold tabular-nums tracking-[-0.06em] ${size === "S" ? "text-[22px]" : "text-[26px]"}`}
            aria-live="off"
          >
            {fmt(shownRemaining)}
          </p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="m-0 truncate text-[17px] font-semibold leading-tight">{phase === "break" ? "Break" : label}</p>
          <p className="m-0 text-[13px] text-muted">{endLabel ? `Ends ${endLabel}` : `${phase === "focus" ? focusMin : breakMin} min ${phase === "focus" ? "session" : "break"}`}</p>
          <div className="mt-1.5 flex gap-1.5" role="img" aria-label={`${Math.min(stats.sessions, dots)} of ${dots} sessions`}>
            {Array.from({ length: dots }, (_, i) => (
              <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < Math.min(stats.sessions, dots) ? "bg-pop" : "border-[1.5px] border-line-strong"}`} />
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={startPause} className="h-10 flex-1 rounded-full bg-ink font-semibold text-ink-text transition hover:opacity-90">
          {running ? "Pause" : shownRemaining < total ? "Resume" : "Start"}
        </button>
        <button onClick={reset} className="h-10 flex-1 rounded-full border border-line-strong font-medium transition hover:bg-card2">
          Reset
        </button>
      </div>
    </WidgetCard>
  );
}
