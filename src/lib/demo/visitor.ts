import "server-only";
import { cookies, headers } from "next/headers";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { DEMO_SID_COOKIE, isValidSid } from "@/lib/demo/sandbox-id";
import { isPublicDemo } from "@/lib/supabase/env";

/**
 * Identifiant du bac à sable du visiteur (démo publique). Le cookie est posé par le proxy à la première visite ;
 * s'il manque malgré tout, un identifiant jetable est utilisé : le visiteur ne voit rien d'anormal, ses modifications
 * ne sont simplement pas conservées. La valeur vient du client : elle est validée (UUID) avant usage.
 */
export async function getDemoSid(): Promise<string | undefined> {
  if (!isPublicDemo()) return undefined;
  const value = (await cookies()).get(DEMO_SID_COOKIE)?.value;
  return isValidSid(value) ? value : crypto.randomUUID();
}

const ACTIONS_PER_MINUTE_SESSION = 45;
const ACTIONS_PER_MINUTE_IP = 150;

export class DemoRateLimitError extends Error {
  constructor() {
    super("Trop d'actions en peu de temps. Patientez quelques secondes puis réessayez.");
    this.name = "DemoRateLimitError";
  }
}

/**
 * Démo publique : limitation de débit de toutes les actions serveur (par bac à sable et par IP).
 * Les actions se reconnaissent à l'en-tête \`next-action\` ; l'affichage des pages n'est pas compté ici.
 * Un humain n'approche jamais ces seuils : ils ne visent que les scripts.
 */
export async function enforceDemoActionLimit(): Promise<void> {
  if (!isPublicDemo()) return;
  const h = await headers();
  if (!h.get("next-action")) return;
  const sid = (await cookies()).get(DEMO_SID_COOKIE)?.value ?? "none";
  const ok = rateLimit(`demo-act-sid:${sid}`, ACTIONS_PER_MINUTE_SESSION, 60_000) && rateLimit(`demo-act-ip:${clientIp(h)}`, ACTIONS_PER_MINUTE_IP, 60_000);
  if (!ok) throw new DemoRateLimitError();
}
