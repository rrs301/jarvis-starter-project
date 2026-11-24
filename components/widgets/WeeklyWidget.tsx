"use client";

import { BarChart3, Minus, Plus } from "lucide-react";
import { BigNumber, WidgetCard } from "./WidgetCard";
import { useNow, useWidgetData } from "./hooks";
import { num, str, type WidgetProps } from "./types";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function WeeklyWidget({ id, title, size, config, data, preview, actions }: WidgetProps) {
  const unit = str(config.unit, "");
  const tagUnit = unit.length <= 2 ? unit : "";
  const metric = str(config.metric, title);
  const goal = typeof config.goal === "number" ? config.goal : null;
  const base = Array.isArray(config.values) ? (config.values as unknown[]).map((v) => num(v, 0)) : [];
  const initial = Array.isArray(data?.values) ? (data!.values as unknown[]).map((v) => num(v, 0)) : base;
  const values = DAYS.map((_, i) => initial[i] ?? 0);
  const [state, setState] = useWidgetData(id, { values }, Boolean(preview));
  const now = useNow();
  const today = now ? (now.getDay() + 6) % 7 : -1;
  const max = Math.max(1, goal ?? 0, ...state.values);
  const total = state.values.reduce((a, b) => a + b, 0);
  const days = size === "S" ? DAYS.map((d) => d[0]) : DAYS;

  const bump = (delta: number) =>
    setState((s) => ({ values: s.values.map((v, i) => (i === today ? Math.max(0, Math.round((v + delta) * 10) / 10) : v)) }));

  const totalLabel = Math.round(total * 10) / 10;
  const todayValue = today >= 0 ? state.values[today] : null;

  return (
    <WidgetCard tone="ink" icon={BarChart3} title={title} meta={goal !== null ? `Goal ${goal}${tagUnit}/day` : "This week"} actions={actions}>
      <BigNumber value={totalLabel} unit={unit ? `${unit} this week` : "this week"} />
      <div className="flex min-h-[150px] flex-1 flex-col gap-1.5" role="img" aria-label={`${metric} this week: ${state.values.map((v, i) => `${DAYS[i]} ${v}${unit}`).join(", ")}`}>
        {/* Bar area scales with the card; top padding leaves room for the value label. */}
        <div aria-hidden className="relative flex min-h-0 flex-1 items-end gap-1.5 pt-5 sm:gap-2">
          {state.values.map((v, i) => {
            const kind = today < 0 ? "done" : i < today ? "done" : i === today ? "today" : "plan";
            return (
              <div key={i} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <span className={`max-w-full truncate font-mono text-[11px] font-semibold tabular-nums ${kind === "today" ? "text-pop" : "text-faint opacity-0 transition-opacity group-hover:opacity-100"}`}>{v}</span>
                <span
                  className={`w-full shrink-0 rounded-[10px] transition-[height] duration-300 ${kind === "done" ? "bg-ink" : kind === "today" ? "bg-pop" : "box-border border-[1.5px] border-dashed border-line-strong"}`}
                  style={{ height: `max(6px, calc((100% - 20px) * ${v / max}))` }}
                />
              </div>
            );
          })}
          {goal !== null && (
            <span className="pointer-events-none absolute inset-x-0 border-t border-dashed border-faint/60" style={{ bottom: `calc((100% - 40px) * ${goal / max})` }} />
          )}
        </div>
        <div aria-hidden className="flex gap-1.5 sm:gap-2">
          {days.map((d, i) => (
            <span key={i} className={`min-w-0 flex-1 text-center text-[11px] ${i === today ? "font-semibold text-pop" : "text-faint"}`}>{d}</span>
          ))}
        </div>
      </div>
      {today >= 0 && (
        <div className="flex items-center gap-2">
          <span className="flex-1 text-[13px] text-muted">
            Today <span className="font-semibold text-text tabular-nums">{todayValue}{tagUnit || (unit ? ` ${unit}` : "")}</span>
          </span>
          <button onClick={() => bump(-1)} aria-label={`Decrease today's ${metric}`} className="flex h-9 w-9 items-center justify-center rounded-full border border-line-strong transition hover:bg-card2">
            <Minus size={15} />
          </button>
          <button onClick={() => bump(1)} aria-label={`Increase today's ${metric}`} className="flex h-9 w-9 items-center justify-center rounded-full bg-pop text-pop-text transition hover:opacity-90">
            <Plus size={15} />
          </button>
        </div>
      )}
    </WidgetCard>
  );
}
