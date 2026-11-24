"use client";

import { useEffect, useRef, useState } from "react";
import { GRID } from "@/lib/layout";

const colPx = (GRID.width - (GRID.cols - 1) * GRID.margin) / GRID.cols;

/** Real board pixel size of a w×h widget. */
export function boardSize(w: number, h: number) {
  return { width: Math.round(w * colPx + (w - 1) * GRID.margin), height: h * GRID.rowHeight + (h - 1) * GRID.margin };
}

/**
 * Renders a widget at its true board size, scaled down to fit the preview
 * tile, so the picker shows exactly what lands on the board (never clipped).
 */
export function ScaledPreview({ w, h, children }: { w: number; h: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(0);
  const { width, height } = boardSize(w, h);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAvail(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = avail ? Math.min(1, avail / width) : 0;
  return (
    <div ref={ref} className="w-full" style={{ height: scale ? height * scale : 200 }}>
      {scale > 0 && (
        <div inert className="pointer-events-none origin-top-left select-none" style={{ width, height, transform: `scale(${scale})` }}>
          {children}
        </div>
      )}
    </div>
  );
}
