import type {
  Criterion,
  CriterionCategory,
  CriterionKey,
  Enrichment,
  IcpConfig,
  Lead,
  LeadScore,
  ScoreDetail,
  Verdict,
} from "@/lib/types";
import { clamp, isProEmail, normalize, round1 } from "@/lib/text";
import { INSURANCE_RULES } from "./insurance";

/**
 * Moteur de score : fonction pure, sans effet de bord, sans appel réseau.
 * Chaque critère renvoie un ratio entre 0 et 1 et une raison lisible.
 * Les points = ratio x poids normalisé (la somme des poids actifs vaut 100).
 */

export interface ScoringLead {
  email: string;
  phone: string | null;
  company: string;
  jobTitle: string | null;
  website: string | null;
  location: string | null;
  message: string;
  source: Lead["source"];
  sourceDetail: string | null;
  enrichment: Enrichment | null;
  createdAt: string;
}

export type ScoringIcp = Pick<IcpConfig, "sectors" | "sizeMin" | "sizeMax" | "zones" | "decisionRoles" | "criteria">;

export interface ScoreResult {
  total: number;
  details: ScoreDetail[];
  breakdown: LeadScore["breakdown"];
}

export const VERDICT_THRESHOLDS = { callNow: 70, nurture: 40 } as const;

interface RuleOutput {
  ratio: number;
  reason: string;
}
type Rule = (lead: ScoringLead, icp: ScoringIcp, now: Date) => RuleOutput;

const has = (haystack: string, needle: string) => needle.length > 0 && haystack.includes(needle);
const countHits = (text: string, words: string[]) => words.filter((w) => text.includes(w)).length;

/* ---------- Adéquation ---------- */

const sectorRule: Rule = (lead, icp) => {
  const targets = icp.sectors.map(normalize).filter(Boolean);
  if (targets.length === 0) return { ratio: 0.5, reason: "Aucun secteur cible défini : score neutre." };
  const company = lead.enrichment?.company;
  const web = lead.enrichment?.website;
  const haystack = normalize(
    [company?.sectorLabel, company?.nafCode, web?.title, web?.description, lead.company, lead.message].filter(Boolean).join(" "),
  );
  const hasData = Boolean(company?.sectorLabel || web?.title || web?.description);
  for (const t of targets) {
    if (has(haystack, t)) {
      return { ratio: 1, reason: `Secteur "${t}" retrouvé (${company?.sectorLabel ?? "site web ou message"}).` };
    }
  }
  for (const t of targets) {
    const words = t.split(/[\s,/-]+/).filter((w) => w.length >= 5);
    const hit = words.find((w) => haystack.includes(w));
    if (hit) return { ratio: 0.6, reason: `Proche de la cible : le terme "${hit}" apparaît dans le profil.` };
  }
  if (!hasData) return { ratio: 0.3, reason: "Secteur inconnu (aucune donnée d'enrichissement) : score prudent." };
  return { ratio: 0, reason: `Secteur "${company?.sectorLabel ?? "détecté"}" hors de la cible.` };
};

const sizeRule: Rule = (lead, icp) => {
  const { sizeMin, sizeMax } = icp;
  if (sizeMin === null && sizeMax === null) return { ratio: 0.5, reason: "Aucune fourchette d'effectif définie : score neutre." };
  const emp = lead.enrichment?.company?.employees;
  if (!emp) return { ratio: 0.3, reason: "Effectif inconnu (non diffusé ou entreprise non trouvée) : score prudent." };
  const lo = sizeMin ?? 0;
  const hi = sizeMax ?? Number.POSITIVE_INFINITY;
  if (emp.min >= lo && emp.max <= hi) return { ratio: 1, reason: `Effectif ${emp.label} dans la cible (${lo} à ${Number.isFinite(hi) ? hi : "+"}).` };
  if (emp.max >= lo && emp.min <= hi) return { ratio: 0.6, reason: `Effectif ${emp.label} en chevauchement partiel avec la cible.` };
  const factor = emp.max < lo ? lo / Math.max(emp.max, 1) : emp.min / Math.max(hi, 1);
  if (factor <= 2) return { ratio: 0.25, reason: `Effectif ${emp.label} proche mais hors cible.` };
  return { ratio: 0, reason: `Effectif ${emp.label} très éloigné de la cible.` };
};

const zoneRule: Rule = (lead, icp) => {
  const zones = icp.zones.map(normalize).filter(Boolean);
  if (zones.length === 0) return { ratio: 0.5, reason: "Aucune zone cible définie : score neutre." };
  const c = lead.enrichment?.company;
  const place = normalize([c?.city, c?.region, lead.location].filter(Boolean).join(" "));
  const dept = c?.department ?? "";
  const postal = c?.postalCode ?? "";
  const nationwide = zones.some((z) => ["france", "national", "toute la france", "france entiere"].includes(z));
  const known = Boolean(place || dept || postal);
  for (const z of zones) {
    if (/^\d{2,3}$/.test(z) && (dept === z || postal.startsWith(z))) return { ratio: 1, reason: `Département ${z} couvert.` };
    if (!/^\d{2,3}$/.test(z) && has(place, z)) return { ratio: 1, reason: `Zone "${z}" couverte.` };
  }
  if (nationwide) return { ratio: known ? 0.9 : 0.6, reason: "Vous couvrez toute la France." };
  if (!known) return { ratio: 0.3, reason: "Localisation inconnue : score prudent." };
  return { ratio: 0, reason: `Localisation (${c?.city ?? lead.location ?? "inconnue"}) hors des zones couvertes.` };
};

const SENIOR_WORDS = ["directeur", "directrice", "responsable", "head", "chef", "president", "gerant", "fondateur", "fondatrice", "ceo", "cto", "coo", "cfo", "daf", "dg", "vp", "owner", "proprietaire", "dirigeant", "associe", "manager"];
const JUNIOR_WORDS = ["stagiaire", "etudiant", "alternant", "apprenti", "assistant", "assistante", "freelance", "etudiante"];

const roleRule: Rule = (lead, icp) => {
  const title = normalize(lead.jobTitle);
  if (!title) return { ratio: 0.2, reason: "Fonction non renseignée : décideur incertain." };
  if (JUNIOR_WORDS.some((w) => title.includes(w))) return { ratio: 0, reason: `Fonction "${lead.jobTitle}" : peu de pouvoir de décision.` };
  const targets = icp.decisionRoles.map(normalize).filter(Boolean);
  const match = targets.find((t) => title.includes(t) || t.includes(title));
  if (match) return { ratio: 1, reason: `Fonction "${lead.jobTitle}" correspond au rôle décideur "${match}".` };
  if (SENIOR_WORDS.some((w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(title))) {
    return { ratio: 0.6, reason: `Fonction "${lead.jobTitle}" de niveau décisionnel probable.` };
  }
  return { ratio: 0.25, reason: `Fonction "${lead.jobTitle}" : prescripteur plutôt que décideur.` };
};

/* ---------- Intention ---------- */

const STRONG_INTENT = ["devis", "tarif", "prix", "demo", "rendez-vous", "rdv", "rappel", "acheter", "souscrire", "mettre en place", "deployer", "remplacer", "migrer", "nous cherchons", "je cherche", "recherchons", "besoin", "projet", "contrat", "proposition", "consultation", "appel d'offres", "equiper", "automatiser", "outil"];
const WEAK_INTENT = ["information", "renseign", "curieux", "decouvrir", "en savoir plus", "question"];
const NEGATIVE_INTENT = ["stage", "alternance", "candidature", "recrut", "emploi", "etudiant", "memoire", "these", "backlink", "referencement", "vous propose mes services", "partenariat publicitaire", "spam"];

const messageRule: Rule = (lead) => {
  const msg = normalize(lead.message);
  if (!msg) return { ratio: 0.1, reason: "Aucun message : intention non exprimée." };
  const neg = NEGATIVE_INTENT.filter((w) => msg.includes(w));
  if (neg.length > 0) return { ratio: 0, reason: `Message hors sujet commercial (mention de "${neg[0]}").` };
  const strong = STRONG_INTENT.filter((w) => msg.includes(w));
  const weak = countHits(msg, WEAK_INTENT);
  let ratio = 0.1;
  if (msg.length >= 120) ratio += 0.15;
  else if (msg.length >= 40) ratio += 0.08;
  if (strong.length > 0) ratio += Math.min(0.75, 0.28 * strong.length);
  else if (weak > 0) ratio += 0.15;
  ratio = clamp(ratio, 0, 1);
  const reason =
    strong.length > 0
      ? `Besoin concret exprimé (${strong.slice(0, 3).map((w) => `"${w}"`).join(", ")}).`
      : weak > 0
        ? "Simple demande d'information, sans besoin précis."
        : "Message court, sans signal d'achat clair.";
  return { ratio, reason };
};

const budgetRule: Rule = (lead) => {
  const msg = normalize(lead.message);
  if (/(pas de budget|petit budget|budget limite|gratuit|sans budget)/.test(msg)) return { ratio: 0, reason: "Contrainte de budget explicite." };
  if (/\d[\d\s.,]*\s?(k\s?€|k€|keur|€|euros?)/.test(msg) || /budget (valide|debloque|alloue|disponible)/.test(msg)) {
    return { ratio: 1, reason: "Montant ou budget validé mentionné." };
  }
  if (/(budget|enveloppe|investir|investissement|financement)/.test(msg)) return { ratio: 0.6, reason: "Budget évoqué sans montant." };
  return { ratio: 0.2, reason: "Aucun signal de budget dans le message." };
};

const SOURCE_BASE: Record<Lead["source"], number> = { formulaire: 0.85, email: 0.7, crm: 0.7, webhook: 0.7, saisie: 0.6, csv: 0.35 };

const sourceRule: Rule = (lead) => {
  let ratio = SOURCE_BASE[lead.source];
  const detail = normalize(lead.sourceDetail);
  const direct = /(demo|devis|tarif|rappel|contact)/.test(detail);
  if (direct) ratio = Math.min(1, ratio + 0.15);
  const label = { formulaire: "Formulaire", email: "Email", crm: "CRM", webhook: "Webhook", saisie: "Saisie manuelle", csv: "Import CSV" }[lead.source];
  return {
    ratio,
    reason: direct ? `${label} : demande directe (${lead.sourceDetail}).` : `${label} : ${ratio >= 0.8 ? "demande entrante directe" : ratio >= 0.6 ? "source fiable" : "contact froid, intention à confirmer"}.`,
  };
};

const contactRule: Rule = (lead) => {
  let ratio = 0;
  const parts: string[] = [];
  if (isProEmail(lead.email)) {
    ratio += 0.5;
    parts.push("email professionnel");
  } else parts.push("email personnel ou invalide");
  if (lead.phone) {
    ratio += 0.3;
    parts.push("téléphone");
  } else parts.push("pas de téléphone");
  if (lead.company && lead.company.trim().length > 1) {
    ratio += 0.2;
    parts.push("entreprise renseignée");
  }
  return { ratio, reason: parts.join(", ") + "." };
};

/* ---------- Timing ---------- */

const URGENT_HIGH = ["urgent", "urgence", "asap", "immediat", "au plus vite", "cette semaine", "des que possible", "rapidement", "ce mois", "tres vite", "sous 15 jours"];
const URGENT_LOW = ["annee prochaine", "plus tard", "pas presse", "a terme", "veille", "pas de date"];

const urgencyRule: Rule = (lead) => {
  const msg = normalize(lead.message);
  const low = URGENT_LOW.find((w) => msg.includes(w));
  if (low) return { ratio: 0.1, reason: `Échéance lointaine ("${low}").` };
  const high = URGENT_HIGH.find((w) => msg.includes(w));
  if (high) return { ratio: 1, reason: `Urgence exprimée ("${high}").` };
  const within = msg.match(/d'ici (?:la fin d[ue] )?(\d+)?\s?(semaines?|mois|trimestre|rentree)/);
  if (within) {
    const n = within[1] ? Number(within[1]) : 1;
    const unit = within[2] ?? "";
    const months = unit.startsWith("semaine") ? n / 4 : unit === "mois" ? n : 3;
    return months <= 3 ? { ratio: 0.7, reason: `Échéance à court terme ("${within[0]}").` } : { ratio: 0.4, reason: `Échéance à moyen terme ("${within[0]}").` };
  }
  return { ratio: 0.25, reason: "Aucune échéance mentionnée." };
};

const freshnessRule: Rule = (lead, _icp, now) => {
  const ageH = Math.max(0, (now.getTime() - new Date(lead.createdAt).getTime()) / 3_600_000);
  const label = ageH < 1 ? "moins d'une heure" : ageH < 48 ? `${Math.round(ageH)} h` : `${Math.round(ageH / 24)} jours`;
  if (ageH <= 1) return { ratio: 1, reason: `Reçu il y a ${label} : à traiter tout de suite.` };
  if (ageH <= 24) return { ratio: 0.8, reason: `Reçu il y a ${label}.` };
  if (ageH <= 72) return { ratio: 0.55, reason: `Reçu il y a ${label} : le délai commence à peser.` };
  if (ageH <= 168) return { ratio: 0.3, reason: `Reçu il y a ${label} : lead qui refroidit.` };
  return { ratio: 0.1, reason: `Reçu il y a ${label} : lead froid.` };
};

export const RULES: Record<CriterionKey, Rule> = {
  sector: sectorRule,
  size: sizeRule,
  zone: zoneRule,
  decision_role: roleRule,
  message_intent: messageRule,
  budget_signal: budgetRule,
  source_quality: sourceRule,
  contactability: contactRule,
  urgency: urgencyRule,
  freshness: freshnessRule,
  ...INSURANCE_RULES,
};

const CATEGORIES: CriterionCategory[] = ["fit", "intent", "timing", "risk"];

export function scoreLead(lead: ScoringLead, icp: ScoringIcp, now: Date = new Date()): ScoreResult {
  const active: Criterion[] = icp.criteria.filter((c) => c.enabled && c.weight > 0 && RULES[c.key]);
  const totalWeight = active.reduce((s, c) => s + c.weight, 0);
  const breakdown = Object.fromEntries(CATEGORIES.map((c) => [c, { points: 0, max: 0 }])) as ScoreResult["breakdown"];

  if (totalWeight === 0) return { total: 0, details: [], breakdown };

  const details: ScoreDetail[] = active.map((c) => {
    const out = RULES[c.key](lead, icp, now);
    const max = (c.weight / totalWeight) * 100;
    const points = clamp(out.ratio, 0, 1) * max;
    return { key: c.key, label: c.label, category: c.category, points: round1(points), max: round1(max), reason: out.reason };
  });

  for (const d of details) {
    breakdown[d.category].points = round1(breakdown[d.category].points + d.points);
    breakdown[d.category].max = round1(breakdown[d.category].max + d.max);
  }
  const total = clamp(Math.round(details.reduce((s, d) => s + d.points, 0)), 0, 100);
  return { total, details, breakdown };
}

/** Verdict déterministe à partir du score (utilisé par le repli sans IA et comme garde-fou). */
export function verdictFromScore(total: number, details: ScoreDetail[]): Verdict {
  const intent = details.find((d) => d.key === "message_intent");
  if (intent && intent.max > 0 && intent.points === 0 && /hors sujet/i.test(intent.reason)) return "disqualify";
  // Garde-fou assurance : métier sans offre ou activité hors cible, sans score élevé, ne mérite pas de relance.
  const knockedOut = details.some((d) => (d.key === "trade_covered" || d.key === "target_activity") && d.max > 0 && d.points === 0);
  if (knockedOut && total < VERDICT_THRESHOLDS.callNow - 10) return "disqualify";
  if (total >= VERDICT_THRESHOLDS.callNow) return "call_now";
  if (total >= VERDICT_THRESHOLDS.nurture) return "nurture";
  return "disqualify";
}

export function verdictLabel(v: Verdict): string {
  return { call_now: "Appeler maintenant", nurture: "Nourrir", disqualify: "Disqualifier" }[v];
}
