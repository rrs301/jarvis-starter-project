import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { Rail } from "@/components/board/Rail";

/**
 * App shell: a full-viewport rounded shell. The icon rail never scrolls with
 * the page; only the main content area scrolls (its own container).
 */
export default async function BoardLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div className="h-dvh overflow-hidden p-2 sm:p-5">
      <div className="flex h-full min-h-0 flex-col gap-3 rounded-[28px] border border-line bg-shell p-2.5 sm:rounded-[34px] sm:p-3.5 md:flex-row md:gap-5">
        <Suspense fallback={<nav aria-label="Main" className="rounded-[26px] bg-rail md:w-[76px]" />}>
          <Rail />
        </Suspense>
        <main id="jb-scroll" className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-1 pb-2 pt-1 sm:px-2 sm:pt-2.5">
          {children}
        </main>
      </div>
    </div>
  );
}
