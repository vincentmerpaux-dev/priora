import type { Repository, Session } from "@/lib/repo/types";
import { canWriteLead, DENIED_MESSAGE } from "@/lib/team/permissions";
import type { LeadDetail, Role } from "@/lib/types";

type Actor = Pick<Session, "userId" | "orgId"> & { role: Role };

export type Loaded = { ok: true; detail: LeadDetail } | { ok: false; error: string };

/**
 * Charge un lead pour une action d'écriture et vérifie les droits côté serveur.
 * Un lead introuvable ou d'une autre organisation répond comme un lead introuvable (pas de fuite d'existence).
 */
export async function loadLeadForWrite(repo: Repository, session: Actor, leadId: string): Promise<Loaded> {
  if (!session.orgId) return { ok: false, error: "Lead introuvable." };
  const detail = await repo.getLeadDetail(session.orgId, leadId);
  if (!detail) return { ok: false, error: "Lead introuvable." };
  if (!canWriteLead(session.role, session.userId, detail.lead)) {
    return { ok: false, error: detail.lead.ownerId ? "Ce lead est attribué à un autre commercial." : DENIED_MESSAGE };
  }
  return { ok: true, detail };
}
