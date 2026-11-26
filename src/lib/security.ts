import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** Clé webhook : 32 octets aléatoires. Seul le hash SHA-256 est stocké ; la clé claire n'est montrée qu'une fois. */
export function generateWebhookKey(): { key: string; hash: string; prefix: string } {
  const key = `prk_${randomBytes(32).toString("base64url")}`;
  return { key, hash: hashKey(key), prefix: key.slice(0, 10) };
}

/** Clé d'email entrant : même principe que la clé webhook (hash seul stocké), préfixe distinct pour ne pas les confondre. */
export function generateInboundKey(): { key: string; hash: string; prefix: string } {
  const key = `eml_${randomBytes(32).toString("base64url")}`;
  return { key, hash: hashKey(key), prefix: key.slice(0, 10) };
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export { clientIp, rateLimit } from "@/lib/rate-limit";
