"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  );
}

export function SignInCard({ authUrl, configured }: { authUrl: string | null; configured: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"email" | "password">("email");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function google() {
    if (!authUrl) return setError("Sign-in isn't set up yet.");
    const to = `${window.location.origin}/auth/callback`;
    // External cloudhike Auth URL, not an internal page.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `${authUrl}/social/google?to=${encodeURIComponent(to)}`;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (step === "email") {
      if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Enter a valid email address.");
      setStep("password");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, email, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? "Sign-in failed.");
      router.replace("/board");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full max-w-[400px] flex-col gap-3 rounded-[28px] border border-line bg-card p-[18px] text-left shadow-card">
      <button
        type="button"
        onClick={google}
        disabled={!configured}
        className="flex h-[50px] items-center justify-center gap-2.5 rounded-full bg-ink text-[15px] font-semibold text-ink-text disabled:opacity-50"
      >
        <GoogleIcon />
        Continue with Google
      </button>

      <form onSubmit={submit} className="flex flex-col gap-2">
        <label className="field flex h-[50px] items-center gap-2 rounded-full border border-line bg-card2 pl-[18px] pr-1.5">
          <span className="sr-only">Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (step === "password") setStep("email");
            }}
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-faint"
          />
          {step === "email" && (
            <button
              type="submit"
              aria-label="Continue with email"
              disabled={!configured}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-coral text-white disabled:opacity-50"
            >
              <ArrowRight size={18} strokeWidth={2} />
            </button>
          )}
        </label>

        {step === "password" && (
          <>
            <label className="field flex h-[50px] items-center gap-2 rounded-full border border-line bg-card2 pl-[18px] pr-1.5">
              <span className="sr-only">Password</span>
              <input
                type="password"
                autoFocus
                required
                minLength={mode === "signup" ? 8 : undefined}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder={mode === "signup" ? "Create a password (8+ characters)" : "Password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-faint"
              />
              <button
                type="submit"
                aria-label={mode === "signup" ? "Create account" : "Sign in"}
                disabled={busy}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-coral text-white disabled:opacity-60"
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} strokeWidth={2} />}
              </button>
            </label>
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
              }}
              className="self-center text-[13px] font-medium text-muted underline-offset-4 hover:underline"
            >
              {mode === "signin" ? "New here? Create an account" : "Have an account? Sign in"}
            </button>
          </>
        )}
      </form>

      {error ? (
        <p role="alert" className="m-0 text-center text-[13px] text-coral-text">
          {error}
        </p>
      ) : (
        <p className="m-0 text-center text-xs text-faint">
          {configured ? "Sign in with Google, or with your email and a password." : "Sign-in isn't connected yet (cloudhike Auth pending)."}
        </p>
      )}
    </div>
  );
}
