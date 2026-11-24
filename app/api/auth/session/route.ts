import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions, userForToken } from "@/lib/auth";

/** Exchanges a token from the Google sign-in redirect for our HTTP-only session cookie. */
export async function POST(request: Request) {
  const { token } = await request.json().catch(() => ({ token: null }));
  if (typeof token !== "string" || !token) return NextResponse.json({ message: "Missing token." }, { status: 400 });
  const user = await userForToken(token);
  if (!user) return NextResponse.json({ message: "That sign-in link has expired. Try again." }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}
