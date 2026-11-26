import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { syncOverdueNotifications } from "@/lib/notifications/service";
import { isPublicDemo } from "@/lib/supabase/env";
import { getPublicRepo } from "@/lib/repo";
import { hashKey } from "@/lib/security";

export const maxDuration = 60;
// Jamais mis en cache : chaque appel recalcule les retards.
export const dynamic = "force-dynamic";

function json(body: object, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Comparaison en temps constant (les deux valeurs sont hachées : même longueur, pas de fuite par la taille). */
function sameSecret(given: string, expected: string): boolean {
  return timingSafeEqual(Buffer.from(hashKey(given), "hex"), Buffer.from(hashKey(expected), "hex"));
}

/**
 * Tâche planifiée : détecte les leads "Appeler maintenant" en retard et crée les notifications
 * (cloche + email Resend si RESEND_API_KEY). Sans CRON_SECRET, la route reste fermée.
 *
 * Appelable par Vercel Cron (GET, l'en-tête Authorization: Bearer <CRON_SECRET> est ajouté automatiquement)
 * ou par GitHub Actions / un cron externe (GET ou POST avec le même en-tête). Voir le README.
 */
async function handle(request: NextRequest) {
  if (isPublicDemo()) return json({ error: "Désactivé dans la démo publique." }, 403);
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return json({ error: "CRON_SECRET absente ou trop courte (16 caractères minimum) : tâche désactivée." }, 503);
  const auth = request.headers.get("authorization");
  const given = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!given || !sameSecret(given, secret)) return json({ error: "Non autorisé." }, 401);

  const pub = getPublicRepo();
  if (!pub) return json({ error: "Service non configuré (clé service role absente)." }, 503);
  const repo = pub.repoForOrg();
  const orgs = await pub.listOrganizations();
  const summary = { organizations: orgs.length, overdueLeads: 0, ownerNotifications: 0, digestNotifications: 0, errors: 0 };
  for (const org of orgs) {
    try {
      const r = await syncOverdueNotifications(repo, org.id);
      summary.overdueLeads += r.overdue;
      summary.ownerNotifications += r.owners;
      summary.digestNotifications += r.digests;
    } catch (e) {
      summary.errors++;
      console.error("[priora] cron speed-check :", e instanceof Error ? e.message : e);
    }
  }
  return json({ ok: true, ...summary }, 200);
}

export const GET = handle;
export const POST = handle;
