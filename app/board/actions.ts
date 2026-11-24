"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import * as data from "@/lib/data";
import { TEMPLATES, isSize, isWidgetType } from "@/lib/registry";
import type { WidgetDraft } from "@/lib/types";

export async function addWidgetAction(boardId: string, draft: WidgetDraft) {
  const user = await requireUser();
  if (!isWidgetType(draft.type)) throw new Error("Unknown widget type");
  const id = await data.addWidget(user.id, boardId, {
    type: draft.type,
    title: String(draft.title || TEMPLATES[draft.type].name).slice(0, 60),
    size: isSize(draft.size) ? draft.size : TEMPLATES[draft.type].defaultSize,
    config: draft.config ?? {},
    context: draft.context ?? {},
    label: draft.label ?? "",
    w: typeof draft.w === "number" ? draft.w : undefined,
    h: typeof draft.h === "number" ? draft.h : undefined,
  });
  revalidatePath("/board");
  return id;
}

/** Persists grid placement (x, y, w, h) after a drag or resize. */
export async function saveLayoutAction(boardId: string, items: Array<{ id: string; x: number; y: number; w: number; h: number }>) {
  const user = await requireUser();
  const clean = items
    .slice(0, 200)
    .filter((i) => typeof i.id === "string" && [i.x, i.y, i.w, i.h].every((n) => Number.isFinite(n)));
  await data.saveLayout(user.id, boardId, clean);
}

export async function deleteWidgetAction(widgetId: string) {
  const user = await requireUser();
  await data.deleteWidget(user.id, widgetId);
  revalidatePath("/board");
}

export async function saveWidgetDataAction(widgetId: string, payload: Record<string, unknown>) {
  const user = await requireUser();
  if (JSON.stringify(payload).length > 200_000) throw new Error("Widget data too large");
  await data.setWidgetData(user.id, widgetId, payload);
}

export async function updateWidgetConfigAction(widgetId: string, config: Record<string, unknown>) {
  const user = await requireUser();
  await data.updateWidget(user.id, widgetId, { config });
}
