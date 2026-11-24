"use client";

import { Inbox, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { ConnectCard } from "@/components/integrations/ConnectCard";
import { ToolkitBadge } from "@/components/integrations/ToolkitBadge";
import { WidgetCard } from "./WidgetCard";
import { str, type WidgetProps } from "./types";

type Email = { id: string; text: string; from?: string; time?: string; url?: string };

/** Stable avatar colour per sender, from a small professional palette. */
const AVATARS = ["#5a4be8", "#1c8a58", "#cf4520", "#1f6fb2", "#a86a00", "#8a3fb0", "#0e7c86"];
const avatarColor = (name = "") => AVATARS[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATARS.length];

/** Inbox Brief: unread Gmail via Composio when connected, otherwise a connect prompt. */
export function InboxWidget({ id, title, config, data, preview, actions }: WidgetProps) {
  const initial = (data?.state as { emails?: Email[] })?.emails ?? [];
  const [emails, setEmails] = useState<Email[]>(initial);
  const [needs, setNeeds] = useState<boolean>(Array.isArray(data?.needs) ? (data!.needs as string[]).includes("gmail") : !data?.refreshedAt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!id || preview) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/widgets/${id}/refresh`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message);
      setNeeds((j.needs ?? []).includes("gmail"));
      setEmails((j.state?.emails as Email[]) ?? []);
      if (j.errors?.emails) setError(j.errors.emails);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load Gmail.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (preview || !id) return;
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, preview]);

  return (
    <WidgetCard
      icon={Inbox}
      title={title}
      actions={actions}
      meta={
        <span className="inline-flex items-center gap-1.5 rounded-full bg-card2 py-0.5 pl-0.5 pr-2 text-[11px] font-medium text-muted">
          <ToolkitBadge id="gmail" size={20} />
          {needs ? "Not connected" : `${emails.length} unread`}
        </span>
      }
    >
      {needs || preview ? (
        <div className="flex flex-1 flex-col justify-center gap-2">
          <ConnectCard toolkit="gmail" reason={`Brief me on: ${str(config.focus, "Important & unread")}`} compact />
        </div>
      ) : emails.length === 0 ? (
        <p className="m-0 py-3 text-[13px] text-muted">{loading ? "Checking Gmail…" : error ?? "Inbox zero. Nothing unread."}</p>
      ) : (
        <ul className="-mx-1.5 m-0 flex list-none flex-col p-0">
          {emails.map((e) => (
            <li key={e.id} className="flex min-w-0 items-center gap-3 rounded-[14px] px-1.5 py-2 transition-colors hover:bg-card2">
              <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white" style={{ background: avatarColor(e.from) }}>
                {(e.from || "?").trim()[0]?.toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                {e.url ? (
                  <a href={e.url} target="_blank" rel="noreferrer noopener" className="block truncate font-medium hover:underline">
                    {e.text}
                  </a>
                ) : (
                  <span className="block truncate font-medium">{e.text}</span>
                )}
                <span className="mt-0.5 block truncate text-xs text-muted">{[e.from, e.time].filter(Boolean).join(" · ")}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {!needs && !preview && (
        <button type="button" onClick={refresh} disabled={loading} className="mt-auto inline-flex items-center gap-1 self-end rounded-full p-1 text-[11px] text-faint hover:text-text">
          <RotateCcw size={12} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      )}
    </WidgetCard>
  );
}
