"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { saveWidgetDataAction } from "@/app/board/actions";

/**
 * Local widget state that persists to widget_data (debounced).
 * In preview mode nothing is saved.
 */
export function useWidgetData<T extends Record<string, unknown>>(
  widgetId: string | undefined,
  initial: T,
  preview: boolean,
): [T, (next: T | ((prev: T) => T)) => void, "idle" | "saving" | "error"] {
  const [data, setData] = useState<T>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<T>(initial);

  const flush = useCallback(async () => {
    if (!widgetId || preview) return;
    setStatus("saving");
    try {
      await saveWidgetDataAction(widgetId, latest.current);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }, [widgetId, preview]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setData((prev) => {
        const value = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        latest.current = value;
        return value;
      });
      if (!widgetId || preview) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 500);
    },
    [flush, widgetId, preview],
  );

  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current);
      void flush();
    }
  }, [flush]);

  return [data, update, status];
}

function subscribeMinute(cb: () => void) {
  const id = setInterval(cb, 15_000);
  return () => clearInterval(id);
}
const minuteSnapshot = () => Math.floor(Date.now() / 60_000);
const nullSnapshot = () => null;

/** Current time (minute resolution) on the client; null during SSR. */
export function useNow(): Date | null {
  const m = useSyncExternalStore(subscribeMinute, minuteSnapshot, nullSnapshot);
  return m === null ? null : new Date(m * 60_000);
}

export const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
