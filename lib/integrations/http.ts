import "server-only";

/** Only same-site relative paths are allowed as return targets. */
export function safeReturn(v: string | null | undefined, fallback = "/board/integrations") {
  return v && v.startsWith("/") && !v.startsWith("//") && !v.includes("\\") ? v.slice(0, 500) : fallback;
}

export function origin(request: Request) {
  return process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") ? process.env.NEXT_PUBLIC_APP_URL : new URL(request.url).origin;
}
