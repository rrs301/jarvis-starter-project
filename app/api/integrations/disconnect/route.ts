import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isToolkitId } from "@/lib/integrations/catalog";
import { disconnect, getConnections } from "@/lib/integrations/composio";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Sign in first." }, { status: 401 });
  const { toolkit } = await request.json().catch(() => ({}));
  if (!isToolkitId(toolkit)) return NextResponse.json({ message: "Unknown toolkit." }, { status: 400 });
  try {
    await disconnect(user.id, toolkit);
    return NextResponse.json({ connections: await getConnections(user.id) });
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : "Couldn't disconnect." }, { status: 502 });
  }
}
