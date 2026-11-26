import type { LeadWithScore } from "@/lib/types";

export function timeAgo(iso: string, now: Date = new Date()): string {
  const min = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 60) return `il y a ${d} j`;
  return `il y a ${Math.round(d / 30)} mois`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "inconnue";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * Priorité d'appel = score, moins 2 points par jour d'ancienneté (plafonné à 30).
 * Les leads clos (gagné / perdu) passent derrière tous les leads ouverts.
 */
export function priority(l: Pick<LeadWithScore, "scoreTotal" | "createdAt" | "status">, now: Date = new Date()): number {
  const days = Math.max(0, (now.getTime() - new Date(l.createdAt).getTime()) / 86_400_000);
  const base = (l.scoreTotal ?? 0) - Math.min(30, days * 2);
  return l.status === "won" || l.status === "lost" ? base - 1000 : base;
}

export function fullName(l: { firstName: string; lastName: string; email: string }): string {
  return `${l.firstName} ${l.lastName}`.trim() || l.email;
}
