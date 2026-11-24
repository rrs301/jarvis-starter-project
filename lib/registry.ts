import type { WidgetSize, WidgetType } from "./types";

export type TemplateSpec = {
  type: WidgetType;
  name: string;
  description: string;
  defaultSize: WidgetSize;
  defaultConfig: Record<string, unknown>;
  /** Description of config fields, used in the LLM prompt. */
  configHelp: string;
};

export const TEMPLATES: Record<WidgetType, TemplateSpec> = {
  notes: {
    type: "notes",
    name: "Smart Notes",
    description: "Quick notes the user can add, list and delete.",
    defaultSize: "M",
    defaultConfig: { layout: "list", placeholder: "Jot something down…", starter: [] },
    configHelp:
      'layout: "list" | "sticky" (sticky = colourful sticky-note tiles); placeholder: string; starter: string[] (0-4 initial notes)',
  },
  ideas: {
    type: "ideas",
    name: "Idea Generator",
    description: "Generates AI ideas for a topic; user can star favourites and regenerate.",
    defaultSize: "M",
    defaultConfig: { topic: "YouTube video ideas", count: 5, style: "list" },
    configHelp: 'topic: string; count: 3-8; style: "list" | "cards"',
  },
  focus: {
    type: "focus",
    name: "Focus timer",
    description: "Pomodoro-style countdown with a progress ring and daily session dots.",
    defaultSize: "S",
    defaultConfig: { minutes: 25, breakMinutes: 5, sessionGoal: 4, label: "Deep work" },
    configHelp: "minutes: 5-90; breakMinutes: 1-30; sessionGoal: 1-8 (sessions per day, shown as dots); label: string",
  },
  today: {
    type: "today",
    name: "Today",
    description: "Timeline of today's tasks with time pills. Local tasks now; calendar sync later.",
    defaultSize: "M",
    defaultConfig: {
      density: "comfortable",
      starter: [
        { time: "09:00", title: "Plan the day" },
        { time: "11:30", title: "Deep work block" },
        { time: "15:00", title: "Review & reply" },
      ],
    },
    configHelp:
      'density: "compact" | "comfortable"; starter: {time:"HH:MM", title:string}[] (2-6 initial items relevant to the request)',
  },
  weekly: {
    type: "weekly",
    name: "Weekly bars",
    description: "Seven-day bar chart for one metric; today's bar is highlighted.",
    defaultSize: "S",
    defaultConfig: { metric: "Focus hours", unit: "h", values: [3, 5, 4, 6, 2, 1, 0], goal: 4 },
    configHelp: "metric: string; unit: short string; values: 7 numbers Mon..Sun; goal: number (optional)",
  },
  inbox: {
    type: "inbox",
    name: "Inbox Brief",
    description: "Summary of important email. Placeholder until Gmail connects (phase 2).",
    defaultSize: "M",
    defaultConfig: { focus: "Important & unread" },
    configHelp: "focus: string (what to brief on)",
  },
  custom: {
    type: "custom",
    name: "Custom widget",
    description: "A widget Jarvis designed from scratch, stored as a declarative UI spec.",
    defaultSize: "M",
    defaultConfig: {},
    configHelp: "spec: WidgetSpec",
  },
};

export const WIDGET_TYPES = Object.keys(TEMPLATES) as WidgetType[];
export const SIZES: WidgetSize[] = ["S", "M", "L"];

export function isWidgetType(v: unknown): v is WidgetType {
  return typeof v === "string" && v in TEMPLATES;
}
export function isSize(v: unknown): v is WidgetSize {
  return v === "S" || v === "M" || v === "L";
}
