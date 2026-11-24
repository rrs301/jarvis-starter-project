import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isToolkitId } from "@/lib/integrations/catalog";
import { composioConfigured, startConnect } from "@/lib/integrations/composio";
import { origin, safeReturn } from "@/lib/integrations/http";

/** GET /api/integrations/connect?toolkit=gmail&popup=1&return=/board — sends the user to Composio's OAuth page. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const toolkit = url.searchParams.get("toolkit");
  const popup = url.searchParams.get("popup") === "1";
  const ret = safeReturn(url.searchParams.get("return"));
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/", request.url));
  if (!isToolkitId(toolkit)) return NextResponse.redirect(new URL("/board/integrations?error=unknown", request.url));
  if (!composioConfigured()) return NextResponse.redirect(new URL("/board/integrations?error=composio", request.url));
  const cb = new URL("/api/integrations/callback", origin(request));
  cb.searchParams.set("toolkit", toolkit);
  cb.searchParams.set("return", ret);
  if (popup) cb.searchParams.set("popup", "1");
  try {
    return NextResponse.redirect(await startConnect(user.id, toolkit, cb.toString()));
  } catch (err) {
    console.error("[integrations] connect failed:", err instanceof Error ? err.message : err);
    return NextResponse.redirect(new URL(`/board/integrations?error=connect&toolkit=${toolkit}`, request.url));
  }
}
