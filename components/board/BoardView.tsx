"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { Board, SessionUser, Widget } from "@/lib/types";
import { Orb } from "@/components/ui/Orb";
import { TopBar } from "./TopBar";
import { Composer } from "./Composer";
import { BoardGrid } from "./BoardGrid";

const noop = () => () => {};
const greetingNow = () => {
  const h = new Date().getHours();
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

export function BoardView({
  boards,
  board,
  widgets,
  user,
  firstName,
}: {
  boards: Board[];
  board: Board;
  widgets: Widget[];
  user: SessionUser;
  firstName: string;
}) {
  const [search, setSearch] = useState("");
  const greeting = useSyncExternalStore(noop, greetingNow, () => "Hello");

  return (
    <>
      <TopBar boards={boards} activeId={board.id} user={user} search={search} onSearch={setSearch} />

      <div className="flex flex-wrap items-stretch gap-4">
        <div className="flex min-w-0 flex-[3_1_520px] flex-col justify-end gap-[18px]">
          <h1 className="m-0 text-[32px] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[46px]">
            {greeting}, {firstName}
            <br />
            <span className="text-faint">What should Jarvis handle today?</span>
          </h1>
          <Composer boardId={board.id} />
        </div>

        <Link
          href={`/board/new?b=${board.id}`}
          className="glow-bg flex min-h-[260px] min-w-0 flex-[2_1_340px] flex-col items-center justify-center gap-3.5 rounded-[28px] border border-line p-[22px] text-center shadow-card"
        >
          <Orb size={136} glow />
          <span className="text-[22px] font-semibold tracking-[-0.02em]">Jarvis is ready</span>
          <span className="text-muted">
            {widgets.length} widget{widgets.length === 1 ? "" : "s"} on {board.name} · tap to build another
          </span>
        </Link>
      </div>

      <BoardGrid boardId={board.id} initial={widgets} filter={search} />
    </>
  );
}
