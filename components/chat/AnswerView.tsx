"use client";

import { Check, Globe, Loader2, LocateFixed, MapPin, X } from "lucide-react";
import { useState } from "react";
import { TOOLKIT_BY_ID, isToolkitId } from "@/lib/integrations/catalog";
import { ToolkitBadge } from "@/components/integrations/ToolkitBadge";
import { ConnectCard } from "@/components/integrations/ConnectCard";
import { Orb } from "@/components/ui/Orb";
import { saveLocation, type AnswerTurn, type Halt } from "./agent-client";

/** Renders plain-text answers: paragraphs and "- " bullets. */
function RichText({ text, streaming }: { text: string; streaming: boolean }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-2 text-[15px] leading-relaxed">
      {blocks.map((b, i) => {
        const lines = b.split("\n").filter((l) => l.trim());
        const bullets = lines.length > 0 && lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l));
        const last = i === blocks.length - 1;
        const caret = streaming && last ? <span aria-hidden className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-coral" /> : null;
        if (bullets)
          return (
            <ul key={i} className="m-0 flex list-none flex-col gap-1.5 p-0">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-2">
                  <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-coral" />
                  <span className="min-w-0">
                    {l.replace(/^\s*([-*•]|\d+[.)])\s+/, "").replace(/\*\*/g, "")}
                    {j === lines.length - 1 && caret}
                  </span>
                </li>
              ))}
            </ul>
          );
        return (
          <p key={i} className="m-0 whitespace-pre-wrap">
            {b.replace(/\*\*/g, "")}
            {caret}
          </p>
        );
      })}
    </div>
  );
}

function LocationCard({ reason, onDone }: { reason: string; onDone: () => void }) {
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  function share() {
    if (!navigator.geolocation) return setErr("Location isn't available in this browser. Type your city instead.");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        saveLocation({ lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 });
        onDone();
      },
      () => {
        setBusy(false);
        setErr("Location permission was denied. Type your city instead.");
      },
      { timeout: 10000, maximumAge: 600000 },
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-[20px] border border-line bg-card p-3.5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card2 text-coral">
          <MapPin size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-0 font-semibold">Where are you?</p>
          <p className="m-0 text-[13px] text-muted">{reason || "This answer depends on your location."} It&apos;s only used for this request.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={share} disabled={busy} className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full bg-ink px-3.5 text-[13px] font-semibold text-ink-text disabled:opacity-60">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <LocateFixed size={14} />} Share my location
        </button>
        <form
          className="field flex min-w-[200px] flex-1 items-center gap-1 rounded-full border border-line bg-card2 py-0.5 pl-3.5 pr-0.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!city.trim()) return;
            saveLocation({ city: city.trim() });
            onDone();
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">City</span>
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="or type a city" className="h-8 w-full bg-transparent text-[13px] outline-none placeholder:text-faint" />
          </label>
          <button type="submit" className="h-8 rounded-full bg-card px-3 text-[13px] font-semibold">
            Use
          </button>
        </form>
      </div>
      {err && <p className="m-0 text-[13px] text-coral-text">{err}</p>}
    </div>
  );
}

function ConfirmCard({ halt, onResolve }: { halt: Extract<Halt, { kind: "confirm" }>; onResolve: (patch: Partial<Extract<Halt, { kind: "confirm" }>> | null) => void }) {
  const [args, setArgs] = useState(halt.args);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const app = TOOLKIT_BY_ID[halt.toolkit]?.name ?? "app";
  const label = halt.tool.replace(/^[A-Z]+_/, "").toLowerCase().replace(/_/g, " ");
  async function confirm() {
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/execute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tool: halt.tool, args }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      onResolve({ done: `Done: ${label} in ${app}.` });
    } catch (e) {
      onResolve({ failed: e instanceof Error ? e.message : "The action failed." });
    } finally {
      setBusy(false);
    }
  }
  if (halt.done || halt.failed)
    return (
      <p className={`m-0 inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-[13px] ${halt.done ? "bg-card text-green" : "bg-card text-coral-text"}`}>
        {halt.done ? <Check size={14} /> : <X size={14} />} {halt.done ?? halt.failed}
      </p>
    );
  return (
    <div className="flex flex-col gap-3 rounded-[20px] border-2 border-coral bg-card p-3.5">
      <p className="m-0 font-semibold">
        Confirm: {label} <span className="font-normal text-muted">in {app}</span>
      </p>
      <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5 text-[13px]">
        {Object.entries(args).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k.replace(/_/g, " ")}</dt>
            <dd className="m-0 min-w-0">
              {editing && (typeof v === "string" || typeof v === "number") ? (
                <input
                  aria-label={k}
                  value={String(v)}
                  onChange={(e) => setArgs((a) => ({ ...a, [k]: typeof v === "number" ? Number(e.target.value) : e.target.value }))}
                  className="w-full rounded-[10px] border border-line bg-card2 px-2 py-1 outline-none"
                />
              ) : (
                <span className="break-words">{typeof v === "string" ? v : JSON.stringify(v)}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={confirm} disabled={busy} className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full bg-ink px-4 text-[13px] font-semibold text-ink-text disabled:opacity-60">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Confirm
        </button>
        <button type="button" onClick={() => setEditing((e) => !e)} className="h-9 whitespace-nowrap rounded-full border border-line px-4 text-[13px] font-medium">
          {editing ? "Done editing" : "Edit"}
        </button>
        <button type="button" onClick={() => onResolve(null)} className="h-9 whitespace-nowrap rounded-full px-3 text-[13px] font-medium text-muted hover:text-text">
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * One Jarvis answer: status chips while tools run, the streamed text,
 * source chips, and any card that needs the user (location, connect, confirm).
 */
export function AnswerView({
  turn,
  onResume,
  onHalt,
  footer,
}: {
  turn: AnswerTurn;
  onResume: () => void;
  onHalt: (h: AnswerTurn["halt"]) => void;
  footer?: React.ReactNode;
}) {
  const running = turn.statuses.filter((s) => s.state === "start");
  return (
    <div className="flex gap-3">
      <Orb size={34} pulse={turn.streaming} />
      <div className="flex min-w-0 flex-1 flex-col gap-3 pt-1">
        {turn.statuses.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-live="polite">
            {turn.statuses.map((s) => (
              <span
                key={s.id}
                className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full pr-2.5 text-xs font-medium ${s.toolkit ? "pl-1" : "pl-2.5"} ${s.state === "start" ? "bg-ink text-ink-text" : "bg-card2 text-muted"}`}
              >
                {s.toolkit && isToolkitId(s.toolkit) && <ToolkitBadge id={s.toolkit} size={20} />}
                {s.state === "start" ? <Loader2 size={12} className="animate-spin" /> : s.state === "error" ? <X size={12} /> : <Check size={12} />}
                {s.state === "start" ? s.label : s.label.replace("…", "")}
              </span>
            ))}
          </div>
        )}
        {turn.connect && <ConnectCard toolkit={turn.connect.toolkit} reason={turn.connect.reason} resume={turn.question} />}
        {turn.content ? (
          <RichText text={turn.content} streaming={turn.streaming} />
        ) : turn.streaming && !running.length ? (
          <p className="m-0 text-muted">Jarvis is thinking…</p>
        ) : null}
        {turn.sources.length > 0 && !turn.streaming && (
          <div className="flex flex-wrap gap-1.5" aria-label="Sources">
            {turn.sources.map((s) => (
              <a
                key={s.url}
                href={s.url}
                target="_blank"
                rel="noreferrer noopener"
                title={s.title}
                className="inline-flex h-7 max-w-[220px] items-center gap-1.5 rounded-full border border-line bg-card px-2.5 text-xs text-muted hover:text-text"
              >
                <Globe size={12} className="shrink-0" />
                <span className="truncate">{s.title}</span>
              </a>
            ))}
          </div>
        )}
        {turn.halt?.kind === "location" && <LocationCard reason={turn.halt.reason} onDone={onResume} />}
        {turn.halt?.kind === "connect" && <ConnectCard toolkit={turn.halt.toolkit} reason={turn.halt.reason} resume={turn.question} />}
        {turn.halt?.kind === "confirm" && (
          <ConfirmCard
            halt={turn.halt}
            onResolve={(patch) => onHalt(patch ? { ...(turn.halt as Extract<Halt, { kind: "confirm" }>), ...patch } : null)}
          />
        )}
        {turn.error && (
          <p role="alert" className="m-0 text-[13px] text-coral-text">
            {turn.error}
          </p>
        )}
        {!turn.streaming && footer}
      </div>
    </div>
  );
}
