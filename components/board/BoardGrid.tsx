"use client";

import "react-grid-layout/css/styles.css";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactGridLayout, { type Layout, type LayoutItem } from "react-grid-layout";
import { createScaledStrategy, verticalCompactor } from "react-grid-layout/core";
import { deleteWidgetAction, saveLayoutAction } from "@/app/board/actions";
import { GRID, LIMITS, SIZE_PRESETS, gridMetrics, presetFor } from "@/lib/layout";
import { SIZES } from "@/lib/registry";
import type { Widget, WidgetSize } from "@/lib/types";
import { WidgetRenderer } from "@/components/widgets";

/** Drags start from the widget header, but never from its controls. */
const DRAG_CANCEL = "button, a, input, textarea, select, label, [role=switch], [role=radio], .no-drag";

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Standard vertical compaction: widgets float up into the free space and
 * anything in the way of a dragged widget moves aside. No overlaps, ever.
 */
function compact(list: Widget[]): Widget[] {
  const byId = new Map(
    verticalCompactor.compact(
      list.map((w) => ({ i: w.id, x: w.x, y: w.y, w: w.w, h: w.h })),
      GRID.cols,
    ).map((it) => [it.i, it]),
  );
  return list.map((w) => {
    const it = byId.get(w.id);
    return it ? { ...w, x: it.x, y: it.y, w: it.w, h: it.h } : w;
  });
}

const rects = (ws: Widget[]) => ws.map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));

/**
 * The board is one 12-column layout. It fills the content width (columns and
 * row height scale together, so proportions never change) and is never
 * re-arranged by screen size; below GRID.minWidth it scales down as a whole.
 */
export function BoardGrid({ boardId, initial, filter }: { boardId: string; initial: Widget[]; filter: string }) {
  // Compact saved data so what's drawn matches what's stored.
  const [widgets, setWidgets] = useState(() => compact(initial));
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<{ id: string; kind: "drag" | "resize"; w: number; h: number } | null>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<number>(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(rects(initial));

  useEffect(() => {
    const repaired = compact(initial);
    if (repaired.some((w, i) => w.x !== initial[i].x || w.y !== initial[i].y)) void saveLayoutAction(boardId, rects(repaired)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAvailable(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Width the grid lays out at, and the scale it's drawn at.
  const width = Math.min(GRID.maxWidth, Math.max(GRID.minWidth, available || GRID.width));
  const scale = available ? Math.min(1, Math.max(GRID.minScale, available / width)) : 1;
  const { rowHeight } = gridMetrics(width);
  const positionStrategy = useMemo(() => createScaledStrategy(scale), [scale]);

  const layout: Layout = widgets.map((w) => ({ i: w.id, x: w.x, y: w.y, w: w.w, h: w.h, minW: LIMITS.minW, minH: LIMITS.minH, maxW: LIMITS.maxW, maxH: LIMITS.maxH }));
  // Content height plus one empty row to drop into.
  const rows = Math.max(0, ...widgets.map((w) => w.y + w.h)) + (active ? 3 : 1);
  const height = rows * rowHeight + (rows - 1) * GRID.margin;

  const q = filter.trim().toLowerCase();
  const matches = (w: Widget) => !q || `${w.title} ${w.type}`.toLowerCase().includes(q);

  /** Saves after drag/resize stop (debounced), rolling back if the save fails. */
  function persist(next: Widget[]) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const before = lastSaved.current;
    saveTimer.current = setTimeout(() => {
      saveLayoutAction(boardId, rects(next))
        .then(() => {
          lastSaved.current = rects(next);
          setError(null);
        })
        .catch(() => {
          setError("Couldn't save the layout, so it was put back.");
          setWidgets((ws) => ws.map((w) => ({ ...w, ...(before.find((b) => b.id === w.id) ?? {}) })));
        });
    }, 300);
  }

  /** Takes the layout exactly as react-grid-layout settled it. */
  function commit(l: Layout) {
    const byId = new Map(l.map((it: LayoutItem) => [it.i, it]));
    const next = widgets.map((w) => {
      const it = byId.get(w.id);
      return it ? { ...w, x: it.x, y: it.y, w: it.w, h: it.h } : w;
    });
    const changed = next.some((w, i) => w.x !== widgets[i].x || w.y !== widgets[i].y || w.w !== widgets[i].w || w.h !== widgets[i].h);
    setWidgets(next);
    if (changed) persist(next);
  }

  /** Places a widget at rect, then compacts the board around it. */
  function placeWithPush(id: string, rect: Rect) {
    const next = compact(widgets.map((w) => (w.id === id ? { ...w, ...rect } : w)));
    setWidgets(next);
    persist(next);
  }

  function applyPreset(id: string, size: WidgetSize) {
    const t = widgets.find((w) => w.id === id);
    if (!t) return;
    const { w, h } = SIZE_PRESETS[size];
    placeWithPush(id, { x: Math.min(t.x, GRID.cols - w), y: t.y, w, h });
  }

  function nudge(id: string, dx: number, dy: number) {
    const t = widgets.find((w) => w.id === id);
    if (!t) return;
    const x = Math.min(Math.max(t.x + dx, 0), GRID.cols - t.w);
    const y = Math.max(t.y + dy, 0);
    if (x === t.x && y === t.y) return;
    placeWithPush(id, { x, y, w: t.w, h: t.h });
  }

  function remove(id: string) {
    setWidgets((list) => list.filter((w) => w.id !== id));
    deleteWidgetAction(id).catch(() => setError("Couldn't delete that widget."));
  }

  const track = (kind: "drag" | "resize") => (_l: Layout, _o: LayoutItem | null, n: LayoutItem | null) => {
    if (n) setActive({ id: n.i, kind, w: n.w, h: n.h });
  };

  return (
    <section aria-label="Widgets" className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="m-0 flex-1 text-sm font-medium text-muted">
          Widgets <span className="text-faint">· {widgets.length}</span>
        </h2>
        <Link href={`/board/new?b=${boardId}`} className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full bg-ink px-3.5 text-[13px] font-semibold text-ink-text">
          <Plus size={15} /> New widget
        </Link>
      </div>
      {error && (
        <p role="alert" className="m-0 rounded-full bg-card px-4 py-2 text-[13px] text-coral-text">
          {error}
        </p>
      )}

      <div ref={outerRef} className="w-full overflow-x-auto overflow-y-hidden">
        {widgets.length === 0 ? (
          <Link
            href={`/board/new?b=${boardId}`}
            className="flex min-h-[230px] flex-col items-center justify-center gap-2.5 rounded-[26px] border-[1.5px] border-dashed border-line-strong p-[18px] text-center text-muted"
          >
            <span aria-hidden className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-ink text-ink-text">
              <Plus size={22} />
            </span>
            <span className="font-semibold text-text">New widget</span>
            <span className="text-[13px]">Tell Jarvis what you need</span>
          </Link>
        ) : (
          available > 0 && (
            <div className="mx-auto" style={{ width: width * scale, height: height * scale }}>
              <div
                className={`jb-grid ${active ? "jb-grid-active" : ""}`}
                style={
                  {
                    width,
                    transform: scale < 1 ? `scale(${scale})` : undefined,
                    transformOrigin: "top left",
                    "--jb-col": `${(width + GRID.margin) / GRID.cols}px`,
                    "--jb-row": `${rowHeight + GRID.margin}px`,
                  } as React.CSSProperties
                }
              >
                <ReactGridLayout
                  width={width}
                  layout={layout}
                  gridConfig={{ cols: GRID.cols, rowHeight, margin: [GRID.margin, GRID.margin], containerPadding: [0, 0] }}
                  compactor={verticalCompactor}
                  positionStrategy={positionStrategy}
                  dragConfig={{ handle: ".widget-drag", cancel: DRAG_CANCEL, threshold: 4 }}
                  resizeConfig={{ handles: ["se"] }}
                  autoSize={false}
                  style={{ height }}
                  onDragStart={track("drag")}
                  onDrag={track("drag")}
                  onResizeStart={track("resize")}
                  onResize={track("resize")}
                  onDragStop={(l) => {
                    setActive(null);
                    commit(l);
                  }}
                  onResizeStop={(l) => {
                    setActive(null);
                    commit(l);
                  }}
                >
                  {widgets.map((w) => (
                    <div key={w.id} className={`jb-item transition-opacity ${matches(w) ? "" : "opacity-25"}`}>
                      <WidgetRenderer
                        id={w.id}
                        type={w.type}
                        title={w.title}
                        size={presetFor(w.w, w.h) ?? w.size}
                        config={w.config}
                        data={w.data}
                        actions={
                          <WidgetMenu
                            title={w.title}
                            rect={w}
                            onPreset={(s) => applyPreset(w.id, s)}
                            onNudge={(dx, dy) => nudge(w.id, dx, dy)}
                            onDelete={() => remove(w.id)}
                          />
                        }
                      />
                      {active?.id === w.id && active.kind === "resize" && (
                        <span className="pointer-events-none absolute bottom-3 right-9 z-10 rounded-full bg-ink px-2.5 py-1 font-mono text-xs font-semibold text-ink-text shadow-card">
                          {active.w} × {active.h}
                        </span>
                      )}
                    </div>
                  ))}
                </ReactGridLayout>
              </div>
            </div>
          )
        )}
      </div>
    </section>
  );
}

function WidgetMenu({
  title,
  rect,
  onPreset,
  onNudge,
  onDelete,
}: {
  title: string;
  rect: Rect;
  onPreset: (s: WidgetSize) => void;
  onNudge: (dx: number, dy: number) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = presetFor(rect.w, rect.h);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const moveBtn = (label: string, Icon: typeof ArrowUp, dx: number, dy: number) => (
    <button type="button" aria-label={label} onClick={() => onNudge(dx, dy)} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-card2">
      <Icon size={15} />
    </button>
  );

  return (
    <div ref={ref} className="no-drag relative -my-1 flex shrink-0 items-center">
      <button
        type="button"
        aria-label={`Options for ${title}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-faint hover:bg-card2 hover:text-text"
      >
        <MoreHorizontal size={17} />
      </button>
      {open && (
        <div
          className="tone-reset absolute right-0 top-9 z-20 flex w-56 cursor-default flex-col gap-1 rounded-[20px] border border-line bg-card p-2 text-text shadow-card"
          onKeyDown={(e) => {
            const map: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
            if (map[e.key] && (e.target as HTMLElement).dataset.move !== undefined) {
              e.preventDefault();
              onNudge(...map[e.key]);
            }
          }}
        >
          <p className="m-0 px-2 pb-1 pt-0.5 text-xs text-faint">
            Size {current ?? "custom"} · {rect.w}×{rect.h} — drag the corner for any size
          </p>
          <div role="group" aria-label="Size presets" className="flex gap-1 rounded-full bg-card2 p-1">
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={s === current}
                onClick={() => onPreset(s)}
                className={`h-8 flex-1 rounded-full font-mono text-xs font-semibold ${s === current ? "bg-ink text-ink-text" : "text-muted hover:text-text"}`}
              >
                {s}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Move (or focus here and use arrow keys)" data-move="" tabIndex={0} className="flex items-center justify-between rounded-full px-1 outline-offset-2">
            <span className="pl-1 text-xs text-muted">Move</span>
            <span className="flex">
              {moveBtn("Move left", ArrowLeft, -1, 0)}
              {moveBtn("Move up", ArrowUp, 0, -1)}
              {moveBtn("Move down", ArrowDown, 0, 1)}
              {moveBtn("Move right", ArrowRight, 1, 0)}
            </span>
          </div>
          <button type="button" onClick={onDelete} className="flex items-center gap-2 rounded-full px-3 py-2 text-left text-coral-text hover:bg-card2">
            <Trash2 size={15} /> Remove widget
          </button>
        </div>
      )}
    </div>
  );
}
