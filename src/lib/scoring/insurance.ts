import type { Criterion } from "@/lib/types";
import { normalize } from "@/lib/text";
import type { ScoringIcp, ScoringLead } from "./engine";

/**
 * Règles de score pour l'assurance professionnelle (cas Orus). Mêmes principes que le moteur générique :
 * fonctions pures, un ratio entre 0 et 1 et une raison lisible par critère. Les détections reposent sur des
 * mots-clés dans le message et le détail de source : ce sont des HYPOTHESES, éditables via les poids.
 * Pour les critères de la catégorie "risk", un ratio de 1 signifie "aucun risque détecté".
 */

interface RuleOutput {
  ratio: number;
  reason: string;
}
type Rule = (lead: ScoringLead, icp: ScoringIcp, now: Date) => RuleOutput;

const any = (text: string, words: string[]) => words.find((w) => text.includes(w));
const test = (text: string, re: RegExp) => re.test(text);

/** Texte de travail du lead : tout ce que le prospect a dit, normalisé. */
function said(lead: ScoringLead): string {
  return normalize([lead.message, lead.sourceDetail].filter(Boolean).join(" . "));
}

/* ---------- Produits ---------- */

export interface ProductInfo {
  key: "decennale" | "multirisque" | "rc_pro" | "mutuelle" | "prevoyance" | "auto";
  /** Libellé utilisé dans la phrase "une demande de devis pour ...". */
  label: string;
  short: string;
  /** Prix d'appel public, toujours cité avec "à partir de" (orus.eu, lu le 24/11/2026). */
  priceFrom: string;
  keywords: string[];
}

export const PRODUCTS: ProductInfo[] = [
  { key: "decennale", label: "une assurance décennale", short: "Décennale", priceFrom: "69 €/mois", keywords: ["decennale", "decennal"] },
  { key: "multirisque", label: "une assurance multirisque professionnelle", short: "Multirisque", priceFrom: "25 €/mois", keywords: ["multirisque", "multi-risque", "multi risque"] },
  { key: "rc_pro", label: "une assurance RC Pro", short: "RC Pro", priceFrom: "13 €/mois", keywords: ["rc pro", "rcpro", "responsabilite civile"] },
  { key: "mutuelle", label: "une mutuelle TNS", short: "Mutuelle TNS", priceFrom: "30 €/mois", keywords: ["mutuelle"] },
  { key: "prevoyance", label: "une prévoyance TNS", short: "Prévoyance TNS", priceFrom: "25 €/mois", keywords: ["prevoyance"] },
  { key: "auto", label: "une assurance auto professionnelle", short: "Auto pro", priceFrom: "35 €/mois", keywords: ["assurance auto", "auto pro", "vehicule utilitaire", "vehicules"] },
];

export function detectProducts(text: string): ProductInfo[] {
  const t = normalize(text);
  return PRODUCTS.filter((p) => p.keywords.some((k) => t.includes(k)));
}

/* ---------- Adéquation ---------- */

const tradeRule: Rule = (lead, icp) => {
  const targets = icp.sectors.map(normalize).filter(Boolean);
  if (targets.length === 0) return { ratio: 0.5, reason: "Aucun métier couvert défini : score neutre." };
  const web = lead.enrichment?.website;
  const company = lead.enrichment?.company;
  const haystack = normalize([lead.jobTitle, lead.company, lead.message, web?.title, web?.description, company?.sectorLabel].filter(Boolean).join(" "));
  const hit = targets.find((t) => haystack.includes(t));
  if (hit) return { ratio: 1, reason: `Métier couvert par une offre : "${hit}" retrouvé dans le profil.` };
  const hasData = Boolean(company?.sectorLabel || web?.title || web?.description);
  if (!hasData) return { ratio: 0.3, reason: "Métier inconnu : à confirmer au téléphone." };
  return { ratio: 0, reason: `Activité (${company?.sectorLabel ?? "détectée"}) sans offre correspondante dans la liste des métiers couverts.` };
};

const ageRule: Rule = (lead, _icp, now) => {
  const created = lead.enrichment?.company?.creationDate;
  if (!created) return { ratio: 0.3, reason: "Date de création inconnue." };
  const months = (now.getTime() - new Date(created).getTime()) / (30.4 * 86_400_000);
  if (!Number.isFinite(months)) return { ratio: 0.3, reason: "Date de création inconnue." };
  if (months < 6) return { ratio: 1, reason: `Entreprise créée il y a ${Math.max(1, Math.round(months))} mois : besoin d'attestation immédiat, remise jeune entreprise possible en décennale.` };
  if (months < 24) return { ratio: 0.75, reason: `Entreprise de ${Math.round(months)} mois : jeune structure, contrats souvent à poser.` };
  if (months < 60) return { ratio: 0.45, reason: `Entreprise de ${Math.round(months / 12)} ans.` };
  return { ratio: 0.3, reason: `Entreprise installée depuis ${Math.round(months / 12)} ans : contrat probablement déjà en place chez un concurrent.` };
};

/* ---------- Intention ---------- */

const productRule: Rule = (lead) => {
  const found = detectProducts(said(lead));
  if (found.length === 1) return { ratio: 1, reason: `Produit demandé explicite : ${found[0]!.short}.` };
  if (found.length > 1) return { ratio: 0.8, reason: `Plusieurs produits évoqués (${found.map((p) => p.short).join(", ")}) : à prioriser en découverte.` };
  return { ratio: 0.2, reason: "Aucun produit précisé : besoin à qualifier." };
};

const quoteRule: Rule = (lead) => {
  const t = said(lead);
  if (test(t, /(abandonn|interrompu|pas termine|pas fini|pas finalise|non termine|reste en suspens)/)) {
    return { ratio: 1, reason: "Devis abandonné en cours de parcours : le prospect a déjà investi du temps, il suffit de lever le blocage." };
  }
  if (test(t, /(devis (commence|en cours|realise|simule|fait|demande)|j'ai commence|j'ai simule|simulation|demande de devis)/)) {
    return { ratio: 0.8, reason: "Devis commencé ou demandé : intention concrète." };
  }
  if (test(t, /(devis|tarif|prix|combien)/)) return { ratio: 0.5, reason: "Demande de prix, sans devis lancé." };
  return { ratio: 0.15, reason: "Pas de devis commencé." };
};

const callbackRule: Rule = (lead) => {
  const t = said(lead);
  if (test(t, /(rappel|rappeler|appelez|m'appeler|me joindre|joignable|par telephone)/)) {
    return { ratio: 1, reason: "Demande de rappel explicite : le prospect attend un appel." };
  }
  if (lead.phone) return { ratio: 0.4, reason: "Numéro de téléphone fourni, sans demande de rappel explicite." };
  return { ratio: 0.1, reason: "Aucun numéro ni demande de rappel : premier contact par email." };
};

/* ---------- Timing (poids fort) ---------- */

const attestationRule: Rule = (lead) => {
  const t = said(lead);
  const attestation = t.includes("attestation");
  const external = test(t, /(client|maitre d'ouvrage|donneur d'ordre|plateforme|chantier|mission|exige|demande|oblige|avant de)/);
  const soon = test(t, /(lundi|demain|cette semaine|semaine prochaine|ce matin|urgent|au plus vite|dans \d+ jours|sous \d+ jours|ce mois|mois prochain|demarre)/);
  if (attestation && external && soon) return { ratio: 1, reason: "Attestation exigée par un tiers avec une date proche : sans elle, le chantier ou la mission ne démarre pas." };
  if (attestation && external) return { ratio: 0.8, reason: "Attestation exigée par un client ou un donneur d'ordre, date à préciser." };
  if (attestation) return { ratio: 0.6, reason: "Besoin d'attestation évoqué." };
  if (test(t, /(chantier|mission)/) && soon) return { ratio: 0.6, reason: "Chantier ou mission qui démarre bientôt : attestation probablement à fournir." };
  return { ratio: 0.1, reason: "Aucune attestation exigée évoquée." };
};

const expiryRule: Rule = (lead) => {
  const t = said(lead);
  const mention = test(t, /(echeance|renouvel|fin de contrat|arrive a terme|se termine|prend fin|expire|resilier|resiliation|contrat actuel)/);
  const near = test(t, /(ce mois|mois prochain|fin du mois|fin d'annee|semaines?|15 jours|30 jours|dans 1 mois|dans un mois|decembre|janvier|\bdemain\b)/);
  const far = test(t, /(dans [3-9] mois|dans plus de|l'an prochain|annee prochaine|dans 1\d mois)/);
  if (mention && near) return { ratio: 1, reason: "Échéance du contrat actuel proche : fenêtre de décision ouverte." };
  if (mention && far) return { ratio: 0.3, reason: "Échéance du contrat actuel lointaine." };
  if (mention) return { ratio: 0.6, reason: "Contrat actuel évoqué, échéance à préciser." };
  if (test(t, /(pas encore d'assurance|aucune assurance|pas assure|sans assurance|pas de contrat)/)) return { ratio: 0.5, reason: "Pas de contrat actuel : aucune échéance à attendre, mais aussi aucun contrat à résilier." };
  return { ratio: 0.15, reason: "Aucune échéance de contrat mentionnée." };
};

const creationRule: Rule = (lead) => {
  const t = said(lead);
  if (test(t, /(je cree|je vais creer|en cours de creation|je me lance|immatricul|kbis|avant d'ouvrir|j'ouvre|j'ouvrirai|ouverture|je demarre mon activite|je lance mon activite)/)) {
    return { ratio: 1, reason: "Création d'entreprise en cours : l'assurance est une étape bloquante pour démarrer." };
  }
  if (test(t, /(vient de creer|viens de creer|ai cree|creation recente|depuis (\d+|deux|trois) mois|micro-entreprise|auto-entrepreneur)/)) {
    return { ratio: 0.7, reason: "Entreprise créée récemment." };
  }
  return { ratio: 0.15, reason: "Pas de création d'entreprise évoquée." };
};

/* ---------- Risques spécifiques (ratio 1 = aucun risque) ---------- */

const claimsRule: Rule = (lead) => {
  const t = said(lead);
  if (test(t, /(aucun sinistre|pas de sinistre|sans sinistre|0 sinistre|jamais eu de sinistre)/)) return { ratio: 1, reason: "Aucun sinistre déclaré." };
  if (test(t, /((2|3|4|deux|trois|quatre|plusieurs) sinistres|sinistres repetes|sinistres a repetition)/)) {
    return { ratio: 0, reason: "Sinistres répétés déclarés : risque élevé, la souscription peut refuser ou surtarifer." };
  }
  if (test(t, /(resilie par|resiliation par (mon|son) assureur|assureur m'a resilie|refuse par)/)) return { ratio: 0.1, reason: "Résiliation par l'assureur précédent : risque élevé." };
  if (t.includes("sinistre")) return { ratio: 0.5, reason: "Un sinistre passé mentionné : à qualifier (nature, montant, date)." };
  return { ratio: 0.8, reason: "Aucun sinistre mentionné : à vérifier en découverte." };
};

const OUT_OF_SCOPE = ["pyrotechni", "feux d'artifice", "armurerie", "cryptomonnaie", "casino", "paris sportifs", "amiante", "matieres dangereuses", "aeronautique"];

const targetActivityRule: Rule = (lead) => {
  const t = normalize([lead.company, lead.jobTitle, lead.message, lead.enrichment?.website?.description].filter(Boolean).join(" "));
  const out = any(t, OUT_OF_SCOPE);
  if (test(t, /(partenariat|je vous propose|vous propose mes services|apporteur d'affaires)/)) {
    return { ratio: 0, reason: "Sollicitation commerciale d'un prestataire : ce n'est pas un client potentiel." };
  }
  if (test(t, /(memoire|these|etudiante?|stage|alternance|recrutw*|candidature)/)) {
    return { ratio: 0, reason: "Demande sans projet d'achat (études, emploi) : hors cible." };
  }
  const emp = lead.enrichment?.company?.employees;
  if (out) return { ratio: 0, reason: `Activité sensible ("${out}") : probablement hors du périmètre de souscription, à confirmer avec la souscription (hypothèse).` };
  if (emp && emp.min >= 50) return { ratio: 0, reason: `Entreprise de ${emp.label} : hors du segment indépendants et TPE.` };
  if (test(t, /(groupe|filiale|siege social|multi-sites|appel d'offres)/)) return { ratio: 0.3, reason: "Profil de grande structure (groupe, filiale, appel d'offres) : probablement hors cible." };
  return { ratio: 1, reason: "Aucun signal d'activité hors cible." };
};

const comparingRule: Rule = (lead) => {
  const t = said(lead);
  if (test(t, /(3 devis|trois devis|plusieurs devis|autres devis|mise en concurrence)/)) return { ratio: 0.2, reason: "Compare plusieurs devis : décision au meilleur rapport prix/garanties, prévoir un rappel rapide et chiffré." };
  if (test(t, /(je compare|comparer|comparaison|compare )/)) return { ratio: 0.35, reason: "Comparaison en cours : le prix décidera si la valeur n'est pas démontrée." };
  if (test(t, /comparateur/)) return { ratio: 0.5, reason: "Arrivé par un comparateur : par nature, il compare." };
  return { ratio: 1, reason: "Aucune comparaison mentionnée." };
};

export const INSURANCE_RULES = {
  trade_covered: tradeRule,
  company_age: ageRule,
  product_request: productRule,
  quote_progress: quoteRule,
  callback_request: callbackRule,
  attestation_need: attestationRule,
  contract_expiry: expiryRule,
  company_creation: creationRule,
  past_claims: claimsRule,
  target_activity: targetActivityRule,
  comparing: comparingRule,
} as const satisfies Record<string, Rule>;

/**
 * Critères d'une organisation d'assurance. Somme des poids = 100.
 * Adéquation 26, Intention 26, Timing 36 (poids fort), Risques 12.
 */
export const INSURANCE_CRITERIA: Criterion[] = [
  { key: "trade_covered", label: "Métier couvert", category: "fit", weight: 12, enabled: true, description: "Le métier correspond-il à une offre (RC Pro, multirisque, décennale, mutuelle, prévoyance, auto) ?" },
  { key: "size", label: "Taille (0 à 10 salariés)", category: "fit", weight: 8, enabled: true, description: "Indépendants et TPE de 0 à 10 salariés." },
  { key: "company_age", label: "Ancienneté de l'entreprise", category: "fit", weight: 6, enabled: true, description: "Une création récente signale un besoin d'attestation (et une remise décennale possible)." },
  { key: "product_request", label: "Produit demandé", category: "intent", weight: 10, enabled: true, description: "Le prospect nomme-t-il un produit précis ?" },
  { key: "quote_progress", label: "Devis commencé ou abandonné", category: "intent", weight: 8, enabled: true, description: "Un devis lancé, même abandonné, est un signal d'achat fort." },
  { key: "callback_request", label: "Demande de rappel", category: "intent", weight: 8, enabled: true, description: "Le prospect demande-t-il à être rappelé ?" },
  { key: "attestation_need", label: "Attestation exigée", category: "timing", weight: 15, enabled: true, description: "Un client, un chantier ou une plateforme exige une attestation à date fixe." },
  { key: "contract_expiry", label: "Échéance du contrat actuel", category: "timing", weight: 9, enabled: true, description: "Une échéance proche ouvre la fenêtre de décision." },
  { key: "company_creation", label: "Création d'entreprise en cours", category: "timing", weight: 6, enabled: true, description: "Sans assurance, l'activité ne peut pas démarrer." },
  { key: "freshness", label: "Fraîcheur du lead", category: "timing", weight: 6, enabled: true, description: "Un lead rappelé vite convertit mieux." },
  { key: "past_claims", label: "Sinistralité", category: "risk", weight: 4, enabled: true, description: "Des sinistres répétés font monter le risque (ratio plein = aucun sinistre)." },
  { key: "target_activity", label: "Activité dans la cible", category: "risk", weight: 4, enabled: true, description: "Activité sensible ou grande structure : hors cible (ratio plein = aucun signal)." },
  { key: "comparing", label: "Pas de mise en concurrence", category: "risk", weight: 4, enabled: true, description: "Un prospect qui compare plusieurs devis est plus volatile (ratio plein = ne compare pas)." },
];

/** Métiers couverts (hypothèse issue des pages publiques d'offres). Éditable dans Réglages. */
export const INSURANCE_TRADES: string[] = [
  "freelance", "consultant", "développeur", "développeuse", "informatique", "coach", "VTC", "graphiste", "photographe", "formateur", "formatrice",
  "commerçant", "commerçante", "boutique", "restaurateur", "restauratrice", "restaurant", "boulangerie", "fleuriste", "coiffeur", "coiffeuse", "salon de coiffure", "opticien", "opticienne",
  "artisan", "BTP", "plaquiste", "maçon", "maçonnerie", "électricien", "plombier", "peintre", "couvreur", "carreleur", "menuisier", "charpentier", "chauffagiste",
];
