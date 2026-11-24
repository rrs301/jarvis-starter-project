"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Orb } from "@/components/ui/Orb";

/** Google sign-in returns here with #token=… in the fragment (cloudhike Auth). */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get("token");
    const err = params.get("error");
    history.replaceState(null, "", window.location.pathname);
    if (err || !token) {
      queueMicrotask(() => setError(err ? "Google sign-in was not completed." : "No sign-in token was returned."));
      return;
    }
    fetch("/api/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "Sign-in failed.");
        router.replace("/board");
      })
      .catch((e: Error) => setError(e.message));
  }, [router]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 p-6 text-center">
      <Orb size={88} glow pulse={!error} />
      {error ? (
        <>
          <p className="text-lg font-semibold">{error}</p>
          <Link href="/" className="rounded-full bg-ink px-5 py-3 font-semibold text-ink-text">
            Back to sign in
          </Link>
        </>
      ) : (
        <p className="text-lg font-semibold text-muted">Signing you in…</p>
      )}
    </main>
  );
}
