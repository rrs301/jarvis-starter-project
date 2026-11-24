import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import OpenAI from "openai";

/** A tool the model can call; executed on our server. */
export type ClientTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** Short status shown while it runs, e.g. "Searching the web…". */
  status: string;
  /** App the tool belongs to (for a logo on the status chip). */
  toolkit?: string;
};

export type Source = { title: string; url: string };

/* ---------- Calculator (no eval) ---------- */

export function calculate(expr: string): number {
  const src = expr.replace(/,/g, "").replace(/×/g, "*").replace(/÷/g, "/").replace(/\s+/g, "");
  if (!/^[0-9.+\-*/%^()]+$/.test(src) || src.length > 200) throw new Error("Only numbers and + - * / % ^ ( ) are allowed.");
  let i = 0;
  const peek = () => src[i];
  const num = (): number => {
    if (peek() === "(") {
      i++;
      const v = add();
      if (src[i++] !== ")") throw new Error("Missing )");
      return v;
    }
    if (peek() === "-") {
      i++;
      return -num();
    }
    const m = /^[0-9]*\.?[0-9]+/.exec(src.slice(i));
    if (!m) throw new Error("Bad number");
    i += m[0].length;
    let v = Number(m[0]);
    if (peek() === "%") {
      i++;
      v = v / 100;
    }
    return v;
  };
  const pow = (): number => {
    const b = num();
    if (peek() === "^") {
      i++;
      return b ** pow();
    }
    return b;
  };
  const mul = (): number => {
    let v = pow();
    while (peek() === "*" || peek() === "/") {
      const op = src[i++];
      const r = pow();
      v = op === "*" ? v * r : v / r;
    }
    return v;
  };
  function add(): number {
    let v = mul();
    while (peek() === "+" || peek() === "-") {
      const op = src[i++];
      const r = mul();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  const out = add();
  if (i !== src.length || !Number.isFinite(out)) throw new Error("Couldn't evaluate that.");
  return Math.round(out * 1e10) / 1e10;
}

/* ---------- Web fetch (SSRF-guarded) ---------- */

function privateIp(ip: string) {
  if (ip.includes(":")) return ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80") || ip.startsWith("::ffff:127.") || ip === "::";
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

export async function fetchPage(raw: string): Promise<{ title: string; text: string; url: string }> {
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only http(s) URLs.");
  const host = url.hostname;
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address);
  if (!ips.length || ips.some(privateIp)) throw new Error("That address isn't allowed.");
  const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(8000), headers: { "user-agent": "JarvisBoard/1.0 (+web fetch)" } });
  if (!res.ok) throw new Error(`The page answered ${res.status}.`);
  const body = (await res.text()).slice(0, 400_000);
  const title = /<title[^>]*>([^<]{0,200})/i.exec(body)?.[1]?.trim() ?? url.hostname;
  const text = body
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6000);
  return { title, text, url: url.toString() };
}

/* ---------- Web search via cloudhike (Perplexity Sonar) ---------- */

const g = globalThis as unknown as { jbSearchAi?: OpenAI };

export function searchConfigured() {
  return Boolean(process.env.AI_BASE_URL && process.env.AI_API_KEY);
}

/** Used by providers without a native web search tool (Gemini, cloudhike). */
export async function webSearch(q: string, signal?: AbortSignal): Promise<{ answer: string; sources: Source[] }> {
  if (!searchConfigured()) throw new Error("Web search needs cloudhike AI (AI_BASE_URL / AI_API_KEY).");
  g.jbSearchAi ??= new OpenAI({ baseURL: process.env.AI_BASE_URL, apiKey: process.env.AI_API_KEY });
  const res = await g.jbSearchAi.chat.completions.create(
    {
      model: process.env.AI_SEARCH_MODEL || "perplexity/sonar",
      messages: [
        { role: "system", content: "Answer with concise, current facts from the web. Include names, numbers and places. Keep it under 250 words." },
        { role: "user", content: q.slice(0, 500) },
      ],
      max_tokens: 900,
    },
    { signal },
  );
  const msg = res.choices[0]?.message as unknown as { content?: string; annotations?: Array<{ type?: string; url_citation?: { url: string; title?: string } }> };
  const top = res as unknown as { citations?: string[] };
  const sources: Source[] = [
    ...(msg.annotations ?? []).filter((a) => a.url_citation?.url).map((a) => ({ url: a.url_citation!.url, title: a.url_citation!.title || new URL(a.url_citation!.url).hostname })),
    ...(top.citations ?? []).map((u) => ({ url: u, title: (() => { try { return new URL(u).hostname; } catch { return u; } })() })),
  ];
  const seen = new Set<string>();
  return { answer: msg.content ?? "", sources: sources.filter((s) => !seen.has(s.url) && seen.add(s.url)).slice(0, 8) };
}

/* ---------- Tool definitions ---------- */

export const TOOL_TIME: ClientTool = {
  name: "get_current_time",
  description: "Current date and time in the user's timezone.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  status: "Checking the time…",
};
export const TOOL_CALC: ClientTool = {
  name: "calculate",
  description: "Evaluate arithmetic exactly (tips, percentages, totals, unit conversions you set up as arithmetic). Supports + - * / % ^ and parentheses; '18%' means 0.18.",
  parameters: { type: "object", properties: { expression: { type: "string", description: "e.g. 2450 * 18%" } }, required: ["expression"], additionalProperties: false },
  status: "Calculating…",
};
export const TOOL_LOCATION: ClientTool = {
  name: "get_user_location",
  description: "The user's approximate location (city and coordinates). Call it only when the answer depends on where the user is (e.g. 'near me'). If it isn't shared yet, the user is asked for permission and the request resumes afterwards.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  status: "Checking your location…",
};
export const TOOL_WEB_SEARCH: ClientTool = {
  name: "web_search",
  description: "Search the web for current information. Returns a short answer with source links.",
  parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false },
  status: "Searching the web…",
};
export const TOOL_WEB_FETCH: ClientTool = {
  name: "web_fetch",
  description: "Read the text of a public web page by URL.",
  parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false },
  status: "Reading a page…",
};
export const TOOL_CONNECT: ClientTool = {
  name: "suggest_connect",
  description: "Ask the user to connect an app (gmail, googlecalendar, notion, slack, github, googledrive, linear) when answering needs their data from it and it isn't connected. The request resumes after they connect.",
  parameters: {
    type: "object",
    properties: { toolkit: { type: "string", enum: ["gmail", "googlecalendar", "notion", "slack", "github", "googledrive", "linear"] }, reason: { type: "string" } },
    required: ["toolkit"],
    additionalProperties: false,
  },
  status: "Checking your apps…",
};
