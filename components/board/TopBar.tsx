"use client";

import { LogOut, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Board, SessionUser } from "@/lib/types";

const noop = () => () => {};
const dateLabel = () => new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

export function TopBar({
  boards,
  activeId,
  user,
  search,
  onSearch,
  basePath = "/board",
}: {
  boards: Board[];
  activeId: string;
  user: SessionUser;
  search?: string;
  onSearch?: (v: string) => void;
  basePath?: string;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState(false);
  const date = useSyncExternalStore(noop, dateLabel, () => "");
  const initial = (user.name || user.email || "?").trim()[0]?.toUpperCase();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="flex flex-wrap items-center gap-3">
      <div role="tablist" aria-label="Boards" className="flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-card p-1">
        {boards.map((b) => (
          <Link
            key={b.id}
            role="tab"
            aria-selected={b.id === activeId}
            href={`${basePath}?b=${b.id}`}
            className={`flex h-[38px] items-center rounded-full px-[18px] font-medium transition-colors ${
              b.id === activeId ? "bg-ink text-ink-text" : "text-muted hover:text-text"
            }`}
          >
            {b.name}
          </Link>
        ))}
      </div>
      <span className="hidden flex-1 sm:block" />
      {onSearch && (
        <label className="field flex h-[46px] min-w-0 flex-[1_1_220px] items-center gap-2.5 rounded-full border border-line bg-card pl-4 pr-2 sm:max-w-[300px]">
          <Search size={17} className="shrink-0 text-faint" aria-hidden />
          <span className="sr-only">Search widgets</span>
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search widgets"
            className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint"
          />
          <kbd className="rounded-full bg-card2 px-2 py-1 font-mono text-xs text-muted">⌘K</kbd>
        </label>
      )}
      <span className="inline-flex h-[46px] items-center rounded-full border border-line bg-card px-4 font-medium" suppressHydrationWarning>
        {date}
      </span>
      <div className="relative">
        <button
          type="button"
          aria-label="Account"
          aria-expanded={menu}
          onClick={() => setMenu((m) => !m)}
          className="flex h-[46px] w-[46px] items-center justify-center overflow-hidden rounded-full border border-line bg-card2 font-semibold"
        >
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            initial
          )}
        </button>
        {menu && (
          <div className="absolute right-0 top-[54px] z-30 w-60 rounded-[20px] border border-line bg-card p-2 shadow-card">
            <p className="m-0 truncate px-3 pb-2 pt-1.5 text-[13px] text-muted">{user.email}</p>
            <form action="/api/auth/signout" method="post">
              <button type="submit" className="flex w-full items-center gap-2 rounded-full px-3 py-2.5 text-left font-medium hover:bg-card2">
                <LogOut size={16} /> Sign out
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
