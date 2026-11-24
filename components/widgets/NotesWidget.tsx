"use client";

import { Plus, StickyNote, X } from "lucide-react";
import { useState } from "react";
import { WidgetCard } from "./WidgetCard";
import { uid, useWidgetData } from "./hooks";
import { str, type WidgetProps } from "./types";

type Note = { id: string; text: string; createdAt: string };
const TINTS = ["#FCE7A6", "#FFDCCD", "#E2DCFF", "#D6ECFC", "#D6F1E1"];

export function NotesWidget({ id, title, config, data, preview, actions }: WidgetProps) {
  const starter = Array.isArray(config.starter) ? (config.starter as unknown[]).map(String) : [];
  const initialNotes: Note[] = Array.isArray(data?.notes)
    ? (data!.notes as Note[])
    : starter.map((t, i) => ({ id: `s${i}`, text: t, createdAt: "" }));
  const [state, setState] = useWidgetData(id, { notes: initialNotes }, Boolean(preview));
  const [draft, setDraft] = useState("");
  const sticky = config.layout === "sticky";

  function add(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setState((s) => ({ notes: [{ id: uid("n"), text, createdAt: new Date().toISOString() }, ...s.notes] }));
    setDraft("");
  }
  const remove = (nid: string) => setState((s) => ({ notes: s.notes.filter((n) => n.id !== nid) }));

  return (
    <WidgetCard tone="butter" icon={StickyNote} title={title} meta={`${state.notes.length} ${state.notes.length === 1 ? "note" : "notes"}`} actions={actions}>
      <form onSubmit={add} className="field flex items-center gap-2 rounded-full border border-line bg-card2 py-1 pl-4 pr-1 shadow-[0_1px_2px_rgba(90,70,0,0.06)]">
        <label className="min-w-0 flex-1">
          <span className="sr-only">New note</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={str(config.placeholder, "Jot something down…")}
            className="h-8 w-full bg-transparent outline-none placeholder:text-faint"
          />
        </label>
        <button type="submit" aria-label="Add note" className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-ink-text transition hover:opacity-90">
          <Plus size={16} />
        </button>
      </form>

      {state.notes.length === 0 ? (
        <p className="m-0 py-4 text-center text-[13px] text-muted">No notes yet. Add your first one above.</p>
      ) : sticky ? (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2 p-0">
          {state.notes.map((n, i) => (
            <li key={n.id} className="group relative min-h-[84px] rounded-[14px] p-3 pr-6 text-[13px] font-medium leading-snug text-[#1A1A1F] shadow-[0_1px_2px_rgba(60,40,0,0.08)]" style={{ background: TINTS[i % TINTS.length] }}>
              {n.text}
              <button onClick={() => remove(n.id)} aria-label="Delete note" className="absolute right-1.5 top-1.5 rounded-full p-1 opacity-0 transition group-hover:opacity-70 focus:opacity-100">
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 overflow-auto p-0">
          {state.notes.map((n) => (
            <li key={n.id} className="group flex items-start gap-2.5 rounded-[14px] bg-card2 py-2.5 pl-3 pr-2 shadow-[0_1px_2px_rgba(90,70,0,0.05)]">
              <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-pop" />
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words font-medium leading-snug">{n.text}</span>
              <button onClick={() => remove(n.id)} aria-label="Delete note" className="rounded-full p-1 text-faint opacity-0 transition hover:text-text group-hover:opacity-100 focus:opacity-100">
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
