import "server-only";
import { extractLead, cleanBody, skipReason, type ExtractedLead, type InboundEmail, type SkipReason } from "@/lib/inbound/email";
import { notifyLeadMessage } from "@/lib/notifications/service";
import { ingestLead } from "@/lib/pipeline";
import type { Repository } from "@/lib/repo/types";
import type { Lead } from "@/lib/types";
import { LeadInputSchema } from "@/lib/validation";

/** Même expéditeur dans cette fenêtre : on ajoute une activité au lead existant au lieu d'en créer un. */
export const DEDUPE_WINDOW_MS = 24 * 3_600_000;

export type InboundPreview =
  | { kind: "skipped"; reason: SkipReason }
  | { kind: "invalid"; error: string }
  | { kind: "new"; lead: ExtractedLead }
  | { kind: "existing"; lead: ExtractedLead; existing: Pick<Lead, "id" | "firstName" | "lastName" | "company" | "createdAt"> };

export type InboundResult =
  | { status: "created"; leadId: string; ownerId: string | null }
  | { status: "duplicate"; leadId: string; replay: boolean }
  | { status: "skipped"; reason: SkipReason }
  | { status: "invalid"; error: string };

function toInput(x: ExtractedLead) {
  return LeadInputSchema.safeParse({
    firstName: x.firstName, lastName: x.lastName, email: x.email, phone: x.phone, company: x.company, jobTitle: x.jobTitle,
    website: null, location: null, message: x.message, sourceDetail: x.sourceDetail,
  });
}

/** Ce que l'email donnerait, sans rien écrire (aperçu du simulateur "Coller un email"). */
export async function previewInboundEmail(repo: Repository, orgId: string, email: InboundEmail, now: Date = new Date()): Promise<InboundPreview> {
  const reason = skipReason(email);
  if (reason) return { kind: "skipped", reason };
  const lead = extractLead(email);
  const parsed = toInput(lead);
  if (!parsed.success) return { kind: "invalid", error: parsed.error.issues[0]?.message ?? "Email inexploitable." };
  const existing = await repo.findLeadByEmail(orgId, parsed.data.email, new Date(now.getTime() - DEDUPE_WINDOW_MS).toISOString());
  if (existing) return { kind: "existing", lead, existing: { id: existing.id, firstName: existing.firstName, lastName: existing.lastName, company: existing.company, createdAt: existing.createdAt } };
  return { kind: "new", lead };
}

/**
 * Email entrant -> lead, puis pipeline normal (enrichissement, score, attribution, analyse), source "email".
 * Ignore les messages automatiques ; un expéditeur déjà vu dans les 24 h reçoit une activité "Email reçu" sur son lead.
 */
export async function ingestInboundEmail(
  repo: Repository, orgId: string, email: InboundEmail, opts: { enrich?: boolean; now?: Date } = {},
): Promise<InboundResult> {
  const now = opts.now ?? new Date();
  const reason = skipReason(email);
  if (reason) return { status: "skipped", reason };

  const extracted = extractLead(email);
  const parsed = toInput(extracted);
  if (!parsed.success) return { status: "invalid", error: parsed.error.issues[0]?.message ?? "Email inexploitable." };

  const existing = await repo.findLeadByEmail(orgId, parsed.data.email, new Date(now.getTime() - DEDUPE_WINDOW_MS).toISOString());
  if (existing) {
    const { body } = cleanBody(email.text);
    const content = [email.subject ? `Objet : ${email.subject}` : null, body || "(message vide)"].filter(Boolean).join("\n\n").slice(0, 4000);
    // Un fournisseur qui réessaie la livraison ne doit pas dupliquer l'activité.
    const detail = await repo.getLeadDetail(orgId, existing.id);
    if (detail?.activities.some((a) => a.type === "inbound" && a.content === content)) return { status: "duplicate", leadId: existing.id, replay: true };
    await repo.addActivity(orgId, existing.id, "inbound", content, null);
    await notifyLeadMessage(repo, existing, email.subject);
    return { status: "duplicate", leadId: existing.id, replay: false };
  }

  const lead = await ingestLead(repo, orgId, parsed.data, { source: "email", enrich: opts.enrich !== false, ai: "auto" });
  return { status: "created", leadId: lead.id, ownerId: lead.ownerId };
}
