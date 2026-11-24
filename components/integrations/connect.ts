"use client";

import { useEffect } from "react";
import type { ToolkitId } from "@/lib/integrations/catalog";

/**
 * Opens Composio's OAuth flow in a popup (falls back to a full-page redirect
 * if popups are blocked). `resume` is appended to the return URL so the page
 * can pick the original request back up.
 */
export function openConnect(toolkit: ToolkitId, opts: { resume?: string } = {}) {
  const here = window.location.pathname + window.location.search;
  const ret = opts.resume ? `${here}${here.includes("?") ? "&" : "?"}resume=${encodeURIComponent(opts.resume)}` : here;
  const url = `/api/integrations/connect?toolkit=${toolkit}&return=${encodeURIComponent(ret)}`;
  const w = window.open(`${url}&popup=1`, "jb-connect", "width=520,height=720");
  // Popup blocked: full navigation to the API route (it redirects to Composio), not a client route.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  if (!w) window.location.href = url;
}

/** Calls back when a popup connect flow finishes. */
export function useConnected(onConnected: (toolkit: ToolkitId, ok: boolean) => void) {
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== "jb-connected" || !e.data.toolkit) return;
      onConnected(e.data.toolkit as ToolkitId, Boolean(e.data.connected));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [onConnected]);
}
