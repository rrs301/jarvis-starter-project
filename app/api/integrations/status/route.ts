import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { composioConfigured, getConnections, syncConnections } from "@/lib/integrations/composio";

/** GET ?sync=1 re-reads connections from Composio. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Sign in first." }, { status: 401 });
  const sync = new URL(request.url).searchParams.get("sync") === "1";
  const configured = composioConfigured();
  const connections = configured && sync ? await syncConnections(user.id).catch(() => getConnections(user.id)) : await getConnections(user.id);
  return NextResponse.json({ configured, connections });
}
