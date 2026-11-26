import type { Lead, OrgSettings, Verdict } from "@/lib/types";

/**
 * Speed-to-lead : délai entre l'arrivée du lead et le premier contact.
 * Premier contact = première activité appel ou email, ou passage à un statut autre que Nouveau
 * (la valeur est portée par lead.firstContactedAt, tenue à jour par le repository).
 * Les délais sont calculés en temps réel (pas de prise en compte des heures ouvrées).
 */

export type SpeedState =
  | "none" //       pas de délai cible (verdict Disqualifier ou non analysé) ou lead clos sans contact
  | "pending" //    pas encore contacté, dans le délai
  | "overdue" //    pas encore contacté, délai dépassé
  | "met" //        contacté dans le délai
  | "late"; //      contacté, mais après le délai

export interface SpeedStatus {
  state: SpeedState;
  targetMinutes: number | null;
  /** Minutes jusqu'à l'échéance (pending) ou de retard (overdue), arrondies à l'entier supérieur. */
  minutes: number | null;
  /** Délai effectif de premier contact en minutes (met et late). */
  contactMinutes: number | null;
  deadline: string | null;
}

type SpeedLead = Pick<Lead, "createdAt" | "firstContactedAt" | "status"> & { verdict: Verdict | null };

export function targetMinutes(verdict: Verdict | null, settings: Pick<OrgSettings, "speedTargets">): number | null {
  if (verdict === "call_now") return settings.speedTargets.callNowMinutes;
  if (verdict === "nurture") return settings.speedTargets.nurtureMinutes;
  return null;
}

export function speedStatus(lead: SpeedLead, settings: Pick<OrgSettings, "speedTargets">, now: Date = new Date()): SpeedStatus {
  const target = targetMinutes(lead.verdict, settings);
  const created = new Date(lead.createdAt).getTime();
  const contacted = lead.firstContactedAt ? new Date(lead.firstContactedAt).getTime() : null;
  const none: SpeedStatus = { state: "none", targetMinutes: target, minutes: null, contactMinutes: null, deadline: null };

  if (contacted !== null) {
    const contactMinutes = Math.max(0, Math.round((contacted - created) / 60_000));
    if (target === null) return { ...none, contactMinutes };
    const deadline = new Date(created + target * 60_000).toISOString();
    return { state: contactMinutes <= target ? "met" : "late", targetMinutes: target, minutes: null, contactMinutes, deadline };
  }
  if (target === null || lead.status === "won" || lead.status === "lost") return none;

  const deadlineMs = created + target * 60_000;
  const deadline = new Date(deadlineMs).toISOString();
  const diff = deadlineMs - now.getTime();
  if (diff >= 0) return { state: "pending", targetMinutes: target, minutes: Math.ceil(diff / 60_000), contactMinutes: null, deadline };
  return { state: "overdue", targetMinutes: target, minutes: Math.ceil(-diff / 60_000), contactMinutes: null, deadline };
}

/** Explication complète (infobulle) : délai réel et cible. */
export function speedHint(s: SpeedStatus): string | undefined {
  const target = s.targetMinutes === null ? "" : ` Cible : ${formatMinutes(s.targetMinutes)}.`;
  switch (s.state) {
    case "pending": return `Pas encore contacté, dans le délai.${target}`;
    case "overdue": return `Pas encore contacté, délai dépassé.${target}`;
    case "met": return `Premier contact après ${formatMinutes(s.contactMinutes ?? 0)}, dans le délai.${target}`;
    case "late": return `Premier contact après ${formatMinutes(s.contactMinutes ?? 0)}, hors délai.${target}`;
    default: return undefined;
  }
}

export const isOverdue = (s: SpeedStatus): boolean => s.state === "overdue";

/** "3 min", "1 h 20", "2 j 4 h". */
export function formatMinutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h < 24) return rest === 0 ? `${h} h` : `${h} h ${String(rest).padStart(2, "0")}`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return hh === 0 ? `${d} j` : `${d} j ${hh} h`;
}

/** Texte court pour badge et fiche. */
export function speedLabel(s: SpeedStatus): string | null {
  switch (s.state) {
    case "pending": return `Reste ${formatMinutes(s.minutes ?? 0)}`;
    case "overdue": return `En retard de ${formatMinutes(s.minutes ?? 0)}`;
    case "met": return `Dans le délai (${formatMinutes(s.contactMinutes ?? 0)})`;
    case "late": return `Hors délai (${formatMinutes(s.contactMinutes ?? 0)})`;
    default: return null;
  }
}
