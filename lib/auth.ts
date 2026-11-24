import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SessionUser } from "./types";

/** HTTP-only cookie holding the cloudhike Auth bearer token. */
export const SESSION_COOKIE = "jb_session";

function authEnv() {
  const url = process.env.AUTH_URL;
  const key = process.env.AUTH_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("cloudhike Auth is not configured (AUTH_URL / AUTH_PUBLISHABLE_KEY).");
  return { url: url.replace(/\/$/, ""), key };
}

export function authConfigured() {
  return Boolean(process.env.AUTH_URL && process.env.AUTH_PUBLISHABLE_KEY);
}

/** Public base URL of the cloudhike Auth API (safe for the browser per cloudhike docs). */
export function publicAuthUrl() {
  return process.env.AUTH_URL?.replace(/\/$/, "") ?? null;
}

type AuthResult = { token: string; user: { id: string; email: string; name?: string | null; image?: string | null } };

async function authPost(path: string, body: unknown, token?: string) {
  const { url, key } = authEnv();
  const res = await fetch(`${url}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new AuthError(json?.message ?? `Auth request failed (${res.status})`, res.status);
  return json;
}

export class AuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  return authPost("/sign-in/email", { email, password });
}

export async function signUpWithEmail(name: string, email: string, password: string): Promise<AuthResult> {
  return authPost("/sign-up/email", { name, email, password });
}

export async function signOutToken(token: string) {
  await authPost("/sign-out", {}, token).catch(() => undefined);
}

/** Validates a token with cloudhike Auth and returns its user, or null. */
export async function userForToken(token: string): Promise<SessionUser | null> {
  if (!authConfigured()) return null;
  const { url, key } = authEnv();
  const res = await fetch(`${url}/get-session`, {
    headers: { "x-api-key": key, authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  const u = json?.user;
  if (!u?.id) return null;
  return { id: String(u.id), email: String(u.email ?? ""), name: u.name ?? null, image: u.image ?? null };
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return userForToken(token);
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  return user;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};
