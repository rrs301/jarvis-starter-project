import "server-only";

// cloudhike Cloud Computer — placeholder for later phases (agents that browse
// and act for the user). Not used by any UI in phase 1. Deploy the "computer"
// service in cloudhike to get COMPUTERS_API_URL / COMPUTERS_API_KEY.

export function computersConfigured() {
  return Boolean(process.env.COMPUTERS_API_URL && process.env.COMPUTERS_API_KEY);
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  if (!computersConfigured()) throw new Error("cloudhike Cloud Computer is not configured.");
  const res = await fetch(`${process.env.COMPUTERS_API_URL!.replace(/\/$/, "")}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${process.env.COMPUTERS_API_KEY}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `Computer request failed (${res.status})`);
  return json as T;
}

export type Computer = { id: string; state: string };
export type ComputerAction =
  | { type: "screenshot" }
  | { type: "click"; x: number; y: number; button?: "left" | "right" | "middle"; double?: boolean }
  | { type: "type"; text: string }
  | { type: "key"; key: string; modifiers?: string[] }
  | { type: "scroll"; x: number; y: number; direction: "up" | "down"; amount?: number }
  | { type: "exec"; command: string; timeout?: number };

/** Starts (or creates) the computer that belongs to this user. */
export const computerForUser = (userId: string) => api<Computer>("/computers", { userId, size: "basic" });
export const computerPreview = (id: string, viewOnly = true) => api<{ url: string }>(`/computers/${id}/preview`, { viewOnly });
export const computerAct = (id: string, action: ComputerAction) => api<Record<string, unknown>>(`/computers/${id}/actions`, action);
export const stopComputer = (id: string) => api<Computer>(`/computers/${id}/stop`, {});
