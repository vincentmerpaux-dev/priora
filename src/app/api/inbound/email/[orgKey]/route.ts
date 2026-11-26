import { NextResponse, type NextRequest } from "next/server";
import { EMAIL_PROVIDERS, parseInbound, type EmailProvider } from "@/lib/inbound/email";
import { ingestInboundEmail } from "@/lib/inbound/ingest";
import { PUBLIC_DEMO_DISABLED_MESSAGE } from "@/lib/demo/public";
import { isPublicDemo } from "@/lib/supabase/env";
import { getPublicRepo } from "@/lib/repo";
import { clientIp, hashKey, rateLimit } from "@/lib/security";

export const maxDuration = 30;

/** Les pièces jointes arrivent dans le même corps (SendGrid, Mailgun) : on accepte large, mais pas sans limite. */
const MAX_BODY_BYTES = 10 * 1024 * 1024;

function json(body: object, status: number, extra?: HeadersInit) {
  return NextResponse.json(body, { status, headers: extra });
}

/** JSON (Postmark, générique), formulaire url-encodé ou multipart (Mailgun, SendGrid). Les fichiers sont ignorés. */
async function readPayload(request: NextRequest): Promise<{ data: Record<string, unknown> } | { error: string }> {
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  try {
    if (type.includes("application/json") || type.includes("+json")) {
      const parsed: unknown = JSON.parse(await request.text());
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return { error: "Un objet JSON est attendu." };
      return { data: parsed as Record<string, unknown> };
    }
    if (type.includes("multipart/form-data") || type.includes("application/x-www-form-urlencoded")) {
      const form = await request.formData();
      const out: Record<string, unknown> = {};
      for (const [k, v] of form.entries()) if (typeof v === "string" && !(k in out)) out[k] = v;
      return { data: out };
    }
  } catch {
    return { error: "Corps de requête illisible." };
  }
  return { error: "Type de contenu non pris en charge (JSON, formulaire url-encodé ou multipart)." };
}

/**
 * POST /api/inbound/email/<clé>
 * Authentification : la clé d'organisation figure dans l'URL (les fournisseurs d'email ne savent pas envoyer d'en-tête
 * personnalisé) ; "Authorization: Bearer" et "x-api-key" sont aussi acceptés (Cloudflare Worker). Seul le hash est stocké.
 * ?provider=postmark|mailgun|sendgrid|generic force le format ; sinon il est détecté.
 *
 * Réponses : 201 lead créé ; 200 message traité sans création (doublon, réponse automatique, newsletter, bounce, email inexploitable).
 * Les erreurs 4xx/5xx font réessayer la plupart des fournisseurs : un message légitime mais inutilisable répond donc 200.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ orgKey: string }> }) {
  if (isPublicDemo()) return json({ error: PUBLIC_DEMO_DISABLED_MESSAGE }, 403);
  const ip = clientIp(request.headers);
  if (!rateLimit(`inb-ip:${ip}`, 60, 60_000)) return json({ error: "Trop de requêtes." }, 429, { "Retry-After": "60" });

  const { orgKey } = await params;
  const auth = request.headers.get("authorization");
  const key = (auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null) ?? request.headers.get("x-api-key") ?? orgKey;
  if (!key || key.length < 20 || key.length > 200) return json({ error: "Clé invalide." }, 401);

  const pub = getPublicRepo();
  if (!pub) return json({ error: "Service non configuré." }, 503);
  const org = await pub.findOrganizationByInboundKeyHash(hashKey(key));
  if (!org) return json({ error: "Clé invalide." }, 401);
  if (!rateLimit(`inb-org:${org.id}`, 120, 60_000)) return json({ error: "Limite de requêtes atteinte pour cette organisation." }, 429, { "Retry-After": "60" });

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return json({ error: "Message trop volumineux (10 Mo maximum)." }, 413);

  const payload = await readPayload(request);
  if ("error" in payload) return json({ error: payload.error }, 400);

  const requested = request.nextUrl.searchParams.get("provider");
  const provider = EMAIL_PROVIDERS.includes(requested as EmailProvider) ? (requested as EmailProvider) : null;
  const email = parseInbound(payload.data, provider);
  if ("error" in email) return json({ status: "ignored", reason: "invalid_sender", message: email.error }, 200);

  try {
    const result = await ingestInboundEmail(pub.repoForOrg(), org.id, email);
    switch (result.status) {
      case "created": return json({ status: "created", id: result.leadId, assigned: result.ownerId !== null }, 201);
      case "duplicate": return json({ status: result.replay ? "replay" : "duplicate", id: result.leadId }, 200);
      case "skipped": return json({ status: "ignored", reason: result.reason }, 200);
      default: return json({ status: "ignored", reason: "unusable", message: result.error }, 200);
    }
  } catch (e) {
    console.error("[priora] email entrant :", e instanceof Error ? e.message : e);
    return json({ error: "Erreur interne." }, 500);
  }
}

export async function GET() {
  return json({ error: "Méthode non autorisée. Utilisez POST." }, 405, { Allow: "POST" });
}
