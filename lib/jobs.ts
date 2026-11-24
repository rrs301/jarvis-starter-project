import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// cloudhike Background jobs. Phase 1: the refresh endpoint exists and verifies
// signatures; schedules are created once the app has a public URL (cloudhike
// refuses localhost targets).

export function jobsConfigured() {
  return Boolean(process.env.JOBS_API_URL && process.env.JOBS_API_KEY);
}

async function jobsFetch(path: string, init: RequestInit = {}) {
  if (!jobsConfigured()) throw new Error("cloudhike Jobs is not configured (JOBS_API_URL / JOBS_API_KEY).");
  const res = await fetch(`${process.env.JOBS_API_URL!.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: { "content-type": "application/json", "x-api-key": process.env.JOBS_API_KEY!, ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message ?? `Jobs request failed (${res.status})`);
  return json;
}

/**
 * Creates (or reuses) the recurring schedule that calls /api/jobs/refresh.
 * Requires NEXT_PUBLIC_APP_URL to be a public https address.
 */
export async function ensureRefreshSchedule(cron = "*/30 * * * *") {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  if (!/^https:\/\//.test(base)) return { skipped: "NEXT_PUBLIC_APP_URL must be a public https URL" };
  const existing = await jobsFetch("/schedules");
  const list: Array<{ id: string; name: string }> = existing?.schedules ?? existing?.data ?? existing ?? [];
  const found = Array.isArray(list) ? list.find((s) => s.name === "Jarvis widget refresh") : undefined;
  if (found) return found;
  return jobsFetch("/schedules", {
    method: "POST",
    body: JSON.stringify({
      name: "Jarvis widget refresh",
      cron,
      timezone: "UTC",
      url: `${base}/api/jobs/refresh`,
      method: "POST",
      body: { kind: "refresh-widgets" },
      retries: 1,
    }),
  });
}

/** Verifies the x-cloudhike-signature header (HMAC-SHA256 of "<t>.<body>"). */
export function verifyJobSignature(body: string, header: string | null) {
  const key = process.env.JOBS_API_KEY;
  if (!key) return false;
  const parts = Object.fromEntries((header ?? "").split(",").map((p) => p.split("=")));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", key).update(`${t}.${body}`).digest("hex");
  return expected.length === parts.v1?.length && timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}
