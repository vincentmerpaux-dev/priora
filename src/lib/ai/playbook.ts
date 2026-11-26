import { detectProducts } from "@/lib/scoring/insurance";
import { normalize } from "@/lib/text";
import type { Lead, ObjectionItem, Playbook } from "@/lib/types";

/** Contexte minimal pour dérouler un script d'appel configurable. */
export type PlaybookLead = Pick<Lead, "firstName" | "lastName" | "message"> & Partial<Pick<Lead, "sourceDetail" | "createdAt" | "source">>;

const FEMININE = new Set(
  ["ines", "sarah", "samira", "anais", "claire", "lea", "emma", "camille", "manon", "chloe", "julie", "marie", "sophie", "nadia", "laura", "elodie", "aurelie", "stephanie", "sandrine", "nathalie", "isabelle", "fatima", "amina", "lucie", "pauline", "mathilde", "alice", "justine", "morgane", "celine", "valerie", "karine", "audrey", "melanie", "coralie", "sabrina", "yasmine", "leila", "elise", "marion", "charlotte", "oceane", "laetitia", "delphine", "agnes", "maeva"],
);
const MASCULINE = new Set(
  ["mathieu", "laurent", "bastien", "thomas", "karim", "julien", "paul", "hugo", "marc", "nicolas", "antoine", "alexandre", "maxime", "romain", "kevin", "olivier", "pierre", "jean", "yannick", "sebastien", "david", "franck", "mehdi", "youssef", "samir", "adrien", "damien", "cedric", "fabien", "gerard", "benoit", "didier", "vincent", "rachid", "stephane", "lucas", "theo", "ludovic", "jerome", "christophe", "eric", "guillaume", "arnaud", "yoann", "quentin"],
);

export type Civility = "Madame" | "Monsieur" | null;

/** Heuristique sur le prénom. Retourne null si le prénom est inconnu : le script reste alors neutre. */
export function inferCivility(firstName: string): Civility {
  const f = normalize(firstName).split(/[\s-]/)[0] ?? "";
  if (FEMININE.has(f)) return "Madame";
  if (MASCULINE.has(f)) return "Monsieur";
  return null;
}

/** "aujourd'hui", "hier", "il y a 3 jours" à partir de la date de réception. */
export function whenLabel(createdAt: string | undefined, now: Date): string {
  if (!createdAt) return "récemment";
  const hours = (now.getTime() - new Date(createdAt).getTime()) / 3_600_000;
  if (!Number.isFinite(hours) || hours < 0) return "récemment";
  if (hours < 1) return "il y a quelques minutes";
  if (hours < 24) return "aujourd'hui";
  const days = Math.round(hours / 24);
  if (days <= 1) return "hier";
  if (days < 14) return `il y a ${days} jours`;
  return "il y a quelques semaines";
}

function demandePhrase(lead: PlaybookLead, produit: string, quand: string): string {
  const t = normalize([lead.sourceDetail, lead.message].filter(Boolean).join(" "));
  if (/(abandonn|interrompu|pas termine)/.test(t)) return `commencé un devis pour ${produit} ${quand} sur notre site, sans le terminer`;
  if (/comparateur/.test(t)) return `demandé un devis pour ${produit} ${quand} via un comparateur`;
  if (lead.source === "email") return `écrit ${quand} au sujet de ${produit}`;
  if (/(rappel)/.test(normalize(lead.sourceDetail))) return `demandé à être rappelé ${quand} au sujet de ${produit}`;
  return `fait une demande de devis pour ${produit} ${quand} sur notre site`;
}

/** Remplit le script de l'organisation avec les données du lead. Les variables inconnues sont retirées. */
export function renderOpeningScript(playbook: Playbook, lead: PlaybookLead, now: Date = new Date()): string {
  const civ = inferCivility(lead.firstName);
  const full = `${lead.firstName} ${lead.lastName}`.trim();
  const interlocuteur = civ && lead.lastName ? `${civ} ${lead.lastName}` : full || "Madame, Monsieur";
  const produit = detectProducts([lead.sourceDetail, lead.message].filter(Boolean).join(" "))[0]?.label ?? "une assurance professionnelle";
  const quand = whenLabel(lead.createdAt, now);
  const amene = civ === "Madame" ? "amenée" : civ === "Monsieur" ? "amené" : "amené(e)";
  const vars: Record<string, string> = {
    interlocuteur,
    conseiller: playbook.agentName,
    produit,
    quand,
    amene,
    demande: demandePhrase(lead, produit, quand),
  };
  return playbook.openingScript.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? "").replace(/\s{2,}/g, " ").trim();
}

/** Objections de la bibliothèque rendues probables par le message, selon les déclencheurs de l'organisation. */
export function playbookObjections<T extends Pick<ObjectionItem, "category">>(
  playbook: Playbook,
  library: T[],
  lead: Pick<Lead, "message"> & Partial<Pick<Lead, "sourceDetail">>,
  max: number,
): T[] {
  const text = normalize([lead.message, lead.sourceDetail].filter(Boolean).join(" "));
  const picked: T[] = [];
  for (const trig of playbook.objectionTriggers) {
    if (!trig.keywords.some((k) => text.includes(normalize(k)))) continue;
    const hit = library.find((o) => normalize(o.category) === normalize(trig.category) && !picked.includes(o));
    if (hit) picked.push(hit);
  }
  for (const cat of playbook.defaultObjectionCategories ?? []) {
    if (picked.length >= 2) break;
    const hit = library.find((o) => normalize(o.category) === normalize(cat) && !picked.includes(o));
    if (hit) picked.push(hit);
  }
  return picked.slice(0, max);
}
