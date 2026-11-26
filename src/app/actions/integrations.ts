"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fakeHubSpotKey, setFakeIncident, type FakeIncident } from "@/lib/integrations/hubspot/fake";
import { connectHubSpot, disconnectHubSpot, importRecentContacts, pushLead } from "@/lib/integrations/hubspot/sync";
import { orgWithPermission, requireOrg } from "@/lib/session";
import { loadLeadForWrite } from "@/lib/team/access";
import { DENIED_MESSAGE } from "@/lib/team/permissions";
import { UuidSchema } from "@/lib/validation";
import type { ActionResult } from "./leads";

const DENIED = { ok: false, error: DENIED_MESSAGE } as const;

function refresh(leadId?: string) {
  revalidatePath("/settings");
  if (leadId) revalidatePath(`/leads/${leadId}`);
}

/**
 * Connexion HubSpot (administrateurs). Le jeton n'est lu qu'ici, vérifié auprès de HubSpot puis chiffré côté serveur ;
 * la réponse ne le contient jamais. En démo, la connexion est simulée et aucun jeton n'est demandé.
 */
export async function connectHubSpotAction(token: string | null): Promise<ActionResult<{ message: string }>> {
  const ctx = await orgWithPermission("integrations.manage");
  if (!ctx) return DENIED;
  const parsed = z.string().max(400).nullable().safeParse(token);
  if (!parsed.success) return { ok: false, error: "Jeton invalide." };
  const r = await connectHubSpot(ctx.repo, ctx.session.orgId, parsed.data);
  if (!r.ok) return r;
  refresh();
  return { ok: true, message: r.message };
}

export async function disconnectHubSpotAction(): Promise<ActionResult> {
  const ctx = await orgWithPermission("integrations.manage");
  if (!ctx) return DENIED;
  try {
    await disconnectHubSpot(ctx.repo, ctx.session.orgId);
  } catch (e) {
    console.error("[priora] déconnexion HubSpot :", e instanceof Error ? e.message : e);
    return { ok: false, error: "Impossible de déconnecter HubSpot." };
  }
  refresh();
  return { ok: true };
}

export async function setHubSpotAutoPushAction(enabled: boolean): Promise<ActionResult> {
  const ctx = await orgWithPermission("integrations.manage");
  if (!ctx) return DENIED;
  if (typeof enabled !== "boolean") return { ok: false, error: "Demande invalide." };
  const info = await ctx.repo.getIntegration(ctx.session.orgId, "hubspot");
  if (!info) return { ok: false, error: "HubSpot n'est pas connecté." };
  await ctx.repo.saveIntegration(ctx.session.orgId, { ...info, autoPush: enabled });
  refresh();
  return { ok: true };
}

/** Importe les contacts HubSpot récents comme leads (source "crm"), sans doublon. Administrateurs. */
export async function importHubSpotAction(): Promise<ActionResult<{ message: string }>> {
  const ctx = await orgWithPermission("integrations.manage");
  if (!ctx) return DENIED;
  const r = await importRecentContacts({ repo: ctx.repo, orgId: ctx.session.orgId, actorId: ctx.session.userId });
  revalidatePath("/leads");
  refresh();
  return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.error };
}

/**
 * Bouton "Envoyer vers HubSpot" de la fiche lead. Droits : ceux de l'écriture sur le lead (manager, administrateur,
 * ou commercial responsable du lead), pas la gestion de l'intégration.
 */
export async function pushLeadToHubSpotAction(leadId: string): Promise<ActionResult<{ message: string }>> {
  const { repo, session } = await requireOrg();
  const id = UuidSchema.safeParse(leadId);
  if (!id.success) return { ok: false, error: "Lead introuvable." };
  const loaded = await loadLeadForWrite(repo, session, id.data);
  if (!loaded.ok) return loaded;
  const r = await pushLead({ repo, orgId: session.orgId, actorId: session.userId }, id.data, "manual");
  refresh(id.data);
  return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.error };
}

/** Démonstration uniquement : déclenche un incident du faux HubSpot (429, 401, 500) pour montrer les erreurs et le journal. */
export async function setDemoIncidentAction(incident: string): Promise<ActionResult> {
  const ctx = await orgWithPermission("integrations.manage");
  if (!ctx) return DENIED;
  if (ctx.repo.mode !== "demo") return { ok: false, error: "Réservé au mode démonstration." };
  const parsed = z.enum(["none", "429", "401", "500"]).safeParse(incident);
  if (!parsed.success) return { ok: false, error: "Incident inconnu." };
  setFakeIncident(fakeHubSpotKey(ctx.session.orgId, ctx.repo.scope), parsed.data as FakeIncident);
  return { ok: true };
}
