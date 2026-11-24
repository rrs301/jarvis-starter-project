"use client";

import {
  Bell, Book, Briefcase, CalendarDays, ChartColumn, Check, Clock, Coffee, DollarSign, Droplet, Dumbbell, Flame, Folder, Heart,
  Leaf, Lightbulb, List, Minus, Moon, Music, Pencil, Play, Plus, RotateCcw, Sparkles, Star, Sun, Target, Timer, Trophy, X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Action, Expr, SpecNode, WidgetSpec } from "@/lib/spec/schema";
import { SOURCE_TOOLKIT, sanitizeSpec } from "@/lib/spec/schema";
import { isToolkitId } from "@/lib/integrations/catalog";
import { ConnectCard } from "@/components/integrations/ConnectCard";
import { ToolkitBadge } from "@/components/integrations/ToolkitBadge";
import { streamSSE } from "@/lib/sse-client";
import { Orb } from "@/components/ui/Orb";
import { WidgetCard, type WidgetTone } from "./WidgetCard";
import { uid, useNow, useWidgetData } from "./hooks";
import type { WidgetProps } from "./types";

const ICON_MAP: Record<WidgetSpec["icon"], LucideIcon> = {
  sparkles: Sparkles, droplet: Droplet, book: Book, check: Check, list: List, timer: Timer, calendar: CalendarDays, chart: ChartColumn,
  target: Target, flame: Flame, heart: Heart, dumbbell: Dumbbell, coffee: Coffee, moon: Moon, sun: Sun, music: Music, dollar: DollarSign,
  folder: Folder, briefcase: Briefcase, star: Star, lightbulb: Lightbulb, pencil: Pencil, clock: Clock, bell: Bell, leaf: Leaf, trophy: Trophy,
};
/** AI widgets get a soft tint that matches their subject. */
const ICON_TONE: Partial<Record<WidgetSpec["icon"], WidgetTone>> = {
  droplet: "sky", moon: "sky", music: "sky", bell: "sky", clock: "sky",
  leaf: "mint", heart: "mint", dumbbell: "mint", dollar: "mint", check: "mint",
  sun: "butter", coffee: "butter", lightbulb: "butter", star: "butter", trophy: "butter", pencil: "butter",
  book: "lavender", sparkles: "lavender", target: "lavender", calendar: "lavender", list: "lavender", timer: "lavender", flame: "lavender",
};
const BUTTON_ICONS = { plus: Plus, minus: Minus, reset: RotateCcw, sparkles: Sparkles, check: Check, play: Play };
const ICON_LABEL = { plus: "Add", minus: "Remove one", reset: "Reset", sparkles: "Generate", check: "Done", play: "Start" };

type Item = { id: string; text: string; done?: boolean; [k: string]: unknown };
type State = Record<string, unknown>;

const GAP = { xs: "gap-1", sm: "gap-2", md: "gap-3", lg: "gap-4" } as const;
const TONE = { default: "", muted: "text-muted", faint: "text-faint", coral: "text-coral-text", green: "text-green", amber: "text-amber" } as const;
const TEXT_SIZE = { xs: "text-xs", sm: "text-[13px]", md: "text-sm", lg: "text-base" } as const;
const STICKY = ["#FFE8A3", "#FFD3C4", "#D9D2FF", "#CDEBFF", "#D3F2DF"];

const items = (v: unknown): Item[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Item[]) : []);
const nums = (v: unknown): number[] => (Array.isArray(v) ? v.map((x) => Number(x) || 0) : []);
const todayIndex = () => (new Date().getDay() + 6) % 7;

function evalExpr(e: Expr | undefined, s: State): number | string {
  if (e === undefined) return "";
  if (typeof e === "number" || typeof e === "string") return e;
  if ("bind" in e) {
    const v = s[e.bind];
    return typeof v === "number" || typeof v === "string" ? v : Array.isArray(v) ? v.length : v ? 1 : 0;
  }
  if ("count" in e) return Array.isArray(s[e.count]) ? (s[e.count] as unknown[]).length : 0;
  if ("countDone" in e) return items(s[e.countDone]).filter((i) => i.done).length;
  if ("sum" in e) return Math.round(nums(s[e.sum]).reduce((a, b) => a + b, 0) * 10) / 10;
  return "";
}

function interpolate(text: string, s: State): string {
  return text.replace(/\{\{\s*(?:(count|countDone|sum):)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, fn: string | undefined, k: string) => {
    if (fn === "count") return String(Array.isArray(s[k]) ? (s[k] as unknown[]).length : 0);
    if (fn === "countDone") return String(items(s[k]).filter((i) => i.done).length);
    if (fn === "sum") return String(Math.round(nums(s[k]).reduce((a, b) => a + b, 0) * 10) / 10);
    const v = s[k];
    return typeof v === "string" || typeof v === "number" ? String(v) : typeof v === "boolean" ? (v ? "on" : "off") : Array.isArray(v) ? String(v.length) : "";
  });
}

type Ctx = {
  state: State;
  run: (a: Action, input?: string) => void;
  update: (fn: (s: State) => State) => void;
  preview: boolean;
  busyKey: string | null;
};

/** Renders a validated, AI-generated widget spec with the board's design tokens. */
export function CustomWidget({ id, title, config, data, preview, actions }: WidgetProps) {
  const spec = sanitizeSpec(config.spec);
  const initial = (spec?.state ?? {}) as State;
  const saved = data?.state && typeof data.state === "object" ? (data.state as State) : null;
  const [store, setStore] = useWidgetData<{ state: State; refreshedAt?: string; needs?: string[]; errors?: Record<string, string> }>(
    id,
    {
      state: saved ?? initial,
      refreshedAt: typeof data?.refreshedAt === "string" ? data.refreshedAt : undefined,
      needs: Array.isArray(data?.needs) ? (data!.needs as string[]) : [],
      errors: (data?.errors as Record<string, string>) ?? {},
    },
    Boolean(preview),
  );
  const [refreshing, setRefreshing] = useState(false);
  const hasSources = Boolean(spec?.sources && Object.keys(spec.sources).length);

  async function refresh() {
    if (!id || preview || refreshing) return;
    setRefreshing(true);
    try {
      let location: string | null = null;
      try {
        const l = JSON.parse(localStorage.getItem("jb-location") ?? "null");
        location = l?.city ?? (l?.lat ? `${l.lat},${l.lon}` : null);
      } catch {
        /* no saved location */
      }
      const res = await fetch(`/api/widgets/${id}/refresh`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ location }) });
      const j = await res.json();
      if (res.ok && j.state) setStore((d) => ({ ...d, state: j.state, refreshedAt: j.refreshedAt, needs: j.needs ?? [], errors: j.errors ?? {} }));
    } finally {
      setRefreshing(false);
    }
  }

  // Live sources refresh on open when older than 15 minutes (the cloudhike job refreshes them too).
  useEffect(() => {
    if (!hasSources || preview || !id) return;
    const age = store.refreshedAt ? Date.now() - new Date(store.refreshedAt).getTime() : Infinity;
    if (age > 15 * 60_000) {
      const t = setTimeout(() => void refresh(), 0);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSources, id, preview]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  if (!spec) {
    return (
      <WidgetCard icon={Sparkles} title={title} actions={actions}>
        <p className="m-0 text-[13px] text-muted">This widget&apos;s design couldn&apos;t be loaded.</p>
      </WidgetCard>
    );
  }

  const update = (fn: (s: State) => State) => setStore((d) => ({ ...d, state: fn(d.state) }));

  async function runAi(a: Extract<Action, { type: "ai" }>) {
    if (preview || busyKey) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setBusyKey(a.key);
    if (a.mode !== "append") update((s) => ({ ...s, [a.key]: items(s[a.key]).filter((i) => i.starred || i.done) }));
    try {
      await streamSSE(
        "/api/widgets/ideas",
        {
          prompt: interpolate(a.prompt, store.state),
          count: a.count ?? 5,
          widget: spec?.title ?? title,
          avoid: items(store.state[a.key]).map((i) => i.text),
        },
        (event, d) => {
          if (event === "idea") update((s) => ({ ...s, [a.key]: [...items(s[a.key]), { id: uid("a"), text: String(d.text), done: false }] }));
        },
        ac.signal,
      );
    } catch {
      /* stopped or failed; keep what arrived */
    } finally {
      setBusyKey(null);
    }
  }

  function run(a: Action, input?: string) {
    if (a.type === "ai") return void runAi(a);
    update((s) => {
      switch (a.type) {
        case "addItem": {
          const text = (input ?? "").trim();
          if (!text) return s;
          return { ...s, [a.key]: [...items(s[a.key]), { id: uid("i"), text, done: false, ...(a.fields ?? {}) }] };
        }
        case "increment": {
          const by = a.by ?? 1;
          const clamp = (v: number) => Math.min(a.max ?? Infinity, Math.max(a.min ?? -Infinity, Math.round((v + by) * 100) / 100));
          const cur = s[a.key];
          if (Array.isArray(cur) || a.index !== undefined) {
            const arr = nums(cur);
            const i = a.index === "today" || a.index === undefined ? todayIndex() : a.index;
            while (arr.length <= i) arr.push(0);
            arr[i] = clamp(arr[i]);
            return { ...s, [a.key]: arr };
          }
          return { ...s, [a.key]: clamp(Number(cur) || 0) };
        }
        case "set": {
          let v: unknown = a.value === "$input" ? (input ?? "") : a.value;
          if (a.value === "$input" && typeof s[a.key] === "number") v = Number(input) || 0;
          return { ...s, [a.key]: v };
        }
        case "reset":
          return a.key ? { ...s, [a.key]: initial[a.key] } : { ...initial };
      }
      return s;
    });
  }

  const Icon = ICON_MAP[spec.icon] ?? Sparkles;
  const ctx: Ctx = { state: store.state, run, update, preview: Boolean(preview), busyKey };
  const appNeeds = (store.needs ?? []).filter(isToolkitId);
  const previewApps = preview
    ? Array.from(new Set(Object.values(spec.sources ?? {}).flatMap((src) => (src.kind === "app" ? [SOURCE_TOOLKIT[src.source]] : []))))
    : [];
  return (
    <WidgetCard tone={ICON_TONE[spec.icon] ?? "plain"} icon={Icon} title={title || spec.title} actions={actions}>
      {appNeeds.map((t) => (
        <ConnectCard key={t} toolkit={t} compact />
      ))}
      <Node node={spec.root} ctx={ctx} />
      {hasSources && (
        <div className="mt-auto flex items-center gap-2 pt-1 text-[11px] text-faint">
          {previewApps.map((t) => (
            <ToolkitBadge key={t} id={t} size={20} />
          ))}
          <span className="inline-flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${preview ? "bg-line-strong" : "bg-green"}`} />
            {preview ? "Live data" : store.refreshedAt ? `Updated ${new Date(store.refreshedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Loading live data…"}
          </span>
          {Object.keys(store.errors ?? {}).length > 0 && <span className="truncate text-coral-text">Couldn&apos;t refresh</span>}
          <span className="flex-1" />
          {!preview && (
            <button type="button" onClick={refresh} disabled={refreshing} aria-label="Refresh live data" className="rounded-full p-1 hover:text-text disabled:opacity-50">
              <RotateCcw size={12} className={refreshing ? "animate-spin" : ""} />
            </button>
          )}
        </div>
      )}
    </WidgetCard>
  );
}

function visible(w: SpecNode["when"], s: State): boolean {
  if (!w) return true;
  const raw = s[w.key];
  const v =
    w.measure === "count" ? (Array.isArray(raw) ? raw.length : 0)
    : w.measure === "countDone" ? items(raw).filter((i) => i.done).length
    : Array.isArray(raw) ? raw.length : raw;
  const a = typeof w.value === "number" ? Number(v) || 0 : v;
  switch (w.op) {
    case "gte": return (a as number) >= (w.value as number);
    case "gt": return (a as number) > (w.value as number);
    case "lte": return (a as number) <= (w.value as number);
    case "lt": return (a as number) < (w.value as number);
    case "eq": return a === w.value;
    case "ne": return a !== w.value;
  }
}

function Node({ node, ctx }: { node: SpecNode; ctx: Ctx }) {
  if (!visible(node.when, ctx.state)) return null;
  return <NodeInner node={node} ctx={ctx} />;
}

function NodeInner({ node, ctx }: { node: SpecNode; ctx: Ctx }) {
  const kids = (node.children ?? []).map((c, i) => <Node key={i} node={c} ctx={ctx} />);
  const s = ctx.state;
  switch (node.type) {
    case "stack":
      return <div className={`flex min-w-0 flex-col ${GAP[node.gap ?? "md"]} ${node.fill ? "flex-1" : ""}`}>{kids}</div>;
    case "row":
      return (
        <div
          className={`flex min-w-0 items-center ${GAP[node.gap ?? "sm"]} ${node.wrap === false ? "" : "flex-wrap"} ${
            { start: "justify-start", center: "justify-center", between: "justify-between", end: "justify-end" }[node.align ?? "start"]
          }`}
        >
          {kids}
        </div>
      );
    case "grid":
      return (
        <div className={`grid min-w-0 ${GAP[node.gap ?? "sm"]}`} style={{ gridTemplateColumns: `repeat(${node.cols}, minmax(0, 1fr))` }}>
          {kids}
        </div>
      );
    case "card": {
      const tone = node.tone ?? "soft";
      const cls = tone === "ink" ? "bg-ink text-ink-text" : tone === "plain" ? "border border-line" : "bg-card2";
      return (
        <div className={`flex min-w-0 flex-col rounded-[18px] p-3 ${cls} ${GAP[node.gap ?? "sm"]}`} style={tone === "coral" ? { background: "color-mix(in srgb, var(--coral) 12%, transparent)" } : undefined}>
          {kids}
        </div>
      );
    }
    case "heading":
      return <p className={`m-0 min-w-0 break-words font-semibold tracking-[-0.015em] ${{ sm: "text-sm", md: "text-base", lg: "text-lg" }[node.size ?? "md"]}`}>{interpolate(node.text, s)}</p>;
    case "text":
      return (
        <p className={`m-0 min-w-0 break-words ${TEXT_SIZE[node.size ?? "md"]} ${TONE[node.tone ?? "default"]} ${node.mono ? "font-mono" : ""} ${{ normal: "", medium: "font-medium", semibold: "font-semibold" }[node.weight ?? "normal"]}`}>
          {interpolate(node.text, s)}
        </p>
      );
    case "stat": {
      const px = { md: 32, lg: 44, xl: 58 }[node.size ?? "lg"];
      const value = String(evalExpr(node.value, s));
      const of = node.of !== undefined ? String(evalExpr(node.of, s)) : null;
      const chars = value.length + (of ? of.length + 2 : 0) + (node.unit ? Math.min(node.unit.length, 8) * 0.5 : 0);
      return (
        <div className="min-w-0 [container-type:inline-size]">
          <p className="m-0 flex items-baseline gap-1.5 overflow-hidden whitespace-nowrap">
            {/* Shrinks to fit the widget's width instead of wrapping. */}
            <span className="font-mono font-medium leading-none tracking-[-0.05em]" style={{ fontSize: `min(${px}px, ${Math.round(150 / Math.max(chars, 1))}cqw)` }}>
              {value}
            </span>
            {of !== null && <span className="shrink-0 font-mono text-base text-muted">/ {of}</span>}
            {node.unit && <span className="min-w-0 truncate text-muted">{node.unit}</span>}
          </p>
          {node.label && <p className="m-0 mt-1 truncate text-[13px] text-muted">{interpolate(node.label, s)}</p>}
        </div>
      );
    }
    case "progress":
      return <Progress node={node} s={s} />;
    case "list":
      return <ListNode node={node} ctx={ctx} />;
    case "checklist":
      return <ChecklistNode node={node} ctx={ctx} />;
    case "input":
      return <InputNode node={node} ctx={ctx} />;
    case "button": {
      const I = node.icon ? BUTTON_ICONS[node.icon] : null;
      const busy = node.action.type === "ai" && ctx.busyKey === node.action.key;
      const v = node.variant ?? "secondary";
      const cls = v === "primary" ? "bg-ink text-ink-text" : v === "coral" ? "bg-coral text-white" : v === "ghost" ? "text-muted hover:text-text" : "border border-line";
      return (
        <button type="button" onClick={() => ctx.run(node.action)} disabled={busy} aria-label={node.label ? undefined : ICON_LABEL[node.icon ?? "plus"]} className={`inline-flex h-9 min-w-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold ${cls} ${node.full ? "w-full" : ""}`}>
          {busy ? <Orb size={14} pulse /> : I ? <I size={14} /> : null}
          {node.label}
        </button>
      );
    }
    case "toggle": {
      const on = Boolean(s[node.bind]);
      return (
        <button type="button" role="switch" aria-checked={on} onClick={() => ctx.update((st) => ({ ...st, [node.bind]: !on }))} className="flex items-center justify-between gap-3 rounded-full py-1 text-left">
          <span className="font-medium">{node.label}</span>
          <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? "bg-coral" : "bg-line-strong"}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
          </span>
        </button>
      );
    }
    case "chart":
      return <ChartNode node={node} s={s} />;
    case "timer":
      return <TimerNode node={node} ctx={ctx} />;
    case "tags":
      return (
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {node.items.map((t, i) => (
            <span
              key={i}
              title={t}
              className={`inline-block h-6 max-w-full truncate whitespace-nowrap rounded-[8px] px-2 text-xs font-medium leading-6 ${
                node.tone === "ink" ? "bg-ink text-ink-text" : node.tone === "coral" ? "bg-coral text-white" : "bg-card2 text-muted"
              }`}
            >
              {t}
            </span>
          ))}
        </div>
      );
    case "image":
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={node.url} alt={node.alt} referrerPolicy="no-referrer" className="w-full rounded-[16px] object-cover" style={{ height: node.height ?? 140 }} />;
    case "divider":
      return <hr className="m-0 border-0 border-t border-line" />;
    case "spacer":
      return <div className="flex-1" />;
  }
}

function Progress({ node, s }: { node: Extract<SpecNode, { type: "progress" }>; s: State }) {
  const value = Number(evalExpr(node.value, s)) || 0;
  const max = Math.max(1, Number(evalExpr(node.max, s)) || 1);
  const pct = Math.min(1, Math.max(0, value / max));
  const color = node.tone === "ink" ? "var(--ink)" : node.tone === "green" ? "var(--green)" : "var(--coral)";
  const style = node.style ?? "segments";
  let bar: React.ReactNode;
  if (style === "ring") {
    const r = 34;
    const c = 2 * Math.PI * r;
    bar = (
      <svg width="88" height="88" viewBox="0 0 88 88" role="img" aria-label={`${value} of ${max}`}>
        <circle cx="44" cy="44" r={r} fill="none" stroke="var(--card2)" strokeWidth="10" />
        <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${pct * c} ${c}`} transform="rotate(-90 44 44)" />
        <text x="44" y="49" textAnchor="middle" className="fill-[var(--text)] font-mono text-[15px] font-semibold">{Math.round(pct * 100)}%</text>
      </svg>
    );
  } else if (style === "bar") {
    bar = (
      <div className="h-3 w-full overflow-hidden rounded-full bg-card2" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct * 100}%`, background: color }} />
      </div>
    );
  } else {
    const n = node.segments ?? (max <= 20 ? max : 12);
    const filled = Math.round(pct * n);
    bar = (
      <div className={`flex w-full ${style === "dots" ? "flex-wrap gap-1.5" : "h-9 gap-[3px]"}`} role="progressbar" aria-valuenow={value} aria-valuemax={max}>
        {Array.from({ length: n }, (_, i) => (
          <span key={i} className={style === "dots" ? "h-4 w-4 rounded-full" : "flex-1 rounded-[3px]"} style={{ background: i < filled ? color : "var(--card2)" }} />
        ))}
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {bar}
      {node.label && <p className="m-0 text-[13px] text-muted">{interpolate(node.label, s)}</p>}
    </div>
  );
}

function ListNode({ node, ctx }: { node: Extract<SpecNode, { type: "list" }>; ctx: Ctx }) {
  const list = items(ctx.state[node.bind]);
  const remove = (id: string) => ctx.update((st) => ({ ...st, [node.bind]: items(st[node.bind]).filter((i) => i.id !== id) }));
  if (!list.length) return <p className="m-0 py-2 text-[13px] text-faint">{node.empty ?? "Nothing here yet."}</p>;
  const style = node.style ?? "plain";
  if (style === "sticky") {
    return (
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2 p-0">
        {list.map((it, i) => (
          <li key={it.id} className="group relative min-h-[70px] rounded-[14px] p-2.5 text-[13px] font-medium text-[#0E0E12]" style={{ background: STICKY[i % STICKY.length] }}>
            {it.text}
            {node.removable && (
              <button type="button" onClick={() => remove(it.id)} aria-label={`Remove ${it.text}`} className="absolute right-1 top-1 rounded-full p-1 opacity-0 group-hover:opacity-70 focus:opacity-100">
                <X size={12} />
              </button>
            )}
          </li>
        ))}
      </ul>
    );
  }
  const meta = (it: Item) =>
    [...(node.metaFields ?? []), ...(node.secondaryField && !node.metaFields ? [node.secondaryField] : [])]
      .map((f) => it[f])
      .filter((v) => v !== undefined && v !== null && v !== "")
      .map(String)
      .join(" · ");
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
      {list.map((it, i) => {
        const link = node.linkField && typeof it[node.linkField] === "string" && String(it[node.linkField]).startsWith("https://") ? String(it[node.linkField]) : null;
        const m = meta(it);
        const badge = node.badgeField && it[node.badgeField] !== undefined ? String(it[node.badgeField]) : null;
        return (
          <li key={it.id} className={`group flex min-w-0 items-center gap-2.5 ${style === "cards" ? "rounded-[14px] bg-card2 py-2 pl-3 pr-2" : "py-0.5"}`}>
            {style === "numbered" && <span className="w-5 shrink-0 text-center font-mono text-xs text-faint">{i + 1}</span>}
            <span className="min-w-0 flex-1">
              {link ? (
                <a href={link} target="_blank" rel="noreferrer noopener" className="line-clamp-2 font-medium underline-offset-2 hover:underline">
                  {it.text}
                </a>
              ) : (
                <span className="line-clamp-2 font-medium">{it.text}</span>
              )}
              {m && <span className="block truncate text-xs text-muted">{m}</span>}
            </span>
            {badge && <span className="h-6 max-w-[40%] shrink-0 truncate whitespace-nowrap rounded-[8px] bg-card px-2 font-mono text-xs leading-6 text-muted">{badge}</span>}
            {node.removable && (
              <button type="button" onClick={() => remove(it.id)} aria-label={`Remove ${it.text}`} className="shrink-0 rounded-full p-1 text-faint opacity-0 hover:text-text group-hover:opacity-100 focus:opacity-100">
                <X size={14} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ChecklistNode({ node, ctx }: { node: Extract<SpecNode, { type: "checklist" }>; ctx: Ctx }) {
  const list = items(ctx.state[node.bind]);
  const patch = (fn: (l: Item[]) => Item[]) => ctx.update((st) => ({ ...st, [node.bind]: fn(items(st[node.bind])) }));
  if (!list.length) return <p className="m-0 py-2 text-[13px] text-faint">{node.empty ?? "Nothing to do yet."}</p>;
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
      {list.map((it) => (
        <li key={it.id} className="group flex items-center gap-2.5">
          {node.timeField && it[node.timeField] !== undefined && (
            <span className="w-[62px] shrink-0 rounded-full bg-card2 py-1 text-center font-mono text-xs text-muted">{String(it[node.timeField])}</span>
          )}
          <button
            type="button"
            aria-pressed={Boolean(it.done)}
            aria-label={it.done ? `Mark “${it.text}” not done` : `Mark “${it.text}” done`}
            onClick={() => patch((l) => l.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${it.done ? "border-ink bg-ink text-ink-text" : "border-line-strong"}`}
          >
            {it.done && <Check size={12} strokeWidth={3} />}
          </button>
          <span className={`min-w-0 flex-1 break-words font-medium ${it.done ? "text-faint line-through" : ""}`}>{it.text}</span>
          {node.removable && (
            <button type="button" onClick={() => patch((l) => l.filter((x) => x.id !== it.id))} aria-label={`Remove ${it.text}`} className="rounded-full p-1 text-faint opacity-0 group-hover:opacity-100 focus:opacity-100">
              <X size={14} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function InputNode({ node, ctx }: { node: Extract<SpecNode, { type: "input" }>; ctx: Ctx }) {
  const [v, setV] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.trim()) return;
        ctx.run(node.action, v);
        setV("");
      }}
      className="field flex items-center gap-2 rounded-full border border-line bg-card2 py-1 pl-4 pr-1"
    >
      <label className="min-w-0 flex-1">
        <span className="sr-only">{node.placeholder ?? "Add"}</span>
        <input
          type={node.kind === "number" ? "number" : node.kind === "time" ? "time" : "text"}
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder={node.placeholder ?? "Add…"}
          className="h-8 w-full text-ellipsis bg-transparent outline-none placeholder:text-faint"
        />
      </label>
      <button type="submit" aria-label={node.submitLabel ?? "Add"} className="flex h-8 min-w-8 shrink-0 items-center whitespace-nowrap justify-center rounded-full bg-ink px-2 text-xs font-semibold text-ink-text">
        {node.submitLabel ?? <Plus size={16} />}
      </button>
    </form>
  );
}

function ChartNode({ node, s }: { node: Extract<SpecNode, { type: "chart" }>; s: State }) {
  const now = useNow();
  const values = nums(s[node.bind]);
  const labels = node.labels ?? (values.length === 7 ? ["M", "T", "W", "T", "F", "S", "S"] : values.map((_, i) => String(i + 1)));
  const hi = node.highlight === "today" ? (now ? todayIndex() : -1) : node.highlight === "last" ? values.length - 1 : (node.highlight ?? -1);
  const max = Math.max(1, node.goal ?? 0, ...values);
  if (!values.length) return <p className="m-0 text-[13px] text-faint">No data yet.</p>;
  if (node.kind === "line") {
    const W = 300, H = 110;
    const pts = values.map((v, i) => [values.length === 1 ? W / 2 : (i / (values.length - 1)) * W, H - (v / max) * (H - 10) - 5]);
    return (
      <div className="min-w-0">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[110px] w-full" preserveAspectRatio="none" role="img" aria-label={values.map((v, i) => `${labels[i] ?? i + 1}: ${v}${node.unit ?? ""}`).join(", ")}>
          <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--ink)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {pts.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i === hi ? 5 : 3} fill={i === hi ? "var(--coral)" : "var(--ink)"} />
          ))}
        </svg>
        <div className="mt-1 flex justify-between text-[11px] text-faint">{labels.slice(0, values.length).map((l, i) => <span key={i}>{l}</span>)}</div>
      </div>
    );
  }
  return (
    <div className="flex min-h-[110px] flex-1 items-end gap-1.5" role="img" aria-label={values.map((v, i) => `${labels[i] ?? i + 1}: ${v}${node.unit ?? ""}`).join(", ")}>
      {values.map((v, i) => (
        <div key={i} aria-hidden className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <span className={`max-w-full truncate rounded-full px-1 font-mono text-[10px] font-semibold ${i === hi ? "bg-coral text-white" : "text-faint"}`}>{v}</span>
          <span className={`w-full rounded-[10px] ${i === hi ? "hatched-coral" : i < hi || hi < 0 ? "bg-ink" : "box-border border border-dashed border-line-strong bg-card2"}`} style={{ height: Math.max(4, Math.round((v / max) * 80)) }} />
          <span className="text-[11px] text-faint">{labels[i] ?? ""}</span>
        </div>
      ))}
    </div>
  );
}

function TimerNode({ node, ctx }: { node: Extract<SpecNode, { type: "timer" }>; ctx: Ctx }) {
  const total = Math.round(node.minutes * 60);
  const [remaining, setRemaining] = useState(total);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const segments = node.segments ?? 12;
  const { run } = ctx;
  const done = node.completeAction;
  useEffect(() => {
    if (endsAt === null) return;
    const t = setInterval(() => {
      const left = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        setEndsAt(null);
        setRemaining(total);
        if (done) run(done);
      }
    }, 250);
    return () => clearInterval(t);
  }, [endsAt, total, done, run]);
  const filled = Math.round((1 - remaining / total) * segments);
  const fmt = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <p className="m-0 font-mono text-[48px] font-medium leading-none tracking-[-0.05em]">{fmt}</p>
      {node.label && <p className="m-0 font-mono text-[13px] text-muted">{node.label}</p>}
      <div aria-hidden className="flex h-8 gap-[3px]">
        {Array.from({ length: segments }, (_, i) => (
          <span key={i} className="flex-1 rounded-[3px]" style={{ background: i < filled ? "var(--coral)" : "var(--card2)" }} />
        ))}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => { setEndsAt(null); setRemaining(total); }} className="h-9 flex-1 rounded-full border border-line text-[13px] font-medium">
          Reset
        </button>
        <button type="button" onClick={() => (endsAt ? setEndsAt(null) : setEndsAt(Date.now() + remaining * 1000))} className="h-9 flex-1 rounded-full bg-coral text-[13px] font-semibold text-white">
          {endsAt ? "Pause" : remaining < total ? "Resume" : "Start"}
        </button>
      </div>
    </div>
  );
}
