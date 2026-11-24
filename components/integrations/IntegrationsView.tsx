"use client";

import { Loader2, Plug, Unplug } from "lucide-react";
import { useCallback, useState } from "react";
import { TOOLKITS, TOOLKIT_BY_ID, type ConnectionStatus, type ToolkitId } from "@/lib/integrations/catalog";
import { openConnect, useConnected } from "./connect";
import { ToolkitBadge } from "./ToolkitBadge";

const ago = (iso: string | null) => {
  if (!iso) return null;
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

export function IntegrationsView({
  configured,
  initial,
  notice,
}: {
  configured: boolean;
  initial: ConnectionStatus[];
  notice: { error?: string; connected?: string; connect_failed?: string };
}) {
  const [conns, setConns] = useState(initial);
  const [busy, setBusy] = useState<ToolkitId | null>(null);
  const [msg, setMsg] = useState<string | null>(
    notice.connected ? `${TOOLKIT_BY_ID[notice.connected as ToolkitId]?.name ?? "App"} connected.`
    : notice.connect_failed ? "That connection wasn't completed."
    : notice.error === "connect" ? "Couldn't start the connection. Try again."
    : null,
  );

  const refresh = useCallback(async () => {
    const res = await fetch("/api/integrations/status?sync=1");
    if (res.ok) setConns((await res.json()).connections);
  }, []);

  useConnected(
    useCallback(
      (toolkit: ToolkitId, ok: boolean) => {
        setMsg(ok ? `${TOOLKIT_BY_ID[toolkit].name} connected.` : "That connection wasn't completed.");
        void refresh();
      },
      [refresh],
    ),
  );

  async function disconnect(id: ToolkitId) {
    setBusy(id);
    try {
      const res = await fetch("/api/integrations/disconnect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ toolkit: id }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setConns(json.connections);
      setMsg(`${TOOLKIT_BY_ID[id].name} disconnected.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't disconnect.");
    } finally {
      setBusy(null);
    }
  }

  const byId = new Map(conns.map((c) => [c.toolkit, c]));
  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-4">
      <p className="m-0 max-w-2xl text-muted">Connect your apps so Jarvis can read them for your widgets and chat. Jarvis always asks before it sends, creates or changes anything.</p>
      {!configured && (
        <div role="status" className="flex items-center gap-3 rounded-[20px] border border-line bg-card p-4">
          <span className="h-2 w-2 shrink-0 rounded-full bg-coral" />
          <p className="m-0 text-[13px]">
            <span className="font-semibold">Needs COMPOSIO_API_KEY.</span> <span className="text-muted">Add it to .env.local and restart the server to enable connections.</span>
          </p>
        </div>
      )}
      {msg && (
        <p role="status" className="m-0 self-start rounded-full bg-card px-4 py-2 text-[13px]">
          {msg}
        </p>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
        {TOOLKITS.map((t) => {
          const c = byId.get(t.id);
          const on = c?.status === "connected";
          const synced = ago(c?.lastSyncedAt ?? null);
          return (
            <section key={t.id} aria-label={t.name} className="flex flex-col gap-4 rounded-[26px] border border-line bg-card p-[18px] shadow-card">
              <div className="flex items-center gap-3">
                <ToolkitBadge id={t.id} />
                <div className="min-w-0 flex-1">
                  <h2 className="m-0 text-base font-semibold">{t.name}</h2>
                  <p className="m-0 text-[13px] text-muted">{t.why}</p>
                </div>
              </div>
              <div className="mt-auto flex items-center gap-2">
                <span className="inline-flex flex-1 items-center gap-1.5 text-xs text-muted">
                  <span className={`h-2 w-2 rounded-full ${on ? "bg-green" : c?.status === "pending" ? "bg-amber" : "bg-line-strong"}`} />
                  {on ? `Connected${synced ? ` · synced ${synced}` : ""}` : c?.status === "pending" ? "Waiting for sign-in" : "Not connected"}
                </span>
                {on ? (
                  <button type="button" disabled={busy === t.id} onClick={() => disconnect(t.id)} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3.5 text-[13px] font-medium disabled:opacity-60">
                    {busy === t.id ? <Loader2 size={14} className="animate-spin" /> : <Unplug size={14} />} Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!configured}
                    onClick={() => openConnect(t.id)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-3.5 text-[13px] font-semibold text-ink-text disabled:opacity-40"
                  >
                    <Plug size={14} /> Connect
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
