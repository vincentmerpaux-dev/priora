"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PUBLIC_DEMO_CSV_MAX_ROWS } from "@/lib/demo/public";
import { getDemoSid } from "@/lib/demo/visitor";
import { enrichLead } from "@/lib/enrichment";
import { rateLimit } from "@/lib/rate-limit";
import { isPublicDemo } from "@/lib/supabase/env";
import { autoPushIfEnabled } from "@/lib/integrations/hubspot/sync";
import { ingestLead, processLead } from "@/lib/pipeline";
import { scoreLead } from "@/lib/scoring/engine";
import { orgWithPermission, requireOrg } from "@/lib/session";
import { loadLeadForWrite } from "@/lib/team/access";
import { canReadLead, DENIED_MESSAGE } from "@/lib/team/permissions";
import { LEAD_STATUSES, LOSS_REASONS, WIN_REASONS } from "@/lib/types";
import { LeadInputSchema } from "@/lib/validation";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function refresh(leadId?: string) {
  revalidatePath("/leads");
  revalidatePath("/pipeline");
  if (leadId) revalidatePath(`/leads/${leadId}`);
}

const IdSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Identifiant invalide");

/* ---------- Saisie manuelle ---------- */

export interface ManualState {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
}

export async function createManualLead(_prev: ManualState, formData: FormData): Promise<ManualState> {
  const { repo, session } = await requireOrg();
  const parsed = LeadInputSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { error: "Corrigez les champs signalés.", fieldErrors, values: Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string> };
  }
  let id: string;
  let readable = true;
  try {
    const lead = await ingestLead(repo, session.orgId, parsed.data, { source: "saisie", enrich: true, ai: "auto", creator: { userId: session.userId, role: session.role } });
    id = lead.id;
    // Attribué à un autre membre : le créateur (commercial) n'a plus accès à la fiche, on le ramène à la file.
    readable = canReadLead(session.role, session.userId, lead, await repo.getOrgSettings(session.orgId));
  } catch (e) {
    console.error("[priora] saisie manuelle :", e instanceof Error ? e.message : e);
    return { error: "Impossible d'enregistrer le lead. Réessayez." };
  }
  refresh();
  redirect(readable ? `/leads/${id}` : "/leads?created=1");
}

/* ---------- Import CSV (par lots, appelé depuis le client) ---------- */

export interface ImportChunkResult {
  created: number;
  errors: { row: number; message: string }[];
}

const MAX_CHUNK = 6;

export async function importLeadsChunk(rows: { row: number; data: Record<string, string> }[], enrich: boolean): Promise<ImportChunkResult> {
  // Import en masse : réservé aux managers et administrateurs (il déclenche l'attribution automatique de tous les leads).
  const ctx = await orgWithPermission("leads.view_all");
  if (!ctx) return { created: 0, errors: [{ row: 0, message: DENIED_MESSAGE }] };
  const { repo, session } = ctx;
  const result: ImportChunkResult = { created: 0, errors: [] };
  let batch = rows.slice(0, MAX_CHUNK);
  if (isPublicDemo()) {
    // Démo publique : import limité à une petite taille par visiteur, sans enrichissement externe.
    enrich = false;
    const allowed: typeof batch = [];
    for (const r of batch) {
      if (rateLimit(`demo-csv:${session.userId}:${await getDemoSid()}`, PUBLIC_DEMO_CSV_MAX_ROWS, 2 * 60 * 60_000)) allowed.push(r);
      else result.errors.push({ row: r.row, message: `Import limité à ${PUBLIC_DEMO_CSV_MAX_ROWS} lignes dans la démo publique.` });
    }
    batch = allowed;
  }

  const handle = async ({ row, data }: (typeof batch)[number]) => {
    const parsed = LeadInputSchema.safeParse({ ...data, sourceDetail: data.sourceDetail || "Import CSV" });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      result.errors.push({ row, message: `${String(issue?.path[0] ?? "ligne")} : ${issue?.message ?? "invalide"}` });
      return;
    }
    try {
      await ingestLead(repo, session.orgId, parsed.data, { source: "csv", enrich, ai: "never", creator: { userId: session.userId, role: session.role } });
      result.created++;
    } catch {
      result.errors.push({ row, message: "Enregistrement impossible" });
    }
  };
  // Groupes de 3 : respecte la limite de débit de l'API Recherche d'entreprises.
  for (let i = 0; i < batch.length; i += 3) await Promise.all(batch.slice(i, i + 3).map(handle));
  refresh();
  return result;
}

/* ---------- Pipeline ---------- */

const MoveSchema = z.object({
  leadId: IdSchema,
  status: z.enum(LEAD_STATUSES as [string, ...string[]]),
  reason: z.string().trim().max(500).optional(),
  /** Motif structuré, facultatif pour un gain ; liste fermée selon le résultat. */
  reasonCode: z.string().trim().max(60).optional(),
});

export async function moveLead(input: { leadId: string; status: string; reason?: string; reasonCode?: string }): Promise<ActionResult> {
  const { repo, session } = await requireOrg();
  const parsed = MoveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  const { leadId, status, reason } = parsed.data;
  const reasonCode = parsed.data.reasonCode || null;
  const allowed: readonly string[] = status === "won" ? WIN_REASONS : status === "lost" ? LOSS_REASONS : [];
  if (reasonCode && !allowed.includes(reasonCode)) return { ok: false, error: "Motif inconnu." };
  if (status === "lost" && !reason && !reasonCode) return { ok: false, error: "Indiquez un motif de perte." };
  try {
    const loaded = await loadLeadForWrite(repo, session, leadId);
    if (!loaded.ok) return loaded;
    const { detail } = loaded;
    await repo.updateLeadStatus(session.orgId, leadId, status as never);
    if (status === "won" || status === "lost") await repo.setOutcome(session.orgId, leadId, status, reason ?? "", reasonCode);
    else if (detail.outcome) await repo.clearOutcome(session.orgId, leadId);
  } catch (e) {
    console.error("[priora] changement de statut :", e instanceof Error ? e.message : e);
    return { ok: false, error: "Impossible de modifier le statut." };
  }
  // Envoi automatique vers HubSpot à la qualification et au gain (si connecté et activé). N'échoue jamais l'action : le résultat est dans le journal.
  if (status === "qualified" || status === "won") await autoPushIfEnabled({ repo, orgId: session.orgId, actorId: session.userId }, leadId);
  refresh(leadId);
  return { ok: true };
}

/* ---------- Fiche lead ---------- */

const ActivitySchema = z.object({ leadId: IdSchema, type: z.enum(["call", "email", "note"]), content: z.string().trim().min(1, "Écrivez une note").max(4000) });

export async function addActivityAction(input: { leadId: string; type: string; content: string }): Promise<ActionResult> {
  const { repo, session } = await requireOrg();
  const parsed = ActivitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Demande invalide." };
  const loaded = await loadLeadForWrite(repo, session, parsed.data.leadId);
  if (!loaded.ok) return loaded;
  await repo.addActivity(session.orgId, parsed.data.leadId, parsed.data.type, parsed.data.content, session.userId);
  refresh(parsed.data.leadId);
  return { ok: true };
}

/** Relance manuelle de l'analyse IA (nouvelle version). Seul déclencheur d'un appel IA après la création. */
export async function reanalyzeLead(leadId: string): Promise<ActionResult> {
  const { repo, session } = await requireOrg();
  const id = IdSchema.safeParse(leadId);
  if (!id.success) return { ok: false, error: "Lead introuvable." };
  const loaded = await loadLeadForWrite(repo, session, id.data);
  if (!loaded.ok) return loaded;
  try {
    await processLead(repo, loaded.detail.lead, "force");
  } catch (e) {
    console.error("[priora] relance analyse :", e instanceof Error ? e.message : e);
    return { ok: false, error: "Analyse impossible pour le moment." };
  }
  refresh(leadId);
  return { ok: true };
}

/** Relance l'enrichissement (registre + site) puis recalcule le score (aucun appel IA). */
export async function reenrichLead(leadId: string): Promise<ActionResult> {
  const { repo, session } = await requireOrg();
  const id = IdSchema.safeParse(leadId);
  if (!id.success) return { ok: false, error: "Lead introuvable." };
  const loaded = await loadLeadForWrite(repo, session, id.data);
  if (!loaded.ok) return loaded;
  const { lead } = loaded.detail;
  const enrichment = await enrichLead({ company: lead.company, email: lead.email, website: lead.website });
  await repo.updateLeadEnrichment(session.orgId, lead.id, enrichment);
  const icp = await repo.getIcp(session.orgId);
  await repo.saveScore(session.orgId, lead.id, scoreLead({ ...lead, enrichment }, icp));
  refresh(leadId);
  return { ok: true };
}

export async function deleteLeadAction(leadId: string): Promise<ActionResult> {
  const ctx = await orgWithPermission("leads.delete");
  if (!ctx) return { ok: false, error: DENIED_MESSAGE };
  const id = IdSchema.safeParse(leadId);
  if (!id.success) return { ok: false, error: "Lead introuvable." };
  await ctx.repo.deleteLead(ctx.session.orgId, id.data);
  refresh();
  redirect("/leads");
}
