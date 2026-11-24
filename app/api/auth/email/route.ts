import { NextResponse } from "next/server";
import { AuthError, SESSION_COOKIE, sessionCookieOptions, signInWithEmail, signUpWithEmail } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const mode = body.mode === "signup" ? "signup" : "signin";
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim() || email.split("@")[0];
  if (!email || !password) return NextResponse.json({ message: "Email and password are required." }, { status: 400 });
  if (mode === "signup" && password.length < 8) {
    return NextResponse.json({ message: "Use at least 8 characters for your password." }, { status: 400 });
  }
  try {
    const result = mode === "signup" ? await signUpWithEmail(name, email, password) : await signInWithEmail(email, password);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, result.token, sessionCookieOptions);
    return res;
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Sign-in failed.";
    return NextResponse.json({ message }, { status: status >= 400 && status < 600 ? status : 500 });
  }
}
