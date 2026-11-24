import { NextResponse } from "next/server";
import { verifyJobSignature } from "@/lib/jobs";
import { refreshAllSources } from "@/lib/widget-sources";

/** Called by the cloudhike Jobs schedule: refreshes every widget with live data sources. */
export async function POST(request: Request) {
  const body = await request.text();
  if (!verifyJobSignature(body, request.headers.get("x-cloudhike-signature"))) {
    return new Response("bad signature", { status: 401 });
  }
  const result = await refreshAllSources();
  return NextResponse.json({ ok: true, runId: request.headers.get("x-cloudhike-run-id"), ...result });
}
