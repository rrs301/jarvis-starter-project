"use client";

import { CalendarDays, Check, Plus, X } from "lucide-react";
import { Fragment, useState } from "react";
import { WidgetCard } from "./WidgetCard";
import { uid, useNow, useWidgetData } from "./hooks";
import type { WidgetProps } from "./types";

type Task = { id: string; time: string; title: string; done: boolean };

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : 24 * 60;
};

export function TodayWidget({ id, title, config, data, preview, actions }: WidgetProps) {
  const starter = Array.isArray(config.starter) ? (config.starter as Array<{ time?: string; title?: string }>) : [];
  const initial: Task[] = Array.isArray(data?.tasks)
    ? (data!.tasks as Task[])
    : starter.map((s, i) => ({ id: `s${i}`, time: String(s.time ?? ""), title: String(s.title ?? ""), done: false }));
  const [state, setState] = useWidgetData(id, { tasks: initial }, Boolean(preview));
  const [time, setTime] = useState("");
  const [text, setText] = useState("");
  const now = useNow();
  const compact = config.density === "compact";

  const tasks = [...state.tasks].sort((a, b) => toMin(a.time) - toMin(b.time));
  const nowMin = now ? now.getHours() * 60 + now.getMinutes() : null;
  const nowLabel = now ? now.toTimeString().slice(0, 5) : "";
  const nowIndex = nowMin === null ? -1 : tasks.findIndex((t) => toMin(t.time) > nowMin);

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setState((s) => ({ tasks: [...s.tasks, { id: uid("t"), time: time || nowLabel || "09:00", title: text.trim(), done: false }] }));
    setText("");
    setTime("");
  }
  const toggle = (tid: string) => setState((s) => ({ tasks: s.tasks.map((t) => (t.id === tid ? { ...t, done: !t.done } : t)) }));
  const remove = (tid: string) => setState((s) => ({ tasks: s.tasks.filter((t) => t.id !== tid) }));

  const done = tasks.filter((t) => t.done).length;
  const next = nowMin === null ? null : tasks.find((t) => !t.done && toMin(t.time) >= nowMin) ?? null;
  const inMin = next && nowMin !== null ? toMin(next.time) - nowMin : null;
  const inLabel = inMin === null ? "" : inMin <= 0 ? "now" : inMin < 60 ? `in ${inMin} min` : `in ${Math.floor(inMin / 60)}h ${inMin % 60 ? `${inMin % 60}m` : ""}`.trim();

  const nowRow = (
    <li className="flex items-center gap-2 py-0.5" aria-label={`Now, ${nowLabel}`}>
      <span className="shrink-0 rounded-full bg-coral px-2 py-[3px] font-mono text-[11px] font-semibold text-white">{nowLabel}</span>
      <span className="h-0.5 flex-1 rounded bg-coral" />
    </li>
  );

  return (
    <WidgetCard tone="lavender" icon={CalendarDays} title={title} meta={tasks.length ? `${done} of ${tasks.length} done` : undefined} actions={actions}>
      {next && !compact && (
        <div className="flex items-center gap-3 rounded-[18px] bg-ink px-4 py-3 text-ink-text">
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.06em] opacity-70">Up next · {inLabel}</p>
            <p className="m-0 mt-0.5 truncate text-[17px] font-semibold tracking-[-0.01em]">{next.title}</p>
          </div>
          <span className="shrink-0 rounded-full bg-ink-text/10 px-2.5 py-1 font-mono text-xs font-medium">{next.time}</span>
        </div>
      )}
      {tasks.length === 0 && <p className="m-0 py-2 text-[13px] text-muted">Nothing planned yet. Add the first thing below.</p>}
      <ol className={`m-0 flex list-none flex-col p-0 ${compact ? "gap-1" : "gap-1.5"}`}>
        {tasks.map((t, i) => (
          <Fragment key={t.id}>
            {i === nowIndex && nowRow}
            <li className={`group flex items-center gap-2.5 rounded-[14px] px-2.5 transition-colors ${compact ? "py-1" : "py-2"} ${t.done ? "bg-card2/50" : "bg-card2"}`}>
              <span className="w-[42px] shrink-0 font-mono text-xs tabular-nums text-muted">{t.time || "—"}</span>
              <button
                onClick={() => toggle(t.id)}
                aria-pressed={t.done}
                aria-label={t.done ? `Mark “${t.title}” not done` : `Mark “${t.title}” done`}
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition ${t.done ? "border-pop bg-pop text-card" : "border-line-strong hover:border-pop"}`}
              >
                {t.done && <Check size={12} strokeWidth={3} />}
              </button>
              <span className={`min-w-0 flex-1 truncate font-medium ${t.done ? "text-faint line-through" : ""}`}>{t.title}</span>
              <button onClick={() => remove(t.id)} aria-label={`Remove “${t.title}”`} className="rounded-full p-1 text-faint opacity-0 hover:text-text group-hover:opacity-100 focus:opacity-100">
                <X size={14} />
              </button>
            </li>
          </Fragment>
        ))}
        {nowMin !== null && tasks.length > 0 && nowIndex === -1 && nowRow}
      </ol>
      <form onSubmit={add} className="mt-auto flex items-center gap-2">
        <label>
          <span className="sr-only">Time</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-10 w-[92px] rounded-full border border-dashed border-line-strong bg-transparent px-2 font-mono text-xs text-muted outline-none focus-visible:shadow-[0_0_0_2px_var(--pop)]" />
        </label>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Task</span>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add to today…" className="h-10 w-full rounded-full bg-card2 px-3.5 outline-none placeholder:text-faint focus-visible:shadow-[0_0_0_2px_var(--pop)]" />
        </label>
        <button type="submit" aria-label="Add task" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-ink-text transition hover:opacity-90">
          <Plus size={16} />
        </button>
      </form>
    </WidgetCard>
  );
}
