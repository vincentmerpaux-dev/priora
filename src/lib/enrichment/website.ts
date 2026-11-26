import "server-only";
import { lookup } from "node:dns/promises";
import net from "node:net";
import type { WebsiteInfo } from "@/lib/types";

const TIMEOUT_MS = 4000;
const MAX_BYTES = 200_000;
const MAX_REDIRECTS = 3;

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return (
      a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

/** Protection SSRF : le domaine vient d'un email saisi par un tiers, il ne doit jamais viser le réseau interne. */
async function assertPublicHost(hostname: string): Promise<void> {
  if (net.isIP(hostname)) throw new Error("ip-literal");
  if (!hostname.includes(".") || hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname === "localhost") {
    throw new Error("host-not-public");
  }
  const addrs = await lookup(hostname, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) throw new Error("private-address");
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ").trim();
}

export function parseHtmlMeta(html: string): { title: string | null; description: string | null } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const metaTags = html.match(/<meta\s[^>]*>/gi) ?? [];
  let description: string | null = null;
  for (const tag of metaTags) {
    const name = tag.match(/(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (name === "description" || (name === "og:description" && !description)) {
      const content = tag.match(/content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i);
      const value = content?.[1] ?? content?.[2];
      if (value) description = decode(value);
      if (name === "description" && description) break;
    }
  }
  return { title: title ? decode(title).slice(0, 200) : null, description: description ? description.slice(0, 400) : null };
}

async function readLimited(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => undefined);
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

export type WebsiteResult = { info?: WebsiteInfo; note: string | null };

export async function readWebsite(domainOrUrl: string): Promise<WebsiteResult> {
  if (process.env.PRIORA_PUBLIC_DEMO === "true") return { note: "Démo publique : lecture de site désactivée." };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(domainOrUrl) ? domainOrUrl : `https://${domainOrUrl}`);
  } catch {
    return { note: "Adresse de site web invalide." };
  }
  if (!/^https?:$/.test(url.protocol) || url.port) return { note: "Adresse de site web non autorisée." };
  const original = url.origin;
  try {
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      await assertPublicHost(url.hostname);
      const res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "user-agent": "PrioraBot/0.1 (enrichissement de lead)", accept: "text/html" },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) break;
        url = new URL(loc, url);
        if (!/^https?:$/.test(url.protocol) || url.port) return { note: "Redirection du site web non autorisée." };
        continue;
      }
      if (!res.ok) return { note: `Site web inaccessible (HTTP ${res.status}).` };
      const type = res.headers.get("content-type") ?? "";
      if (!type.includes("html")) return { note: "Le site web ne renvoie pas de page HTML." };
      const meta = parseHtmlMeta(await readLimited(res));
      if (!meta.title && !meta.description) return { note: "Site web lu, mais sans titre ni description." };
      return { info: { url: original, ...meta }, note: null };
    }
    return { note: "Trop de redirections sur le site web." };
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return { note: "Site web : délai dépassé." };
    if (e instanceof Error && ["ip-literal", "host-not-public", "private-address"].includes(e.message)) return { note: "Site web ignoré (adresse non publique)." };
    return { note: "Site web injoignable." };
  }
}
