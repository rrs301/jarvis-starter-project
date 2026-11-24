import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isToolkitId } from "@/lib/integrations/catalog";
import { syncConnections } from "@/lib/integrations/composio";
import { safeReturn } from "@/lib/integrations/http";

/** Composio sends the user back here after OAuth. We re-read their connections from Composio. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const toolkit = url.searchParams.get("toolkit");
  const popup = url.searchParams.get("popup") === "1";
  const ret = safeReturn(url.searchParams.get("return"));
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/", request.url));
  let connected = false;
  try {
    const list = await syncConnections(user.id);
    connected = isToolkitId(toolkit) && list.some((c) => c.toolkit === toolkit && c.status === "connected");
  } catch (err) {
    console.error("[integrations] callback sync failed:", err instanceof Error ? err.message : err);
  }
  if (popup) {
    // Tell the chat that opened this window, then close it.
    const payload = JSON.stringify({ type: "jb-connected", toolkit: isToolkitId(toolkit) ? toolkit : null, connected });
    const html = `<!doctype html><meta charset="utf-8"><title>Connected</title><body style="font-family:system-ui;padding:24px">${connected ? "Connected. You can close this window." : "Connection not completed. You can close this window."}<script>try{window.opener&&window.opener.postMessage(${payload},location.origin)}catch(e){}setTimeout(function(){window.close()},400)</script></body>`;
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  const back = new URL(ret, request.url);
  back.searchParams.set(connected ? "connected" : "connect_failed", String(toolkit));
  return NextResponse.redirect(back);
}
