"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordManualChange } from "@/lib/calibration/service";
import { orgWithPermission } from "@/lib/session";
import { DENIED_MESSAGE } from "@/lib/team/permissions";
import { generateWebhookKey } from "@/lib/security";
import { IcpSchema, ObjectionSchema, OrgNameSchema, OrgSettingsSchema } from "@/lib/validation";
import type { ActionResult } from "./leads";

const DENIED = { ok: false, error: DENIED_MESSAGE } as const;

/** Cible idéale, critères, personas : réservé aux administrateurs. */
export async function saveIcpAction(raw: unknown): Promise<ActionResult> {
  const ctx = await orgWithPermission("settings.manage");
  if (!ctx) return DENIED;
  const { repo, session } = ctx;
  const parsed = IcpSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  if (!parsed.data.criteria.some((c) => c.enabled && c.weight > 0)) {
    return { ok: false, error: "Activez au moins un critère avec un poids supérieur à 0." };
  }
  try {
    const previous = await repo.getIcp(session.orgId);
    await repo.saveIcp({ ...parsed.data, orgId: session.orgId });
    // Un changement de poids ou d'activation des critères devient une version (historique, retour arrière).
    await recordManualChange(repo, session.orgId, previous.criteria, parsed.data.criteria, session.userId);
  } catch (e) {
    console.error("[priora] réglages :", e instanceof Error ? e.message : e);
    return { ok: false, error: "Enregistrement impossible." };
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function saveOrgNameAction(name: string): Promise<ActionResult> {
  const ctx = await orgWithPermission("settings.manage");
  if (!ctx) return DENIED;
  const { repo, session } = ctx;
  const parsed = OrgNameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Nom invalide." };
  await repo.updateOrganization(session.orgId, { name: parsed.data });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Génère une nouvelle clé webhook. La clé en clair n'est renvoyée qu'ici, une seule fois. */
export async function regenerateWebhookKey(): Promise<ActionResult<{ key: string; prefix: string }>> {
  const ctx = await orgWithPermission("settings.manage");
  if (!ctx) return DENIED;
  const { repo, session } = ctx;
  const { key, hash, prefix } = generateWebhookKey();
  try {
    await repo.setWebhookKey(session.orgId, hash, prefix);
  } catch (e) {
    console.error("[priora] clé webhook :", e instanceof Error ? e.message : e);
    return { ok: false, error: "Impossible de générer la clé." };
  }
  revalidatePath("/settings");
  return { ok: true, key, prefix };
}

export async function saveObjectionAction(raw: unknown): Promise<ActionResult> {
  const ctx = await orgWithPermission("objections.manage");
  if (!ctx) return DENIED;
  const { repo, session } = ctx;
  const parsed = ObjectionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  await repo.saveObjection(session.orgId, parsed.data);
  revalidatePath("/objections");
  return { ok: true };
}

export async function deleteObjectionAction(id: string): Promise<ActionResult> {
  const ctx = await orgWithPermission("objections.manage");
  if (!ctx) return DENIED;
  const { repo, session } = ctx;
  const parsed = z.string().min(1).safeParse(id);
  if (!parsed.success) return { ok: false, error: "Identifiant invalide." };
  await repo.deleteObjection(session.orgId, parsed.data);
  revalidatePath("/objections");
  return { ok: true };
}

/** Attribution automatique, visibilité des commerciaux et délais cibles de premier contact. */
export async function saveOrgSettingsAction(raw: unknown): Promise<ActionResult> {
  const ctx = await orgWithPermission("settings.manage");
  if (!ctx) return DENIED;
  const { repo, session } = ctx;
  const parsed = OrgSettingsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  // Une règle ne peut viser qu'un commercial de l'organisation.
  const members = await repo.listMembers(session.orgId);
  const sales = new Set(members.filter((m) => m.role === "commercial").map((m) => m.userId));
  if (parsed.data.assignment.rules.some((r) => !sales.has(r.assigneeId))) {
    return { ok: false, error: "Une règle vise un membre qui n'est pas commercial dans cette organisation." };
  }
  if (parsed.data.assignment.mode === "segments" && parsed.data.assignment.rules.length === 0) {
    return { ok: false, error: "Ajoutez au moins une règle, ou choisissez le tour de rôle." };
  }
  try {
    await repo.saveOrgSettings({ ...parsed.data, orgId: session.orgId });
  } catch (e) {
    console.error("[priora] réglages équipe :", e instanceof Error ? e.message : e);
    return { ok: false, error: "Enregistrement impossible." };
  }
  revalidatePath("/settings");
  revalidatePath("/leads");
  return { ok: true };
}
