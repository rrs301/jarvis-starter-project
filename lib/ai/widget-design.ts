import "server-only";
import { z } from "zod";
import { SPEC_REFERENCE, lintSpec, sanitizeSpec, type WidgetSpec } from "@/lib/spec/schema";
import { presetFor } from "@/lib/layout";
import type { WidgetDraft } from "@/lib/types";

/* ---------- Step A: understand (and maybe ask) ---------- */

export const PLAN_MARKER = "@@PLAN@@";

export const UNDERSTAND_SYSTEM = `You are Jarvis. The user wants a new widget for their personal dashboard. Your job in this step is ONLY to understand the request.

Write 1-2 short, friendly sentences (plain text, no markdown) restating what you understood, then a line containing only ${PLAN_MARKER}, then one compact JSON object:
{"needsClarification": boolean,
 "questions": [{"question": string, "options": [2-4 short answers]}],
 "understood": "a precise build brief: purpose, what is tracked/shown, units/goals/time range, interactions, any initial data",
 "approaches": [{"label": "2-4 word design name", "idea": "one sentence: a visually distinct layout for the same need"}, x3],
 "toolkits": [apps whose data this widget needs, from gmail|googlecalendar|notion; [] if none],
 "edit": null | {"target": "A"|"B"|"C"|"all"|"ask", "targets": ["A"|"B"|"C", ...], "change": "the exact change to make"}}

Rules:
- Ask (needsClarification: true, 1-3 questions) ONLY when a detail that changes the widget is genuinely ambiguous and has no sensible default (e.g. "track my project" — which project, tracking tasks vs. hours vs. milestones?). Otherwise needsClarification is false and questions is [].
- Never ask about things with sensible defaults (colors, size, exact wording, layout, units commonly implied). Pick defaults yourself and state them in "understood".
- If the user has already answered your questions in this conversation, do NOT ask again: set needsClarification false and design.
- When asking, keep the sentences short and the options concrete; "approaches" may be [] then.
- The 3 approaches must be genuinely different visual approaches (e.g. big-number glance, checklist/log, chart/history, ring meter, compact strip) suited to this need.
- Editing shown designs ("edit"): when designs are already shown and the user asks to change something, this is an edit, not a new request. needsClarification must be false; questions [].
  * Explicit letters win: "make B more compact" -> target "B"; "add a reset button to A and C" -> target "A", targets ["A","C"].
  * "selected design", "this one", "it", "the current one", or no letter at all -> the SELECTED design (given below). Never apply a change to all three just because you are unsure.
  * target "all" only when the user clearly means every design ("all of them", "every design").
  * target "ask" only when nothing is selected AND it is genuinely unclear which design is meant. Then say briefly in your sentences which design you mean to ask about.
  * Keep "approaches" in the same A/B/C order (update the label of edited ones if the change alters it). "change" restates the requested change precisely.
- If the user wants all-new designs ("show 3 more", a different widget), set edit to null.
- Widgets can show live data: web lookups (places, prices, news, weather) and the user's apps (Gmail, Google Calendar, Notion). Put which source to use in "understood" and list needed apps in "toolkits". Never say a widget can't look things up.`;

const PlanSchema = z.object({
  needsClarification: z.boolean(),
  questions: z
    .array(z.object({ question: z.string().min(1).max(200), options: z.array(z.string().min(1).max(60)).max(4).default([]) }))
    .max(3)
    .default([]),
  understood: z.string().max(2000).default(""),
  approaches: z.array(z.object({ label: z.string().max(40), idea: z.string().max(300) })).max(3).default([]),
  toolkits: z.array(z.string()).max(3).default([]),
  edit: z
    .object({
      target: z.enum(["A", "B", "C", "all", "ask"]),
      targets: z.array(z.enum(["A", "B", "C"])).max(3).default([]),
      change: z.string().max(600).default(""),
    })
    .nullable()
    .default(null),
});
export type Plan = z.infer<typeof PlanSchema>;

export function parsePlan(text: string): Plan | null {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e < s) return null;
  try {
    const p = PlanSchema.safeParse(JSON.parse(text.slice(s, e + 1)));
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}

/** Splits the streamed understanding text from the trailing plan JSON. */
export function createPlanSplitter(onText: (t: string) => void) {
  let buf = "";
  let after: string | null = null;
  return {
    push(chunk: string) {
      if (after !== null) {
        after += chunk;
        return;
      }
      buf += chunk;
      const i = buf.indexOf(PLAN_MARKER);
      if (i >= 0) {
        if (i > 0) onText(buf.slice(0, i));
        after = buf.slice(i + PLAN_MARKER.length);
        buf = "";
        return;
      }
      const safe = buf.length - PLAN_MARKER.length;
      if (safe > 0) {
        onText(buf.slice(0, safe));
        buf = buf.slice(safe);
      }
    },
    /** Returns the JSON part (or the whole text if the marker never came). */
    end(): string {
      if (after !== null) return after;
      const rest = buf;
      buf = "";
      const j = rest.indexOf("{");
      if (j > 0) onText(rest.slice(0, j));
      return j >= 0 ? rest.slice(j) : rest;
    },
  };
}

/* ---------- Step B: generate a new widget spec ---------- */

export const DESIGN_SPEC_SYSTEM = `You design dashboard widgets as declarative JSON specs that a renderer draws with a fixed design system (rounded cards, black pills, coral accent, mono big numbers). You never write code or HTML.

${SPEC_REFERENCE}

Design rules:
- Build exactly what the brief needs, as a NEW design for this approach. Make it useful immediately: realistic initial state (sample items/values only when they help; prefer empty lists the user fills).
- Every interactive part must be wired: inputs/buttons use actions on existing state keys; checklists/lists/charts bind to state keys you define with the right types (lists = arrays of {"text": ...}; charts = number arrays).
- Keep it compact and readable at the chosen size; 4-20 nodes is typical. One root container (usually stack).
- Size: S≈{w:3,h:7}, M≈{w:4,h:7}, L≈{w:6,h:7}; pick what fits the content (h up to 10 for long lists). Width per column ≈ 95px, so a w:3 widget is ~270px wide: keep rows short.
Layout rules (the renderer is strict, follow them):
- Lists of things with details (hotels, emails, tasks): use list with metaFields for details like price/distance/rating; never put multi-part details in tags.
- tags are only for 1-3 word labels (max 18 chars), at most 4 per row.
- Put at most 2 buttons in a row; button labels 1-3 words.
- stat values are short numbers ("5", "2,450", "78%"); use "of" for denominators.
- Visible list items: S/M ≤ 5, L ≤ 8. Initial state lists should respect that.
- Don't nest more than 3 containers deep. Prefer stack > row > (text|stat|button).
- Output ONLY the JSON object, no prose, no code fences.`;

export function designPrompt(brief: string, approach: { label: string; idea: string }, revision?: { previous: WidgetSpec; change: string; letter: string }) {
  let p = `Brief: ${brief}\n\nApproach "${approach.label}": ${approach.idea}`;
  if (revision)
    p += `\n\nRevise design ${revision.letter}. Apply exactly this change and keep everything else (structure, state keys, style) unless the change requires otherwise: "${revision.change}"\nCurrent spec of design ${revision.letter}:\n${JSON.stringify(revision.previous)}`;
  return p;
}

/** Resolves which designs an edit applies to, from the model's decision plus the user's selection. */
export function resolveTargets(plan: Plan, selected: number | null, available: boolean[]): { targets: number[] } | { ask: true } | null {
  const e = plan.edit;
  if (!e || !available.some(Boolean)) return null;
  const idx = (l: "A" | "B" | "C") => ["A", "B", "C"].indexOf(l);
  let targets: number[];
  if (e.target === "all") targets = [0, 1, 2];
  else if (e.target === "ask") {
    if (selected === null) return { ask: true };
    targets = [selected];
  } else targets = Array.from(new Set([idx(e.target), ...e.targets.map(idx)]));
  targets = targets.filter((i) => available[i]).sort();
  return targets.length ? { targets } : selected !== null ? { targets: [selected] } : { ask: true };
}

export function specToDraft(spec: WidgetSpec, label: string, brief: string): WidgetDraft {
  return {
    type: "custom",
    title: spec.title,
    size: presetFor(spec.size.w, spec.size.h) ?? (spec.size.w <= 3 ? "S" : spec.size.w >= 6 ? "L" : "M"),
    w: spec.size.w,
    h: spec.size.h,
    config: { spec },
    context: { intent: brief.slice(0, 1000), source: "jarvis-generated" },
    label: label.slice(0, 40),
  };
}

export function parseSpec(text: string): WidgetSpec | null {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e < s) return null;
  try {
    const spec = sanitizeSpec(JSON.parse(text.slice(s, e + 1)));
    return spec ? lintSpec(spec) : null;
  } catch {
    return null;
  }
}
