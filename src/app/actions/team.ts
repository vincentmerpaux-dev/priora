"use server";

import { revalidatePath } from "next/cache";
import { orgWithPermission } from "@/lib/session";
import { inviteByEmail } from "@/lib/team/invite";
import { DENIED_MESSAGE } from "@/lib/team/permissions";
import { InviteSchema, RoleSchema, UuidSchema } from "@/lib/validation";
import type { ActionResult } from "./leads";

/** Toutes les actions d'équipe sont réservées aux administrateurs (permission "team.manage"), vérifiée côté serveur. */

export async function inviteMemberAction(raw: unknown): Promise<ActionResult<{ simulated: boolean }>> {
  const ctx = await orgWithPermission("team.manage");
  if (!ctx) return { ok: false, error: DENIED_MESSAGE };
  const parsed = InviteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  const { repo, session } = ctx;
  const { email, role } = parsed.data;
  const name = parsed.data.name || email.split("@")[0]!;

  const members = await repo.listMembers(session.orgId);
  if (members.some((m) => m.email.toLowerCase() === email)) return { ok: false, error: "Ce membre fait déjà partie de l'équipe." };

  const invite = await inviteByEmail(email);
  if (!invite.ok) return invite;
  try {
    await repo.addMember(session.orgId, { userId: invite.userId, email, name, role, status: "invited" });
  } catch (e) {
    console.error("[priora] ajout du membre :", e instanceof Error ? e.message : e);
    return { ok: false, error: "Le compte a été invité mais le membre n'a pas pu être ajouté. Réessayez." };
  }
  revalidatePath("/team");
  return { ok: true, simulated: invite.simulated };
}

export async function changeMemberRoleAction(userId: string, role: string): Promise<ActionResult> {
  const ctx = await orgWithPermission("team.manage");
  if (!ctx) return { ok: false, error: DENIED_MESSAGE };
  const id = UuidSchema.safeParse(userId);
  const r = RoleSchema.safeParse(role);
  if (!id.success || !r.success) return { ok: false, error: "Demande invalide." };
  const { repo, session } = ctx;
  if (id.data === session.userId) return { ok: false, error: "Vous ne pouvez pas modifier votre propre rôle." };

  const members = await repo.listMembers(session.orgId);
  const target = members.find((m) => m.userId === id.data);
  if (!target) return { ok: false, error: "Membre introuvable." };
  if (target.role === "admin" && r.data !== "admin" && members.filter((m) => m.role === "admin" && m.active).length <= 1) {
    return { ok: false, error: "L'organisation doit garder au moins un administrateur actif." };
  }
  await repo.updateMemberRole(session.orgId, id.data, r.data);
  revalidatePath("/team");
  return { ok: true };
}

export async function setMemberActiveAction(userId: string, active: boolean): Promise<ActionResult<{ openLeads: number }>> {
  const ctx = await orgWithPermission("team.manage");
  if (!ctx) return { ok: false, error: DENIED_MESSAGE };
  const id = UuidSchema.safeParse(userId);
  if (!id.success || typeof active !== "boolean") return { ok: false, error: "Demande invalide." };
  const { repo, session } = ctx;
  if (id.data === session.userId && !active) return { ok: false, error: "Vous ne pouvez pas désactiver votre propre compte." };

  const members = await repo.listMembers(session.orgId);
  const target = members.find((m) => m.userId === id.data);
  if (!target) return { ok: false, error: "Membre introuvable." };
  if (!active && target.role === "admin" && members.filter((m) => m.role === "admin" && m.active).length <= 1) {
    return { ok: false, error: "L'organisation doit garder au moins un administrateur actif." };
  }
  await repo.setMemberActive(session.orgId, id.data, active);
  // Leads ouverts encore attribués à un membre désactivé : à réattribuer (la file les signale).
  const leads = active ? [] : await repo.listLeads(session.orgId);
  const openLeads = leads.filter((l) => l.ownerId === id.data && l.status !== "won" && l.status !== "lost").length;
  revalidatePath("/team");
  revalidatePath("/leads");
  return { ok: true, openLeads };
}
