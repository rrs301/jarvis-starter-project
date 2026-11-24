import type { WidgetSize } from "./types";

/** The board is one fixed 12-column grid; it scales as a whole, never reflows. */
export const GRID = {
  cols: 12,
  rowHeight: 40,
  margin: 16,
  /** Reference width (used for previews and as the row-height baseline). */
  width: 1200,
  /** The board fills the content width between these; below min it scales down. */
  minWidth: 980,
  maxWidth: 1680,
  minScale: 0.5,
} as const;

/** Row height keeps a fixed ratio to column width, so widgets keep their proportions at any width. */
export const ROW_RATIO = GRID.rowHeight / ((GRID.width - (GRID.cols - 1) * GRID.margin) / GRID.cols);

export function gridMetrics(width: number) {
  const col = (width - (GRID.cols - 1) * GRID.margin) / GRID.cols;
  return { col, rowHeight: Math.round(col * ROW_RATIO) };
}

export const SIZE_PRESETS: Record<WidgetSize, { w: number; h: number }> = {
  S: { w: 3, h: 7 },
  M: { w: 4, h: 7 },
  L: { w: 6, h: 7 },
};

export const LIMITS = { minW: 2, minH: 4, maxW: 12, maxH: 24 };

export type Rect = { x: number; y: number; w: number; h: number };

export function clampRect(r: Rect): Rect {
  const w = Math.min(Math.max(Math.round(r.w), LIMITS.minW), LIMITS.maxW);
  const h = Math.min(Math.max(Math.round(r.h), LIMITS.minH), LIMITS.maxH);
  const x = Math.min(Math.max(Math.round(r.x), 0), GRID.cols - w);
  const y = Math.max(Math.round(r.y), 0);
  return { x, y, w, h };
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** First free spot scanning rows top to bottom, left to right. */
export function findFreeSpot(taken: Rect[], w: number, h: number): Rect {
  for (let y = 0; y < 500; y++) {
    for (let x = 0; x <= GRID.cols - w; x++) {
      const r = { x, y, w, h };
      if (!taken.some((t) => overlaps(t, r))) return r;
    }
  }
  return { x: 0, y: Math.max(0, ...taken.map((t) => t.y + t.h)), w, h };
}

/** Name of the preset matching a size, or null for a custom size. */
export function presetFor(w: number, h: number): WidgetSize | null {
  return (Object.keys(SIZE_PRESETS) as WidgetSize[]).find((k) => SIZE_PRESETS[k].w === w && SIZE_PRESETS[k].h === h) ?? null;
}
