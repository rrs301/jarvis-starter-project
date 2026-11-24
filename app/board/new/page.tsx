import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getBoards } from "@/lib/data";
import { JarvisChat } from "@/components/chat/JarvisChat";

export const metadata: Metadata = { title: "New widget" };

export default async function NewWidgetPage({ searchParams }: { searchParams: Promise<{ b?: string; q?: string }> }) {
  const user = await requireUser();
  const { b, q } = await searchParams;
  const boards = await getBoards(user.id);
  const board = boards.find((x) => x.id === b) ?? boards[0];
  return <JarvisChat boards={boards} initialBoardId={board.id} initialPrompt={q?.slice(0, 2000) ?? ""} />;
}
