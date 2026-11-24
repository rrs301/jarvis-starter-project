"use client";

import { Plug } from "lucide-react";
import { TOOLKIT_BY_ID, type ToolkitId } from "@/lib/integrations/catalog";
import { openConnect } from "./connect";
import { ToolkitBadge } from "./ToolkitBadge";

/** Inline suggestion: "Connect Gmail" with a one-line reason. */
export function ConnectCard({ toolkit, reason, resume, compact = false }: { toolkit: ToolkitId; reason?: string; resume?: string; compact?: boolean }) {
  const t = TOOLKIT_BY_ID[toolkit];
  return (
    <div className={`flex items-center gap-3 rounded-[20px] border border-line bg-card ${compact ? "p-2.5" : "p-3.5"}`}>
      <ToolkitBadge id={toolkit} size={compact ? 32 : 40} />
      <div className="min-w-0 flex-1">
        <p className="m-0 font-semibold">Connect {t.name}</p>
        <p className="m-0 truncate text-[13px] text-muted">{reason || t.why}</p>
      </div>
      <button
        type="button"
        onClick={() => openConnect(toolkit, { resume })}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-ink px-3.5 text-[13px] font-semibold text-ink-text"
      >
        <Plug size={14} /> Connect
      </button>
    </div>
  );
}
