import type { WidgetSize } from "@/lib/types";

export type WidgetProps = {
  id?: string;
  title: string;
  size: WidgetSize;
  config: Record<string, unknown>;
  data: Record<string, unknown> | null;
  /** Mini preview in the chat: no persistence, no network. */
  preview?: boolean;
  /** Extra header controls (menu, drag handle) supplied by the board. */
  actions?: React.ReactNode;
};

export const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
export const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || d);
