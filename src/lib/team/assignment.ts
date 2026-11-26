import { normalize } from "@/lib/text";
import type { AssignmentRule, Lead, Member, OrgSettings } from "@/lib/types";

/** Attribution automatique des nouveaux leads : fonctions pures, testées. */

export interface AssignInput {
  settings: Pick<OrgSettings, "assignment">;
  members: Pick<Member, "userId" | "role" | "active" | "name">[];
  lead: Pick<Lead, "source" | "sourceDetail" | "message" | "company" | "enrichment">;
  score: number | null;
  /** Dernier commercial servi par le tour de rôle (curseur persisté). */
  cursor: string | null;
}

export interface AssignResult {
  ownerId: string | null;
  /** Texte lisible, enregistré dans l'historique d'attribution. */
  reason: string;
  /** Nouveau curseur du tour de rôle (inchangé si la règle de segment a décidé). */
  cursor: string | null;
}

/** Commerciaux éligibles : rôle commercial et compte actif. Les inactifs sont toujours exclus. */
export function eligibleSales<M extends Pick<Member, "role" | "active">>(members: M[]): M[] {
  return members.filter((m) => m.role === "commercial" && m.active);
}

/** Tour de rôle : le commercial actif qui suit le curseur dans l'ordre de la liste. */
export function nextRoundRobin<M extends Pick<Member, "userId" | "role" | "active">>(members: M[], cursor: string | null): M | null {
  const sales = eligibleSales(members);
  if (sales.length === 0) return null;
  const at = cursor ? sales.findIndex((m) => m.userId === cursor) : -1;
  // Curseur absent ou devenu inactif : on repart du début. Sinon, le suivant.
  return sales[(at + 1) % sales.length] ?? null;
}

function haystack(lead: AssignInput["lead"]): string {
  return normalize([lead.message, lead.sourceDetail, lead.company, lead.enrichment?.company?.sectorLabel].filter(Boolean).join(" "));
}

/** Une règle correspond si tous ses critères renseignés correspondent. Une règle sans critère ne correspond jamais. */
export function ruleMatches(rule: AssignmentRule, lead: AssignInput["lead"], score: number | null): boolean {
  const hasCriterion = rule.sources.length > 0 || rule.keywords.length > 0 || rule.minScore !== null;
  if (!hasCriterion) return false;
  if (rule.sources.length > 0 && !rule.sources.includes(lead.source)) return false;
  if (rule.keywords.length > 0) {
    const text = haystack(lead);
    if (!rule.keywords.some((k) => k.trim() && text.includes(normalize(k)))) return false;
  }
  if (rule.minScore !== null && (score ?? -1) < rule.minScore) return false;
  return true;
}

export function pickAssignee(input: AssignInput): AssignResult {
  const { settings, members, lead, score, cursor } = input;
  const mode = settings.assignment.mode;
  if (mode === "off") return { ownerId: null, reason: "Attribution automatique désactivée", cursor };

  if (mode === "segments") {
    const sales = new Map(eligibleSales(members).map((m) => [m.userId, m]));
    for (const rule of settings.assignment.rules) {
      const target = sales.get(rule.assigneeId);
      // Cible inactive ou absente : la règle est ignorée, on passe à la suivante.
      if (!target) continue;
      if (ruleMatches(rule, lead, score)) {
        return { ownerId: target.userId, reason: `Règle « ${rule.label} »`, cursor };
      }
    }
  }

  const next = nextRoundRobin(members, cursor);
  if (!next) return { ownerId: null, reason: "Aucun commercial actif disponible", cursor };
  return {
    ownerId: next.userId,
    reason: mode === "segments" ? "Aucune règle ne correspond, tour de rôle" : "Tour de rôle",
    cursor: next.userId,
  };
}

export function assignmentNote(assigneeName: string | null, reason: string, actorName?: string | null): string {
  if (!assigneeName) return actorName ? `Retiré de l'attribution par ${actorName}` : "Lead non attribué";
  return actorName ? `Attribué à ${assigneeName} par ${actorName} (${reason})` : `Attribué à ${assigneeName} (${reason})`;
}
