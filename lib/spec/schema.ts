import { z } from "zod";

/**
 * Declarative widget spec: a JSON tree of safe UI primitives plus initial
 * state and simple actions. AI-generated, validated here, rendered by
 * components/widgets/CustomWidget.tsx. No code is ever executed from a spec.
 */

export const ICONS = [
  "sparkles", "droplet", "book", "check", "list", "timer", "calendar", "chart", "target", "flame", "heart", "dumbbell",
  "coffee", "moon", "sun", "music", "dollar", "folder", "briefcase", "star", "lightbulb", "pencil", "clock", "bell", "leaf", "trophy",
] as const;

const key = z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]{0,39}$/);
const short = (n: number) => z.string().max(n);

/** A value shown in the UI: literal, or computed from state. */
export const ExprSchema = z.union([
  z.number(),
  short(80),
  z.object({ bind: key }).strict(),
  z.object({ count: key }).strict(),
  z.object({ countDone: key }).strict(),
  z.object({ sum: key }).strict(),
]);
export type Expr = z.infer<typeof ExprSchema>;

const indexRef = z.union([z.number().int().min(0).max(60), z.literal("today")]);

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("addItem"), key, fields: z.record(z.string(), z.union([z.string().max(80), z.number(), z.boolean()])).optional() }).strict(),
  z.object({ type: z.literal("increment"), key, by: z.number().min(-1000).max(1000).optional(), min: z.number().optional(), max: z.number().optional(), index: indexRef.optional() }).strict(),
  z.object({ type: z.literal("set"), key, value: z.union([z.string().max(200), z.number(), z.boolean(), z.literal("$input")]) }).strict(),
  z.object({ type: z.literal("reset"), key: key.optional() }).strict(),
  z.object({ type: z.literal("ai"), key, prompt: short(300), count: z.number().int().min(1).max(10).optional(), mode: z.enum(["replace", "append"]).optional() }).strict(),
]);
export type Action = z.infer<typeof ActionSchema>;

/** Optional visibility condition on any node, e.g. show a "Goal reached" card. */
export const WhenSchema = z
  .object({
    key,
    measure: z.enum(["value", "count", "countDone"]).optional(),
    op: z.enum(["gte", "gt", "lte", "lt", "eq", "ne"]),
    value: z.union([z.number(), z.string().max(80), z.boolean()]),
  })
  .strict();
export type When = z.infer<typeof WhenSchema>;

const gap = z.enum(["xs", "sm", "md", "lg"]).optional();
const tone = z.enum(["default", "muted", "faint", "coral", "green", "amber"]).optional();

/** Per-node props schemas (children are validated separately, recursively). */
export const NODE_SCHEMAS = {
  stack: z.object({ type: z.literal("stack"), gap, fill: z.boolean().optional() }),
  row: z.object({ type: z.literal("row"), gap, align: z.enum(["start", "center", "between", "end"]).optional(), wrap: z.boolean().optional() }),
  grid: z.object({ type: z.literal("grid"), cols: z.number().int().min(2).max(4), gap }),
  card: z.object({ type: z.literal("card"), tone: z.enum(["plain", "soft", "coral", "ink"]).optional(), gap }),
  heading: z.object({ type: z.literal("heading"), text: short(120), size: z.enum(["sm", "md", "lg"]).optional() }),
  text: z.object({ type: z.literal("text"), text: short(400), tone, size: z.enum(["xs", "sm", "md", "lg"]).optional(), mono: z.boolean().optional(), weight: z.enum(["normal", "medium", "semibold"]).optional() }),
  stat: z.object({ type: z.literal("stat"), value: ExprSchema, label: short(60).optional(), unit: short(16).optional(), of: ExprSchema.optional(), size: z.enum(["md", "lg", "xl"]).optional() }),
  progress: z.object({ type: z.literal("progress"), value: ExprSchema, max: ExprSchema, style: z.enum(["bar", "segments", "ring", "dots"]).optional(), segments: z.number().int().min(2).max(40).optional(), label: short(60).optional(), tone: z.enum(["coral", "ink", "green"]).optional() }),
  list: z.object({
    type: z.literal("list"),
    bind: key,
    style: z.enum(["plain", "cards", "sticky", "numbered"]).optional(),
    removable: z.boolean().optional(),
    empty: short(120).optional(),
    secondaryField: key.optional(),
    /** Fields shown as one muted meta line under the title, joined with " · ". */
    metaFields: z.array(key).max(4).optional(),
    /** Short field shown as a pill at the row's end (e.g. a rating or price). */
    badgeField: key.optional(),
    /** Field holding an https link; the row title opens it. */
    linkField: key.optional(),
  }),
  checklist: z.object({ type: z.literal("checklist"), bind: key, removable: z.boolean().optional(), empty: short(120).optional(), timeField: key.optional() }),
  input: z.object({ type: z.literal("input"), placeholder: short(80).optional(), kind: z.enum(["text", "number", "time"]).optional(), submitLabel: short(24).optional(), action: ActionSchema }),
  button: z.object({ type: z.literal("button"), label: short(40), variant: z.enum(["primary", "secondary", "coral", "ghost"]).optional(), icon: z.enum(["plus", "minus", "reset", "sparkles", "check", "play"]).optional(), action: ActionSchema, full: z.boolean().optional() }),
  toggle: z.object({ type: z.literal("toggle"), label: short(60), bind: key }),
  chart: z.object({ type: z.literal("chart"), kind: z.enum(["bar", "line"]), bind: key, labels: z.array(short(12)).max(31).optional(), highlight: z.union([z.literal("today"), z.literal("last"), z.number().int()]).optional(), unit: short(12).optional(), goal: z.number().optional() }),
  timer: z.object({ type: z.literal("timer"), minutes: z.number().min(1).max(180), label: short(60).optional(), segments: z.number().int().min(4).max(40).optional(), completeAction: ActionSchema.optional() }),
  tags: z.object({ type: z.literal("tags"), items: z.array(short(40)).max(12), tone: z.enum(["soft", "coral", "ink"]).optional() }),
  image: z.object({ type: z.literal("image"), url: z.string().url().max(500).refine((u) => u.startsWith("https://"), "https only"), alt: short(120), height: z.number().int().min(40).max(400).optional() }),
  divider: z.object({ type: z.literal("divider") }),
  spacer: z.object({ type: z.literal("spacer") }),
} as const;

export type NodeType = keyof typeof NODE_SCHEMAS;
export const CONTAINERS: NodeType[] = ["stack", "row", "grid", "card"];

type NodeProps = { [K in NodeType]: z.infer<(typeof NODE_SCHEMAS)[K]> }[NodeType];
export type SpecNode = NodeProps & { children?: SpecNode[]; when?: When };

/** Live data bound to a list state key, refreshed by the server (never by AI-written code). */
export const SourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("web"), query: z.string().min(3).max(200), fields: z.array(key).max(4).optional(), max: z.number().int().min(1).max(10).optional() }).strict(),
  z.object({
    kind: z.literal("app"),
    source: z.enum(["gmail.unread", "gmail.recent", "calendar.today", "calendar.week", "notion.search"]),
    query: z.string().max(200).optional(),
    max: z.number().int().min(1).max(10).optional(),
  }).strict(),
]);
export type Source = z.infer<typeof SourceSchema>;

export const SOURCE_TOOLKIT: Record<Extract<Source, { kind: "app" }>["source"], "gmail" | "googlecalendar" | "notion"> = {
  "gmail.unread": "gmail",
  "gmail.recent": "gmail",
  "calendar.today": "googlecalendar",
  "calendar.week": "googlecalendar",
  "notion.search": "notion",
};

export type WidgetSpec = {
  version: 1;
  /** Optional live data per list state key. */
  sources?: Record<string, Source>;
  title: string;
  icon: (typeof ICONS)[number];
  /** Initial state; widget_data.state holds the live copy. */
  state: Record<string, unknown>;
  root: SpecNode;
  /** Suggested grid size (12-col grid, rows of 40px). */
  size: { w: number; h: number };
};

const MAX_NODES = 80;
const MAX_DEPTH = 7;

/** Validates one node and its children; invalid nodes are dropped. */
function sanitizeNode(raw: unknown, depth: number, budget: { n: number }): SpecNode | null {
  if (!raw || typeof raw !== "object" || depth > MAX_DEPTH || budget.n >= MAX_NODES) return null;
  const obj = raw as Record<string, unknown>;
  const type = obj.type as NodeType;
  const schema = NODE_SCHEMAS[type];
  if (!schema) return null;
  const { children, when, ...props } = obj;
  const parsed = schema.safeParse(props);
  if (!parsed.success) return null;
  budget.n++;
  const node = parsed.data as SpecNode;
  if (when !== undefined) {
    const w = WhenSchema.safeParse(when);
    if (w.success) node.when = w.data;
  }
  if (CONTAINERS.includes(type)) {
    const kids = (Array.isArray(children) ? children : []).map((c) => sanitizeNode(c, depth + 1, budget)).filter((c): c is SpecNode => c !== null);
    if (!kids.length) return null;
    node.children = kids;
  }
  return node;
}

/** Keeps only JSON-safe state of limited size. */
function sanitizeState(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!key.safeParse(k).success) continue;
    if (typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length <= 400)) out[k] = v;
    else if (Array.isArray(v) && v.length <= 60) {
      out[k] = v
        .map((item, i) => {
          if (typeof item === "number") return item;
          if (typeof item === "string") return { id: `s${i}`, text: item.slice(0, 200), done: false };
          if (item && typeof item === "object") {
            const o = item as Record<string, unknown>;
            return { id: typeof o.id === "string" ? o.id.slice(0, 40) : `s${i}`, text: String(o.text ?? o.title ?? o.name ?? "").slice(0, 200), done: Boolean(o.done), ...Object.fromEntries(Object.entries(o).filter(([fk, fv]) => !["id", "text", "done"].includes(fk) && (typeof fv === "string" || typeof fv === "number" || typeof fv === "boolean")).slice(0, 6)) };
          }
          return null;
        })
        .filter((x) => x !== null);
    }
  }
  return JSON.stringify(out).length > 20_000 ? {} : out;
}

export function sanitizeSpec(raw: unknown): WidgetSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const root = sanitizeNode(o.root, 0, { n: 0 });
  if (!root) return null;
  const sz = (o.size ?? {}) as Record<string, unknown>;
  const w = Math.min(Math.max(Math.round(Number(sz.w) || 4), 2), 12);
  const h = Math.min(Math.max(Math.round(Number(sz.h) || 7), 4), 16);
  const icon = (ICONS as readonly string[]).includes(String(o.icon)) ? (o.icon as WidgetSpec["icon"]) : "sparkles";
  const sources: Record<string, Source> = {};
  if (o.sources && typeof o.sources === "object" && !Array.isArray(o.sources)) {
    for (const [k, v] of Object.entries(o.sources as Record<string, unknown>).slice(0, 3)) {
      const p = SourceSchema.safeParse(v);
      if (key.safeParse(k).success && p.success) sources[k] = p.data;
    }
  }
  const state = sanitizeState(o.state);
  for (const k of Object.keys(sources)) if (!Array.isArray(state[k])) state[k] = [];
  return {
    version: 1,
    title: String(o.title || "New widget").slice(0, 60),
    icon,
    state,
    root,
    size: { w, h },
    ...(Object.keys(sources).length ? { sources } : {}),
  };
}

/** Prompt reference for the model: the primitives it may use. */
export const SPEC_REFERENCE = `WidgetSpec JSON:
{"title": string, "icon": one of ${ICONS.join("|")}, "size": {"w": 2-12 columns of a 12-col grid (~95px each), "h": 4-16 rows (~56px each)},
 "sources"?: { listKey: Source }   // live data the server fills into that list state key and refreshes on a schedule
   Source = {"kind":"web","query":"what to look up, specific (e.g. 'top rated hotels in Panaji Goa with price per night')","fields"?:[up to 4 extra item fields, e.g. "price","rating","area","url"],"max"?:1-10}
          | {"kind":"app","source":"gmail.unread"|"gmail.recent"|"calendar.today"|"calendar.week"|"notion.search","query"?:string,"max"?:1-10}
   App items have fields: gmail -> text(subject), from, time, url; calendar -> text(title), time, location; notion -> text(title), url, edited.
   Use a source whenever the widget needs real-world or app data (places, prices, news, email, events) instead of inventing sample items; leave that list empty in "state".
 "state": { key: number | boolean | string | number[] | list },   // list items: {"text": string, "done"?: boolean, ...extra string/number fields}
 "root": Node}
Expressions (Expr): a literal, or {"bind":key} | {"count":listKey} | {"countDone":listKey} | {"sum":numberArrayKey}.
Text fields may interpolate state: "{{key}}", "{{count:list}}", "{{countDone:list}}", "{{sum:nums}}".
Actions: {"type":"addItem","key":list,"fields"?:{}} (adds input text as an item) | {"type":"increment","key","by"?,"min"?,"max"?,"index"?:n|"today"} (index targets an element of a number array; "today" = Mon..Sun index) | {"type":"set","key","value": literal|"$input"} | {"type":"reset","key"?} | {"type":"ai","key":list,"prompt","count"?,"mode"?:"replace"|"append"} (AI writes list items; prompt may use {{key}}).
Any node may have "when": {"key", "measure"?: value|count|countDone, "op": gte|gt|lte|lt|eq|ne, "value"} to show it only when the condition holds (e.g. a "Goal reached" card when glasses >= 8).
Nodes (containers have "children": Node[]):
 stack{gap?:xs|sm|md|lg, fill?} row{gap?, align?:start|center|between|end, wrap?} grid{cols:2-4, gap?} card{tone?:plain|soft|coral|ink, gap?}
 heading{text, size?:sm|md|lg} text{text, tone?:default|muted|faint|coral|green|amber, size?:xs|sm|md|lg, mono?, weight?}
 stat{value:Expr, label?, unit?, of?:Expr, size?:md|lg|xl}   // big mono number
 progress{value:Expr, max:Expr, style?:bar|segments|ring|dots, segments?, label?, tone?:coral|ink|green}
 list{bind:listKey, style?:plain|cards|sticky|numbered, removable?, empty?, secondaryField?, metaFields?:[fields shown as one muted "a · b · c" line], badgeField?:short field shown as an end pill, linkField?:https url field}
 checklist{bind:listKey, removable?, empty?, timeField?}   // toggles item.done
 input{placeholder?, kind?:text|number|time, submitLabel?, action:Action}   // runs action with the typed value as $input
 button{label, variant?:primary|secondary|coral|ghost, icon?:plus|minus|reset|sparkles|check|play, action, full?}
 toggle{label, bind:booleanKey}
 chart{kind:bar|line, bind:numberArrayKey, labels?, highlight?:"today"|"last"|index, unit?, goal?}
 timer{minutes, label?, segments?, completeAction?}   // self-contained countdown with start/pause/reset
 tags{items: 1-3 word strings (max 18 chars each), tone?:soft|coral|ink}  image{url:https, alt, height?}  divider{}  spacer{}`;


/* ---------- Layout lint ---------- */

const LIST_BUDGET = (h: number) => (h <= 6 ? 4 : h <= 8 ? 6 : h <= 10 ? 8 : 12);

/**
 * Fixes common layout problems in generated specs before they're shown:
 * long or multi-part chips become a muted text line, long stat values become
 * headings, long button labels are shortened, and list state is trimmed to
 * what fits the widget's height.
 */
export function lintSpec(spec: WidgetSpec): WidgetSpec {
  const fix = (n: SpecNode): SpecNode => {
    if (n.children) n = { ...n, children: n.children.map(fix) };
    if (n.type === "tags") {
      const bad = n.items.length > 6 || n.items.some((t) => t.length > 18 || /[·•|]/.test(t));
      if (bad) return { type: "text", text: n.items.join(" · "), tone: "muted", size: "sm", ...(n.when ? { when: n.when } : {}) } as SpecNode;
    }
    if (n.type === "stat" && typeof n.value === "string" && n.value.length > 9) {
      return { type: "heading", text: n.value, size: "md", ...(n.when ? { when: n.when } : {}) } as SpecNode;
    }
    if (n.type === "button" && n.label.length > 22) return { ...n, label: n.label.slice(0, 20).trimEnd() + "…" };
    if (n.type === "row" && n.wrap === undefined) return { ...n, wrap: true };
    return n;
  };
  const budget = LIST_BUDGET(spec.size.h);
  const state = Object.fromEntries(
    Object.entries(spec.state).map(([k, v]) => [k, Array.isArray(v) && v.length && typeof v[0] === "object" ? v.slice(0, budget) : v]),
  );
  return { ...spec, state, root: fix(spec.root) };
}
