export type WidgetSize = "S" | "M" | "L";
export type WidgetType = "notes" | "ideas" | "focus" | "today" | "weekly" | "inbox" | "custom";

export type Board = { id: string; userId: string; name: string; order: number };

export type Widget = {
  id: string;
  boardId: string;
  userId: string;
  type: WidgetType;
  title: string;
  size: WidgetSize;
  position: number;
  /** Grid placement (12 columns). */
  x: number;
  y: number;
  w: number;
  h: number;
  config: Record<string, unknown>;
  context: Record<string, unknown>;
  refreshRule: string | null;
  createdAt: string;
  data: Record<string, unknown> | null;
  dataUpdatedAt: string | null;
};

/** A widget design proposed by Jarvis, not yet on a board. */
export type WidgetDraft = {
  type: WidgetType;
  title: string;
  size: WidgetSize;
  config: Record<string, unknown>;
  context: Record<string, unknown>;
  /** Short label explaining the design idea, e.g. "Compact checklist". */
  label: string;
  /** Optional explicit grid size (overrides the S/M/L preset). */
  w?: number;
  h?: number;
};

export type SessionUser = { id: string; email: string; name: string | null; image: string | null };
