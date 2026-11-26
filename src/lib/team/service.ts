import type { Repository } from "@/lib/repo/types";
import { notifyAssigned } from "@/lib/notifications/service";
import { assignmentNote, eligibleSales, pickAssignee } from "@/lib/team/assignment";
import type { Lead, Role } from "@/lib/types";

/**
 * Attribution : orchestration au-dessus du repository (aucune dépendance serveur, testable avec le repository démo).
 * Les droits (qui a le droit de réattribuer) sont vérifiés par l'appelant : voir src/app/actions/assignment.ts.
 */

export interface Creator { userId: string; role: Role }

/** Attribue un nouveau lead selon le réglage de l'organisation. Retourne l'identifiant du commercial retenu (ou null). */
export async function assignNewLead(repo: Repository, lead: Pick<Lead, "id" | "orgId" | "source" | "sourceDetail" | "message" | "company" | "enrichment" | "firstName" | "lastName" | "email">, score: number | null, creator?: Creator): Promise<string | null> {
  const [settings, members, cursor] = await Promise.all([
    repo.getOrgSettings(lead.orgId), repo.listMembers(lead.orgId), repo.getRoundRobinCursor(lead.orgId),
  ]);
  const res = pickAssignee({ settings, members, lead, score, cursor });

  let ownerId = res.ownerId;
  let reason = res.reason;
  // Attribution automatique désactivée : un commercial qui saisit un lead à la main en reste responsable.
  if (!ownerId && settings.assignment.mode === "off" && creator?.role === "commercial") {
    const me = members.find((m) => m.userId === creator.userId && m.active);
    if (me) { ownerId = me.userId; reason = "Saisi par le commercial"; }
  }
  if (!ownerId) return null;

  const owner = members.find((m) => m.userId === ownerId);
  await repo.assignLead(lead.orgId, lead.id, ownerId, assignmentNote(owner?.name ?? null, reason), null);
  if (res.cursor !== cursor) await repo.setRoundRobinCursor(lead.orgId, res.cursor);
  await notifyAssigned(repo, lead, ownerId, creator?.userId ?? null);
  return ownerId;
}

export type ReassignResult = { ok: true; changed: number } | { ok: false; error: string };

/** Réattribution manuelle (un ou plusieurs leads). Cible : commercial actif de l'organisation, ou null pour retirer l'attribution. */
export async function reassignLeads(
  repo: Repository, orgId: string, leadIds: string[], ownerId: string | null, actor: { userId: string; name: string },
): Promise<ReassignResult> {
  const members = await repo.listMembers(orgId);
  const target = ownerId ? eligibleSales(members).find((m) => m.userId === ownerId) : null;
  if (ownerId && !target) return { ok: false, error: "Ce membre ne peut pas recevoir de leads (commercial actif requis)." };

  let changed = 0;
  for (const id of new Set(leadIds)) {
    const detail = await repo.getLeadDetail(orgId, id);
    if (!detail || detail.lead.ownerId === ownerId) continue;
    const from = members.find((m) => m.userId === detail.lead.ownerId);
    const note = target
      ? `Réattribué à ${target.name} par ${actor.name}${from ? ` (avant : ${from.name})` : ""}`
      : `Attribution retirée par ${actor.name}${from ? ` (avant : ${from.name})` : ""}`;
    await repo.assignLead(orgId, id, ownerId, note, actor.userId);
    await notifyAssigned(repo, detail.lead, ownerId, actor.userId);
    changed++;
  }
  return { ok: true, changed };
}
