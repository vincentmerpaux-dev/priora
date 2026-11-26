"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseRawEmail, SKIP_LABEL, type ExtractedLead } from "@/lib/inbound/email";
import { ingestInboundEmail, previewInboundEmail } from "@/lib/inbound/ingest";
import { scoreLead, verdictLabel } from "@/lib/scoring/engine";
import { generateInboundKey } from "@/lib/security";
import { orgWithPermission } from "@/lib/session";
import { DENIED_MESSAGE } from "@/lib/team/permissions";
import { verdictOf } from "@/lib/calibration/compute";
import type { ActionResult } from "./leads";

const DENIED = { ok: false, error: DENIED_MESSAGE } as const;
const RawSchema = z.string().trim().min(1, "Collez un email (en-têtes et corps).").max(60_000, "Email trop long (60 000 caractères maximum).");

export type EmailPreview =
  | { kind: "skipped"; label: string }
  | { kind: "invalid"; error: string }
  | { kind: "new" | "existing"; lead: ExtractedLead; estimate: { score: number; verdict: string }; existing?: { id: string; name: string; company: string } };

/** Nouvelle clé d'email entrant. Affichée une seule fois, seul le hash est conservé. Administrateurs. */
export async function regenerateInboundKey(): Promise<ActionResult<{ key: string; prefix: string }>> {
  const ctx = await orgWithPermission("settings.manage");
  if (!ctx) return DENIED;
  const { key, hash, prefix } = generateInboundKey();
  try {
    await ctx.repo.setInboundKey(ctx.session.orgId, hash, prefix);
  } catch (e) {
    console.error("[priora] clé email entrant :", e instanceof Error ? e.message : e);
    return { ok: false, error: "Impossible de générer la clé." };
  }
  revalidatePath("/settings");
  return { ok: true, key, prefix };
}

/** Simulateur "Coller un email" : montre le lead extrait SANS rien créer. Administrateurs. */
export async function previewEmailAction(raw: string): Promise<ActionResult<{ preview: EmailPreview }>> {
  const ctx = await orgWithPermission("settings.manage");
  if (!ctx) return DENIED;
  const text = RawSchema.safeParse(raw);
  if (!text.success) return { ok: false, error: text.error.issues[0]?.message ?? "Email invalide." };
  const email = parseRawEmail(text.data);
  if ("error" in email) return { ok: false, error: email.error };

  const p = await previewInboundEmail(ctx.repo, ctx.session.orgId, email);
  if (p.kind === "skipped") return { ok: true, preview: { kind: "skipped", label: SKIP_LABEL[p.reason] } };
  if (p.kind === "invalid") return { ok: true, preview: { kind: "invalid", error: p.error } };

  // Score estimé avec le moteur réel, sans enrichissement réseau : l'enrichissement (registre, site) l'ajustera à la création.
  const icp = await ctx.repo.getIcp(ctx.session.orgId);
  const x = p.lead;
  const result = scoreLead({
    email: x.email, phone: x.phone, company: x.company, jobTitle: x.jobTitle, website: null, location: null, message: x.message,
    source: "email", sourceDetail: x.sourceDetail, enrichment: null, createdAt: new Date().toISOString(),
  }, icp);
  const estimate = { score: result.total, verdict: verdictLabel(verdictOf(result.total)) };
  if (p.kind === "existing") {
    const name = `${p.existing.firstName} ${p.existing.lastName}`.trim() || x.email;
    return { ok: true, preview: { kind: "existing", lead: x, estimate, existing: { id: p.existing.id, name, company: p.existing.company } } };
  }
  return { ok: true, preview: { kind: "new", lead: x, estimate } };
}

/** Simulateur : traite l'email comme un vrai email entrant (lead créé ou activité ajoutée). Administrateurs. */
export async function createLeadFromEmailAction(raw: string): Promise<ActionResult<{ outcome: "created" | "duplicate" | "skipped" | "invalid"; leadId?: string; message: string }>> {
  const ctx = await orgWithPermission("settings.manage");
  if (!ctx) return DENIED;
  const text = RawSchema.safeParse(raw);
  if (!text.success) return { ok: false, error: text.error.issues[0]?.message ?? "Email invalide." };
  const email = parseRawEmail(text.data);
  if ("error" in email) return { ok: false, error: email.error };
  try {
    const r = await ingestInboundEmail(ctx.repo, ctx.session.orgId, email);
    revalidatePath("/leads");
    revalidatePath("/settings");
    switch (r.status) {
      case "created": return { ok: true, outcome: "created", leadId: r.leadId, message: "Lead créé, scoré et attribué." };
      case "duplicate": return { ok: true, outcome: "duplicate", leadId: r.leadId, message: r.replay ? "Message déjà enregistré : rien de nouveau." : "Même expéditeur dans les 24 h : message ajouté au lead existant." };
      case "skipped": return { ok: true, outcome: "skipped", message: `Ignoré : ${SKIP_LABEL[r.reason]}.` };
      default: return { ok: true, outcome: "invalid", message: r.error };
    }
  } catch (e) {
    console.error("[priora] simulateur email :", e instanceof Error ? e.message : e);
    return { ok: false, error: "Impossible de traiter l'email. Réessayez." };
  }
}
