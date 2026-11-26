import type { Criterion, IcpConfig, ObjectionItem } from "@/lib/types";

/**
 * Critères préparés (inspirés BANT / MEDDIC) :
 * - Adéquation (fit) : la cible idéale, proche du "Need / Authority" de BANT.
 * - Intention : budget, besoin exprimé, qualité de la source.
 * - Timing : urgence exprimée et fraîcheur du lead.
 * Les poids sont relatifs : le score final est toujours normalisé sur 100.
 */
export const DEFAULT_CRITERIA: Criterion[] = [
  { key: "sector", label: "Secteur cible", category: "fit", weight: 12, enabled: true, description: "Le secteur de l'entreprise correspond-il à votre cible ?" },
  { key: "size", label: "Taille d'entreprise", category: "fit", weight: 10, enabled: true, description: "L'effectif est-il dans votre fourchette idéale ?" },
  { key: "zone", label: "Zone géographique", category: "fit", weight: 8, enabled: true, description: "L'entreprise est-elle dans une zone que vous couvrez ?" },
  { key: "decision_role", label: "Rôle décideur", category: "fit", weight: 10, enabled: true, description: "Le contact est-il décideur ou prescripteur (Authority / Champion) ?" },
  { key: "message_intent", label: "Intention du message", category: "intent", weight: 12, enabled: true, description: "Le message exprime-t-il un besoin concret (Need / Identify pain) ?" },
  { key: "budget_signal", label: "Signal de budget", category: "intent", weight: 8, enabled: true, description: "Un budget ou un montant est-il évoqué (Budget / Economic buyer) ?" },
  { key: "source_quality", label: "Qualité de la source", category: "intent", weight: 8, enabled: true, description: "Une demande directe vaut plus qu'un contact importé." },
  { key: "contactability", label: "Joignabilité", category: "intent", weight: 7, enabled: true, description: "Email professionnel, téléphone et entreprise identifiée." },
  { key: "urgency", label: "Urgence exprimée", category: "timing", weight: 15, enabled: true, description: "Le prospect a-t-il une échéance (Timeline) ?" },
  { key: "freshness", label: "Fraîcheur du lead", category: "timing", weight: 10, enabled: true, description: "Un lead contacté vite convertit mieux." },
];

export const DEFAULT_OBJECTIONS: Omit<ObjectionItem, "id" | "orgId">[] = [
  {
    category: "Prix",
    objection: "C'est trop cher pour nous.",
    response: "Comparer le coût de l'offre au coût du problème actuel (temps perdu, erreurs, opportunités manquées). Proposer de chiffrer le gain sur un cas concret avant de parler du tarif.",
  },
  {
    category: "Timing",
    objection: "Ce n'est pas le bon moment, on verra plus tard.",
    response: "Demander ce qui doit changer pour que ce soit le bon moment, puis proposer une étape légère (démo courte, étude) qui prépare la suite sans engagement.",
  },
  {
    category: "Concurrence",
    objection: "Nous travaillons déjà avec un autre fournisseur.",
    response: "Ne pas critiquer l'existant. Demander ce qui fonctionne et ce qui manque, puis positionner l'offre comme complément ou alternative sur ce manque précis.",
  },
  {
    category: "Décision",
    objection: "Je dois en parler à ma direction.",
    response: "Proposer de préparer un court argumentaire pour la direction et d'inviter la personne décisionnaire à un second échange.",
  },
  {
    category: "Confiance",
    objection: "Nous ne vous connaissons pas.",
    response: "Partager un cas client comparable et proposer un pilote limité pour réduire le risque perçu.",
  },
];

export function defaultIcp(orgId: string): IcpConfig {
  return {
    orgId,
    offer: "",
    idealCustomer: "",
    sectors: [],
    sizeMin: null,
    sizeMax: null,
    zones: [],
    decisionRoles: ["Directeur", "Responsable", "Gérant", "Dirigeant", "Fondateur"],
    criteria: DEFAULT_CRITERIA.map((c) => ({ ...c })),
    personas: [],
  };
}
