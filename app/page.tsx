import { redirect } from "next/navigation";
import { authConfigured, getCurrentUser, publicAuthUrl } from "@/lib/auth";
import { Orb } from "@/components/ui/Orb";
import { SignInCard } from "@/components/SignInCard";

const EXAMPLES = [
  { label: "Inbox Brief", color: "#E5502B" },
  { label: "Today", color: "#7B61E8" },
  { label: "Focus timer", color: "#2F9E6E" },
  { label: "Video ideas", color: "#D99A1E" },
  { label: "Smart Notes", color: "#2F7DD1" },
];

export default async function SignInPage() {
  if (await getCurrentUser()) redirect("/board");

  return (
    <div className="min-h-dvh p-3 sm:p-5">
      <main
        className="flex min-h-[calc(100dvh-24px)] flex-col items-center justify-center gap-[26px] rounded-[34px] border border-line px-4 py-10 text-center sm:min-h-[calc(100dvh-40px)]"
        style={{ background: "radial-gradient(circle at 50% 30%, var(--glow) 0%, rgba(0,0,0,0) 45%), var(--shell)" }}
      >
        <Orb size={150} glow />
        <h1 className="m-0 text-[34px] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[44px]">
          Meet Jarvis.
          <br />
          <span className="text-faint">Your board, built by talking.</span>
        </h1>

        <ul aria-label="Example widgets" className="flex max-w-[720px] flex-wrap justify-center gap-2.5">
          {EXAMPLES.map((e) => (
            <li key={e.label} className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-card px-4 font-medium">
              <span className="h-2 w-2 rounded-full" style={{ background: e.color }} />
              {e.label}
            </li>
          ))}
        </ul>

        <SignInCard authUrl={publicAuthUrl()} configured={authConfigured()} />
      </main>
    </div>
  );
}
