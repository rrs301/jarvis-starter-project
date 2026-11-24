"use client";

import { Blocks, Bot, CalendarDays, LayoutGrid, MessageCircle, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Orb } from "@/components/ui/Orb";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const item = "flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full transition-colors";

export function Rail() {
  const path = usePathname();
  const params = useSearchParams();
  const b = params.get("b");
  const suffix = b ? `?b=${b}` : "";
  const active = (on: boolean) => (on ? `${item} bg-coral text-white` : `${item} text-rail-icon hover:bg-rail-soft hover:text-white`);
  const soon = (label: string, Icon: typeof Bot) => (
    <button type="button" aria-label={`${label} (coming soon)`} title={`${label} — coming soon`} aria-disabled className={`${item} text-rail-icon opacity-70 hover:bg-rail-soft`}>
      <Icon size={20} strokeWidth={1.7} />
    </button>
  );

  return (
    <nav
      aria-label="Main"
      className="flex shrink-0 items-center gap-2.5 overflow-x-auto rounded-[26px] bg-rail p-2.5 md:h-full md:w-[76px] md:flex-col md:overflow-y-auto md:overflow-x-hidden md:px-3.5 md:py-[18px] [scrollbar-width:none]"
    >
      <Link href={`/board${suffix}`} aria-label="Jarvis Board" className="mr-2 md:mb-[18px] md:mr-0">
        <Orb size={46} />
      </Link>
      <Link href={`/board${suffix}`} aria-label="Home" aria-current={path === "/board" ? "page" : undefined} className={active(path === "/board")}>
        <LayoutGrid size={20} strokeWidth={1.7} />
      </Link>
      <Link href={`/board/new${suffix}`} aria-label="Chat with Jarvis" aria-current={path.startsWith("/board/new") ? "page" : undefined} className={active(path.startsWith("/board/new"))}>
        <MessageCircle size={20} strokeWidth={1.7} />
      </Link>
      {soon("Calendar", CalendarDays)}
      {soon("Agents", Bot)}
      <Link
        href={`/board/integrations${suffix}`}
        aria-label="Integrations"
        aria-current={path.startsWith("/board/integrations") ? "page" : undefined}
        className={active(path.startsWith("/board/integrations"))}
      >
        <Blocks size={20} strokeWidth={1.7} />
      </Link>
      <Link
        href={`/board/settings${suffix}`}
        aria-label="Settings"
        aria-current={path.startsWith("/board/settings") ? "page" : undefined}
        className={active(path.startsWith("/board/settings"))}
      >
        <Settings size={20} strokeWidth={1.7} />
      </Link>
      <div className="ml-auto md:ml-0 md:mt-auto md:pt-[22px]">
        <div className="hidden md:block">
          <ThemeToggle />
        </div>
        <div className="md:hidden">
          <ThemeToggle vertical={false} />
        </div>
      </div>
    </nav>
  );
}
