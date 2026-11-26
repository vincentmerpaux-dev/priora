import { NextResponse, type NextRequest } from "next/server";
import { ingestLead } from "@/lib/pipeline";
import { PUBLIC_DEMO_DISABLED_MESSAGE } from "@/lib/demo/public";
import { isPublicDemo } from "@/lib/supabase/env";
import { getPublicRepo } from "@/lib/repo";
import { clientIp, hashKey, rateLimit } from "@/lib/security";
import { LeadInputSchema, normalizeWebhookPayload } from "@/lib/validation";

export const maxDuration = 30;

const MAX_BODY = 20_000;

function json(body: object, status: number, extra?: HeadersInit) {
  return NextResponse.json(body, { status, headers: extra });
}

/**
 * POST /api/webhooks/leads
 * Authentification : en-tête "Authorization: Bearer <clé>" ou "x-api-key: <clé>".
 * Corps JSON : { email, company, first_name, last_name, phone, job_title, website, location, message, source_detail }
 */
export async function POST(request: NextRequest) {
  if (isPublicDemo()) return json({ error: PUBLIC_DEMO_DISABLED_MESSAGE }, 403);
  const ip = clientIp(request.headers);
  if (!rateLimit(`wh-ip:${ip}`, 60, 60_000)) return json({ error: "Trop de requêtes." }, 429, { "Retry-After": "60" });

  const auth = request.headers.get("authorization");
  const key = request.headers.get("x-api-key") ?? (auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null);
  if (!key || key.length < 20 || key.length > 200) return json({ error: "Clé API manquante ou invalide." }, 401);

  const pub = getPublicRepo();
  if (!pub) return json({ error: "Service non configuré." }, 503);
  const org = await pub.findOrganizationByWebhookKeyHash(hashKey(key));
  if (!org) return json({ error: "Clé API manquante ou invalide." }, 401);
  if (!rateLimit(`wh-org:${org.id}`, 300, 60_000)) return json({ error: "Limite de requêtes atteinte pour cette organisation." }, 429, { "Retry-After": "60" });

  const text = await request.text();
  if (text.length > MAX_BODY) return json({ error: "Corps de requête trop volumineux." }, 413);
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return json({ error: "JSON invalide." }, 400);
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return json({ error: "Un objet JSON est attendu." }, 400);

  const parsed = LeadInputSchema.safeParse({ sourceDetail: "Webhook", ...normalizeWebhookPayload(payload as Record<string, unknown>) });
  if (!parsed.success) {
    return json({ error: "Données invalides.", details: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) }, 422);
  }
  try {
    const lead = await ingestLead(pub.repoForOrg(), org.id, parsed.data, { source: "webhook", enrich: true, ai: "auto" });
    return json({ id: lead.id, status: "created" }, 201);
  } catch (e) {
    console.error("[priora] webhook :", e instanceof Error ? e.message : e);
    return json({ error: "Erreur interne." }, 500);
  }
}

export async function GET() {
  return json({ error: "Méthode non autorisée. Utilisez POST." }, 405, { Allow: "POST" });
}
