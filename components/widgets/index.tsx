"use client";

import type { ComponentType } from "react";
import type { WidgetType } from "@/lib/types";
import { CustomWidget } from "./CustomWidget";
import { FocusWidget } from "./FocusWidget";
import { IdeasWidget } from "./IdeasWidget";
import { InboxWidget } from "./InboxWidget";
import { NotesWidget } from "./NotesWidget";
import { TodayWidget } from "./TodayWidget";
import { WeeklyWidget } from "./WeeklyWidget";
import type { WidgetProps } from "./types";

export const WIDGET_COMPONENTS: Record<WidgetType, ComponentType<WidgetProps>> = {
  notes: NotesWidget,
  ideas: IdeasWidget,
  focus: FocusWidget,
  today: TodayWidget,
  weekly: WeeklyWidget,
  inbox: InboxWidget,
  custom: CustomWidget,
};

export function WidgetRenderer(props: WidgetProps & { type: WidgetType }) {
  const { type, ...rest } = props;
  const C = WIDGET_COMPONENTS[type];
  return C ? <C {...rest} /> : null;
}
