import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getWidget } from "@/lib/data";
import { refreshWidgetSources } from "@/lib/widget-sources";

/** Refreshes a widget's live data (web or connected app) and returns its new state. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Sign in first." }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const widget = await getWidget(user.id, id).catch(() => null);
  if (!widget) return NextResponse.json({ message: "Widget not found." }, { status: 404 });
  const location = typeof body.location === "string" ? body.location.slice(0, 80) : null;
  try {
    const res = await refreshWidgetSources(user.id, widget, { location });
    return NextResponse.json(res ?? { state: null });
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : "Couldn't refresh." }, { status: 502 });
  }
}
