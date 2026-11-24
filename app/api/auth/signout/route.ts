import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, signOutToken } from "@/lib/auth";

export async function POST(request: Request) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await signOutToken(token);
  const res = NextResponse.redirect(new URL("/", request.url), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
