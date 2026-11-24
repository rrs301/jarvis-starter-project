"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}
const getTheme = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem("jb-theme", t);
  } catch {
    /* storage may be blocked; theme still applies for this page */
  }
}

/** Sun/moon capsule that sits at the bottom of the rail. */
export function ThemeToggle({ vertical = true }: { vertical?: boolean }) {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "light" as Theme);
  const btn = (t: Theme, label: string, Icon: typeof Sun) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={theme === t}
      onClick={() => setTheme(t)}
      className={`flex h-[38px] w-[38px] items-center justify-center rounded-full transition-colors ${
        theme === t ? "bg-white text-[#0E0E12]" : "text-rail-icon hover:text-white"
      }`}
    >
      <Icon size={17} strokeWidth={1.8} />
    </button>
  );
  return (
    <div role="group" aria-label="Theme" className={`flex gap-1 rounded-full bg-rail-soft p-1 ${vertical ? "flex-col" : ""}`}>
      {btn("light", "Light theme", Sun)}
      {btn("dark", "Dark theme", Moon)}
    </div>
  );
}
