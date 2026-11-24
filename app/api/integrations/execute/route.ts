import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { executeTool } from "@/lib/integrations/composio";

/** Runs a write action the user explicitly confirmed in a confirm card. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Sign in first." }, { status: 401 });
  const { tool, args } = await request.json().catch(() => ({}));
  if (typeof tool !== "string" || !/^[A-Z0-9_]{3,80}$/.test(tool) || !args || typeof args !== "object" || Array.isArray(args)) {
    return NextResponse.json({ message: "Bad request." }, { status: 400 });
  }
  try {
    const res = await executeTool(user.id, tool, args as Record<string, unknown>);
    if (!res.successful) return NextResponse.json({ message: res.error || "The action failed." }, { status: 502 });
    return NextResponse.json({ ok: true, data: JSON.stringify(res.data ?? {}).slice(0, 4000) });
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : "The action failed." }, { status: 502 });
  }
}
