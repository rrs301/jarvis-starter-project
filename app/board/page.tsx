import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getBoards, getWidgets } from "@/lib/data";
import { BoardView } from "@/components/board/BoardView";

export const metadata: Metadata = { title: "Board" };

export default async function BoardPage({ searchParams }: { searchParams: Promise<{ b?: string }> }) {
  const user = await requireUser();
  const { b } = await searchParams;
  const boards = await getBoards(user.id);
  const board = boards.find((x) => x.id === b) ?? boards[0];
  if (!board) redirect("/");
  const widgets = await getWidgets(user.id, board.id);
  const firstName = (user.name || user.email.split("@")[0]).split(/\s+/)[0];

  return <BoardView key={board.id} boards={boards} board={board} widgets={widgets} user={user} firstName={firstName} />;
}
