import type { LucideIcon } from "lucide-react";

/**
 * Accent for a card. Cards themselves stay white (dark card in dark mode); the
 * tone only colours the icon chip and the widget's highlights (`pop`).
 */
export type WidgetTone = "plain" | "lavender" | "sky" | "butter" | "mint" | "accent" | "ink";

/** Card chrome shared by every widget template. */
export function WidgetCard({
  icon: Icon,
  title,
  meta,
  actions,
  children,
  tone = "plain",
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  tone?: WidgetTone;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      data-tone={tone}
      className={`widget-card tone-${tone} flex h-full min-h-0 min-w-0 flex-col gap-3.5 overflow-hidden rounded-[26px] border border-line bg-card p-[18px] text-text shadow-card ${className}`}
    >
      {/* The header is the drag handle on the board. */}
      <div className="widget-drag flex items-center gap-2.5">
        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-chip text-chip-text">
          <Icon size={16} strokeWidth={2} />
        </span>
        <h2 className="m-0 min-w-0 flex-1 truncate text-sm font-semibold tracking-[-0.005em]">{title}</h2>
        {meta ? <span className="shrink-0 text-xs font-medium text-muted">{meta}</span> : null}
        {actions}
      </div>
      {/* Content fits the card's chosen size and scrolls inside it. */}
      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden px-1 pb-0.5">{children}</div>
    </section>
  );
}

/** A large headline figure with an optional unit, used across widgets. */
export function BigNumber({ value, unit, className = "" }: { value: React.ReactNode; unit?: React.ReactNode; className?: string }) {
  return (
    <p className={`m-0 text-[34px] font-semibold leading-none tracking-[-0.035em] tabular-nums ${className}`}>
      {value}
      {unit ? <span className="ml-1 text-sm font-medium tracking-normal text-muted">{unit}</span> : null}
    </p>
  );
}
