import { NextResponse } from "next/server";
import { toolkitLogos } from "@/lib/integrations/composio";

/** Public: toolkit logo URLs (no user data). */
export async function GET() {
  const logos = await toolkitLogos().catch(() => ({}));
  return NextResponse.json({ logos }, { headers: { "cache-control": "public, max-age=3600" } });
}
