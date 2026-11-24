"use client";

import { BookOpen, CalendarDays, GitBranch, HardDrive, Hash, Layers, Mail, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { TOOLKIT_BY_ID, type ToolkitId } from "@/lib/integrations/catalog";

/** Bundled fallback marks (brand-colored glyphs) when no logo URL is available. */
const FALLBACK: Record<ToolkitId, LucideIcon> = {
  gmail: Mail,
  googlecalendar: CalendarDays,
  notion: BookOpen,
  slack: Hash,
  github: GitBranch,
  googledrive: HardDrive,
  linear: Layers,
};

let logosPromise: Promise<Partial<Record<ToolkitId, string>>> | null = null;
function loadLogos() {
  logosPromise ??= fetch("/api/integrations/logos")
    .then((r) => (r.ok ? r.json() : { logos: {} }))
    .then((j) => j.logos ?? {})
    .catch(() => ({}));
  return logosPromise;
}

/**
 * App logo in a white rounded tile (white in dark mode too so brand colors
 * read). Logo from Composio's toolkit metadata; falls back to a bundled
 * brand-colored glyph, then a colored initial.
 */
export function ToolkitBadge({ id, size = 40 }: { id: ToolkitId; size?: 20 | 28 | 32 | 40 | number }) {
  const t = TOOLKIT_BY_ID[id];
  const [logo, setLogo] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    let live = true;
    loadLogos().then((l) => live && setLogo(l[id] ?? null));
    return () => {
      live = false;
    };
  }, [id]);
  const Icon = FALLBACK[id];
  const radius = Math.round(size * 0.28);
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden border border-black/5 bg-white"
      style={{ width: size, height: size, borderRadius: radius }}
      title={t?.name}
    >
      {logo && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt={`${t.name} logo`} width={size * 0.66} height={size * 0.66} referrerPolicy="no-referrer" onError={() => setBroken(true)} style={{ width: size * 0.66, height: size * 0.66, objectFit: "contain" }} />
      ) : Icon ? (
        <Icon role="img" aria-label={`${t.name} logo`} size={Math.round(size * 0.55)} color={t.color} strokeWidth={2} />
      ) : (
        <span className="font-semibold text-white" style={{ background: t.color, width: "100%", height: "100%", display: "grid", placeItems: "center", fontSize: size * 0.36 }}>
          {t.short}
        </span>
      )}
    </span>
  );
}
