import { rulesAnalysis } from "@/lib/ai/fallback";
import { EFFECTIFS, nafLabel } from "@/lib/enrichment/naf";
import { scoreLead, verdictFromScore } from "@/lib/scoring/engine";
import { assignmentNote, pickAssignee } from "@/lib/team/assignment";
import type {
  AssignmentRule, Enrichment, Lead, LeadAnalysis, LeadScore, LeadSourceType, LeadStatus, Member, OrgSettings, Outcome, Role, Verdict,
} from "@/lib/types";
import type { DemoStoreData } from "./data";

/**
 * EQUIPE ET HISTORIQUE DE DEMONSTRATION (S2).
 * Tout est FICTIF : membres, leads historiques, délais, résultats. Les données sont générées de façon déterministe
 * (même graine, même historique) pour que le tableau de bord reste lisible, et sont affichées comme données de démonstration.
 */

export type DemoKind = "maintia" | "orus";

interface MemberDef { slot: string; name: string; role: Role; /** Rapidité et efficacité de l'historique fictif. */ skill: number }

const TEAMS: Record<DemoKind, { domain: string; members: MemberDef[] }> = {
  maintia: {
    domain: "maintia.example",
    members: [
      { slot: "admin", name: "Hélène Marchal", role: "admin", skill: 1 },
      { slot: "manager", name: "Karim Delorme", role: "manager", skill: 1 },
      { slot: "sales-1", name: "Camille Rousset", role: "commercial", skill: 1.25 },
      { slot: "sales-2", name: "Théo Lambert", role: "commercial", skill: 1 },
      { slot: "sales-3", name: "Inès Faure", role: "commercial", skill: 0.7 },
    ],
  },
  orus: {
    domain: "cas-orus.example",
    members: [
      { slot: "admin", name: "Claire Dubreuil", role: "admin", skill: 1 },
      { slot: "manager", name: "Antoine Vasseur", role: "manager", skill: 1 },
      { slot: "sales-1", name: "Jules Perrot", role: "commercial", skill: 1.25 },
      { slot: "sales-2", name: "Manon Girard", role: "commercial", skill: 1 },
      { slot: "sales-3", name: "Sofiane Berrada", role: "commercial", skill: 0.82 },
    ],
  },
};

/** Critère dont le résultat fictif ne dépend pas (calibration : exemple de critère inutile). */
const NEUTRAL_CRITERION: Record<DemoKind, string | null> = { maintia: "zone", orus: "size" };

const KIND_INDEX: Record<DemoKind, number> = { maintia: 1, orus: 2 };

export const memberId = (kind: DemoKind, slot: string): string => {
  const n = ["admin", "manager", "sales-1", "sales-2", "sales-3"].indexOf(slot) + 1;
  return `00000000-0000-4000-8070-0000000${KIND_INDEX[kind]}00${String(n).padStart(2, "0")}`;
};

export function demoMemberSlot(m: { userId: string }): string | null {
  for (const kind of Object.keys(TEAMS) as DemoKind[]) {
    const hit = TEAMS[kind].members.find((d) => memberId(kind, d.slot) === m.userId);
    if (hit) return hit.slot;
  }
  return null;
}

export function buildMembers(kind: DemoKind, orgId: string, createdAt: string): Member[] {
  const t = TEAMS[kind];
  return t.members.map((d) => ({
    userId: memberId(kind, d.slot), orgId, role: d.role, name: d.name,
    email: `${d.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, "").replace(/ /g, ".")}@${t.domain}`,
    active: true, status: "active", createdAt,
  }));
}

export function buildSettings(kind: DemoKind, orgId: string): OrgSettings {
  const base: OrgSettings = {
    orgId,
    assignment: { mode: "round_robin", rules: [] },
    commercialsSeeAll: false,
    speedTargets: { callNowMinutes: 5, nurtureMinutes: 120 },
  };
  if (kind === "maintia") return base;
  const rules: AssignmentRule[] = [
    { id: "rule-senior", label: "Score 75 et plus : commercial senior", sources: [], keywords: [], minScore: 75, assigneeId: memberId("orus", "sales-1") },
    { id: "rule-btp", label: "Chantier et décennale : spécialiste BTP", sources: [], keywords: ["décennale", "chantier", "plaquiste", "maçon"], minScore: null, assigneeId: memberId("orus", "sales-2") },
  ];
  return { ...base, assignment: { mode: "segments", rules }, commercialsSeeAll: true };
}

/* ---------- Générateur pseudo-aléatoire déterministe ---------- */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rng = () => number;
const pick = <T,>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)]!;
const weighted = <T,>(rng: Rng, list: readonly (readonly [T, number])[]): T => {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of list) if ((r -= w) <= 0) return v;
  return list[list.length - 1]![0];
};
/** Loi log-normale de médiane `median` (minutes). */
const lognormal = (rng: Rng, median: number, sigma: number) => {
  const u = Math.max(1e-9, rng());
  const v = rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return median * Math.exp(sigma * z);
};

const FIRST = ["Alexandre", "Sarah", "Nicolas", "Emma", "Julien", "Laura", "Maxime", "Pauline", "Antoine", "Clara", "Romain", "Marine", "Thibault", "Océane", "Florian", "Justine", "Guillaume", "Mélanie", "Cédric", "Aurore", "Benoît", "Elsa", "Loïc", "Margaux", "Étienne", "Lucile", "Damien", "Anaïs", "Fabrice", "Solène"];
const LAST = ["Garcia", "Petit", "Roux", "Fontaine", "Chevalier", "Blanc", "Guerin", "Muller", "Henry", "Lopez", "Faure", "Andre", "Mercier", "Dupuis", "Lacroix", "Gaillard", "Brunet", "Colin", "Leclerc", "Perrin", "Renard", "Meunier", "Rolland", "Carpentier", "Marechal", "Jacob", "Lemaire", "Collet", "Poulain", "Charpentier"];

interface CityDef { city: string; zip: string; dept: string; region: string }
const CITIES: CityDef[] = [
  { city: "Lyon", zip: "69003", dept: "69", region: "Auvergne-Rhône-Alpes" },
  { city: "Grenoble", zip: "38000", dept: "38", region: "Auvergne-Rhône-Alpes" },
  { city: "Toulouse", zip: "31000", dept: "31", region: "Occitanie" },
  { city: "Montpellier", zip: "34000", dept: "34", region: "Occitanie" },
  { city: "Nanterre", zip: "92000", dept: "92", region: "Île-de-France" },
  { city: "Lille", zip: "59000", dept: "59", region: "Hauts-de-France" },
  { city: "Nantes", zip: "44000", dept: "44", region: "Pays de la Loire" },
  { city: "Bordeaux", zip: "33000", dept: "33", region: "Nouvelle-Aquitaine" },
  { city: "Rennes", zip: "35000", dept: "35", region: "Bretagne" },
  { city: "Strasbourg", zip: "67000", dept: "67", region: "Grand Est" },
  { city: "Marseille", zip: "13001", dept: "13", region: "Provence-Alpes-Côte d'Azur" },
  { city: "Dijon", zip: "21000", dept: "21", region: "Bourgogne-Franche-Comté" },
];

type Tier = "strong" | "mid" | "weak";

interface Draft {
  first: string; last: string; company: string; job: string; domain: string; naf: string; eff: keyof typeof EFFECTIFS | null;
  city: CityDef; message: string; sourceDetail: string; months: number;
}

/* ---------- Profil Maintia (GMAO, industrie) ---------- */

const M_COMPANY = ["Atelier", "Fonderie", "Usinage", "Plasturgie", "Logistique", "Transports", "Conserverie", "Cartonnerie", "Chaudronnerie", "Laiterie", "Imprimerie", "Entrepôts", "Brasserie", "Verrerie"];
const M_PLACE = ["Vallon", "Rhodanie", "Aubrac", "Garonne", "Vercors", "Cévennes", "Pontcarré", "Lauragais", "Bresse", "Dauphiné", "Forez", "Ventoux", "Camargue", "Maurienne", "Quercy"];
const M_STRONG_MSG = [
  "Nous avons 3 sites et une maintenance gérée sur Excel. Nous cherchons un outil de GMAO, budget validé autour de 30 k€. Pouvez-vous nous rappeler cette semaine ?",
  "Notre parc de machines tombe trop souvent en panne. Projet de digitalisation de la maintenance cette année, enveloppe de 40 000 euros prévue, démo possible dès la semaine prochaine.",
  "Nous remplaçons notre logiciel actuel, fin de contrat en mars. Besoin d'une démo pour 2 sites de production, un devis serait utile.",
  "Besoin urgent d'un outil de suivi des ordres de travail, un audit est prévu ce mois. Merci de me rappeler pour une présentation.",
  "Nous voulons centraliser la maintenance de nos entrepôts et passer au numérique d'ici 2 mois. Quels sont vos tarifs ? Budget alloué.",
  "Maintenance préventive à structurer sur 4 lignes de production, direction d'accord pour un budget de 25 k€. Rendez-vous possible cette semaine.",
];
const M_MID_MSG = [
  "Nous étudions l'intérêt d'un outil de suivi de maintenance, pouvez-vous m'envoyer de la documentation ?",
  "Nous sommes intéressés, mais nous avons déjà un outil en place. On voudrait voir ce que vous proposez en plus.",
  "Nous cherchons à moderniser notre suivi d'équipements, mais le projet démarrera plutôt l'année prochaine.",
  "Nous évaluons des outils de maintenance. Pouvez-vous nous présenter votre solution ? Budget à définir avec la direction.",
  "Nous voulons comparer plusieurs offres de GMAO d'ici la fin du trimestre.",
];
const M_WEAK_MSG = [
  "Bonjour, je suis étudiant et je cherche un stage dans votre entreprise.",
  "Pas de budget pour le moment, je voulais juste savoir si c'est gratuit.",
  "Bonjour, curieux de découvrir votre produit.",
  "Je vous propose mes services de référencement pour améliorer votre visibilité.",
  "Informations sur vos tarifs, merci.",
  "Je fais un mémoire sur les outils de maintenance et je voudrais vous interviewer.",
];

function maintiaDraft(rng: Rng, tier: Tier, n: number): Draft {
  const strong = ["25.62A", "52.29A", "10.39B", "24.51Z", "49.41A", "22.29A", "10.72Z", "17.21A"];
  const weak = ["96.02A", "56.10A", "85.59A", "47.11F", "73.11Z", "62.01Z"];
  const naf = tier === "weak" ? pick(rng, weak) : tier === "mid" ? pick(rng, [...strong.slice(0, 3), ...weak.slice(0, 2)]) : pick(rng, strong);
  const eff = (tier === "strong" ? pick(rng, ["12", "12", "21", "22"]) : tier === "mid" ? pick(rng, ["11", "12", "21", "32"]) : pick(rng, ["01", "02", "03", null])) as keyof typeof EFFECTIFS | null;
  // Ville tirée sans lien avec le niveau du lead : la zone géographique est volontairement un critère peu prédictif (démonstration de la calibration).
  const city = tier === "weak" ? pick(rng, CITIES) : tier === "mid" ? pick(rng, CITIES) : pick(rng, CITIES);
  const job = tier === "strong" ? pick(rng, ["Directeur des opérations", "Responsable maintenance", "Directeur industriel", "Directrice générale", "Responsable de site"])
    : tier === "mid" ? pick(rng, ["Responsable qualité", "Chargé de projets", "Acheteur", "Responsable production"])
    : pick(rng, ["Étudiant", "Stagiaire marketing", "Assistante", "Consultant"]);
  const company = `${pick(rng, M_COMPANY)} ${pick(rng, M_PLACE)} ${n}`;
  const message = tier === "strong" ? pick(rng, M_STRONG_MSG) : tier === "mid" ? pick(rng, M_MID_MSG) : pick(rng, M_WEAK_MSG);
  return {
    first: pick(rng, FIRST), last: pick(rng, LAST), company, job, domain: `hist-${n}.example`, naf, eff, city, message,
    sourceDetail: pick(rng, ["Demande de démo", "Demande de devis", "Demande de contact", "Demande de tarif"]), months: 24 + Math.floor(rng() * 200),
  };
}

/* ---------- Profil Orus (assurance pro) ---------- */

interface Trade { job: string; naf: string; word: string }
const O_TRADES: Trade[] = [
  { job: "Plaquiste", naf: "43.31Z", word: "plaquiste" }, { job: "Maçon", naf: "43.99C", word: "maçonnerie" }, { job: "Électricien", naf: "43.21A", word: "électricien" },
  { job: "Plombier", naf: "43.22A", word: "plombier" }, { job: "Peintre en bâtiment", naf: "43.34Z", word: "peintre" }, { job: "Carreleur", naf: "43.33Z", word: "carreleur" },
  { job: "Consultant freelance", naf: "70.22Z", word: "freelance" }, { job: "Développeur freelance", naf: "62.02A", word: "développeur" }, { job: "Coach sportif", naf: "93.13Z", word: "coach" },
  { job: "Graphiste", naf: "74.10Z", word: "graphiste" }, { job: "Fleuriste", naf: "47.76Z", word: "fleuriste" }, { job: "Restaurateur", naf: "56.10A", word: "restaurant" },
  { job: "Coiffeur", naf: "96.02A", word: "coiffeur" }, { job: "Chauffeur VTC", naf: "49.32Z", word: "VTC" },
];
const O_OFFTARGET: Trade[] = [
  { job: "Directeur des achats", naf: "30.30Z", word: "aéronautique" }, { job: "Pyrotechnicien", naf: "20.51Z", word: "pyrotechnie" }, { job: "Garagiste", naf: "45.20A", word: "garage automobile" },
];
const O_PRODUCTS = ["décennale", "RC Pro", "multirisque", "mutuelle TNS", "prévoyance TNS", "assurance auto pro"];

function orusDraft(rng: Rng, tier: Tier, n: number): Draft {
  const trade = tier === "weak" && rng() < 0.6 ? pick(rng, O_OFFTARGET) : pick(rng, O_TRADES);
  const btp = ["43.31Z", "43.99C", "43.21A", "43.22A", "43.34Z", "43.33Z"].includes(trade.naf);
  const product = btp && rng() < 0.7 ? "décennale" : pick(rng, O_PRODUCTS.filter((p) => p !== "décennale"));
  const msgs: Record<Tier, string[]> = {
    strong: [
      `Je suis ${trade.word} à mon compte. J'ai un chantier qui démarre lundi et le client me demande mon attestation avant d'entrer sur site. Je voudrais un devis ${product}, pouvez-vous m'appeler cette semaine ?`,
      `Mon contrat ${product} arrive à échéance le mois prochain et mon assureur augmente le prix de 18 %. Je voudrais un devis ${product}, aucun sinistre. Merci de m'appeler en fin de journée.`,
      `Je viens de créer mon activité de ${trade.word} et il me faut une ${product} avant mon premier chantier dans 10 jours. L'attestation est demandée par le client. Rappelez-moi.`,
      `Devis ${product} commencé hier soir, pas terminé. Mon contrat actuel expire dans deux semaines et je dois le résilier. Pouvez-vous m'appeler ?`,
    ],
    mid: [
      `Je compare 3 devis pour ma ${product}. J'ai un contrat qui se termine dans 3 mois. Je voulais surtout savoir vos tarifs.`,
      `${trade.job}, je cherche une ${product}. J'ai déjà un devis chez un autre courtier, je compare les garanties.`,
      `Ma ${product} arrive à échéance dans 2 mois, je voudrais un tarif et une proposition par email.`,
      `Je m'intéresse à une ${product}, je regarde ce qui existe, pas de date précise.`,
    ],
    weak: [
      `Je voulais juste un prix pour une ${product}, rien d'urgent.`,
      `Bonjour, je voudrais des renseignements sur vos assurances pour mon activité.`,
      `J'ai eu trois sinistres en deux ans et mon assureur m'a résilié. Il me faut une ${product} mais je n'ai pas de date.`,
      `Je prépare un mémoire sur l'assurance en ligne et je voudrais interviewer un conseiller.`,
    ],
  };
  return {
    first: pick(rng, FIRST), last: pick(rng, LAST), company: `${trade.job} ${pick(rng, LAST)} ${n}`, job: trade.job, domain: `hist-${n}.example`, naf: trade.naf,
    // Effectif tiré sans lien avec le niveau du lead : critère volontairement peu prédictif (démonstration de la calibration).
    eff: (tier === "weak" ? pick(rng, ["00", "01", "02", "11", "12", "21"]) : pick(rng, ["00", "01", "02", "11", "12", "21"])) as keyof typeof EFFECTIFS, city: pick(rng, CITIES), message: pick(rng, msgs[tier]),
    sourceDetail: pick(rng, [`Demande de devis ${product}`, "Demande de rappel", "Devis abandonné", "Comparateur"]), months: tier === "strong" ? Math.floor(rng() * 12) : 6 + Math.floor(rng() * 120),
  };
}

/* ---------- Construction ---------- */

/** Motif structuré associé à chaque texte de l'historique fictif (même index). */
const WON_CODES = ["Offre adaptée", "Réactivité", "Prix", "Recommandation", "Réactivité"];
const LOST_CODES = ["Concurrent", "Pas de budget", "Injoignable", "Prix", "Timing", "Hors cible"];
const WON_REASONS = ["Offre adaptée et délai de réponse apprécié", "Attestation fournie le jour même", "Prix et garanties jugés clairs", "Recommandé par un confrère", "Rappel rapide, décision prise lors de l'appel"];
const LOST_REASONS = ["Reste chez son assureur actuel", "Budget inférieur à l'offre minimale", "Injoignable après trois tentatives", "A choisi un concurrent moins cher", "Projet reporté", "Hors cible"];
const CALL_NOTES = ["Appel passé : besoin confirmé, devis envoyé.", "Appel passé : décideur joint, rendez-vous proposé.", "Appel passé : à recontacter en fin de semaine.", "Appel passé : questions sur les garanties, documentation envoyée."];

const SOURCES: Record<DemoKind, readonly (readonly [LeadSourceType, number])[]> = {
  maintia: [["formulaire", 46], ["webhook", 18], ["email", 16], ["csv", 10], ["saisie", 6], ["crm", 4]],
  orus: [["formulaire", 38], ["webhook", 26], ["email", 20], ["saisie", 10], ["crm", 6]],
};

const uid = (series: number, n: number) => `00000000-0000-4000-80${String(series).padStart(2, "0")}-${String(n).padStart(12, "0")}`;

interface Cursor { value: string | null }

function assign(data: DemoStoreData, lead: Lead, score: number, cursor: Cursor, at: Date, n: number, authorless = true): void {
  const res = pickAssignee({ settings: data.settings, members: data.members, lead, score, cursor: cursor.value });
  cursor.value = res.cursor;
  if (!res.ownerId) return;
  lead.ownerId = res.ownerId;
  lead.assignedAt = at.toISOString();
  const owner = data.members.find((m) => m.userId === res.ownerId);
  data.activities.push({
    id: uid(7, n), leadId: lead.id, orgId: lead.orgId, type: "assignment", content: assignmentNote(owner?.name ?? null, res.reason),
    authorId: authorless ? null : res.ownerId, createdAt: at.toISOString(),
  });
}

/** Ajoute l'équipe, l'attribution des leads actuels et l'historique de 90 jours. Appelé en fin de construction du jeu de démonstration. */
export function applyTeamLayer(data: DemoStoreData, kind: DemoKind, now: Date = new Date()): DemoStoreData {
  const orgId = data.org.id;
  data.members = buildMembers(kind, orgId, new Date(now.getTime() - 120 * 86_400_000).toISOString());
  data.settings = buildSettings(kind, orgId);
  const cursor: Cursor = { value: null };
  const skill = new Map(TEAMS[kind].members.map((d) => [memberId(kind, d.slot), d.skill]));
  const targets = data.settings.speedTargets;

  /* 1. Leads actuels : attribution chronologique, premiers contacts réalistes. */
  const current = [...data.leads].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let seq = 1;
  for (const lead of current) {
    const created = new Date(lead.createdAt);
    assign(data, lead, data.scoreByLead.get(lead.id) ?? 0, cursor, new Date(created.getTime() + 60_000), seq++);
  }
  // Les activités "premier appel" de démonstration sont attribuées au commercial du lead.
  for (const a of data.activities) {
    if (a.type === "call" && a.authorId) a.authorId = data.leads.find((l) => l.id === a.leadId)?.ownerId ?? null;
  }
  // Quelques leads récents déjà rappelés : un dans le délai, un hors délai, pour que la file montre les trois états.
  const fresh = current.filter((l) => l.status === "new" && data.verdictByLead.get(l.id) === "call_now").reverse();
  fresh.forEach((lead, i) => {
    const verdictTarget = targets.callNowMinutes;
    const delay = i % 3 === 0 ? 3 : i % 3 === 1 ? 0 : verdictTarget * 4 + 2;
    if (delay === 0) return;
    const at = new Date(new Date(lead.createdAt).getTime() + delay * 60_000);
    lead.firstContactedAt = at.toISOString();
    lead.status = "contacted";
    lead.updatedAt = at.toISOString();
    data.activities.push({ id: uid(8, 100 + i), leadId: lead.id, orgId, type: "call", content: "Appel passé : premier échange, besoin confirmé (activité de démonstration).", authorId: lead.ownerId, createdAt: at.toISOString() });
  });

  /* 2. Historique de 90 jours : leads déjà traités, gagnés ou perdus. */
  // DÉTERMINISME : toutes les décisions (niveau du lead, délais, résultat) ne dépendent que de la graine et de l'ancienneté
  // en heures, jamais de l'horloge ni du jour de la semaine. Seuls les horodatages affichés suivent la date du jour
  // (et évitent les week-ends). Le jeu de données, et donc les statistiques de calibration, sont les mêmes tous les jours.
  // Chaque lead a sa propre graine : aucun lead ne décale les tirages des autres.
  // Graines choisies pour que la calibration soit parlante : un critère clairement prédictif et un critère sans effet
  // (zone chez Maintia, effectif chez Orus), avec une marge.
  const SEED = kind === "maintia" ? 20260171 : 20260246;
  const count = kind === "maintia" ? 120 : 150;
  const stubs: { idx: number; ageH: number; createdMs: number; draft: Draft; tier: Tier; source: LeadSourceType }[] = [];
  for (let i = 0; i < count; i++) {
    const rng = mulberry32(SEED + i * 7919);
    const ageH = 72 + 2088 * Math.pow(rng(), 1.15);
    const d = new Date(now.getTime() - ageH * 3_600_000);
    d.setUTCHours(7 + Math.floor(rng() * 11), Math.floor(rng() * 60), 0, 0);
    // Peu de leads le week-end : on avance la date au vendredi précédent (tirage toujours consommé, résultat sans effet sur les décisions).
    const weekendRoll = rng();
    const dow = d.getUTCDay();
    if ((dow === 0 || dow === 6) && weekendRoll < 0.65) d.setUTCDate(d.getUTCDate() - (dow === 6 ? 1 : 2));
    // Reste dans la fenêtre de 90 jours (les ajustements d'heure et de week-end pourraient la dépasser).
    if (d.getTime() < now.getTime() - 89.5 * 86_400_000) d.setTime(now.getTime() - 89.5 * 86_400_000);
    const tier = weighted<Tier>(rng, kind === "orus" ? [["strong", 26], ["mid", 32], ["weak", 42]] : [["strong", 32], ["mid", 38], ["weak", 30]]);
    stubs.push({ idx: i, ageH, createdMs: d.getTime(), draft: (kind === "maintia" ? maintiaDraft : orusDraft)(rng, tier, i + 1), tier, source: weighted(rng, SOURCES[kind]) });
  }
  // Du plus ancien au plus récent, selon l'ancienneté (et non l'horodatage) : l'ordre du tour de rôle ne dépend pas de l'horloge.
  stubs.sort((a, b) => b.ageH - a.ageH || a.idx - b.idx);

  stubs.forEach((s, i) => {
    const n = i + 1;
    const rng = mulberry32(SEED + 104729 * (s.idx + 1));
    const d = s.draft;
    const createdAt = new Date(s.createdMs).toISOString();
    const email = `${d.first}.${d.last}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z.]/g, "") + `@${d.domain}`;
    const enrichment: Enrichment = {
      status: "ok", fetchedAt: createdAt,
      company: {
        siren: `999${String(kind === "maintia" ? 200 + n : 700 + n).padStart(6, "0")}`, legalName: d.company.toUpperCase(), nafCode: d.naf, sectorLabel: nafLabel(d.naf),
        employees: d.eff ? EFFECTIFS[d.eff] ?? null : null,
        creationDate: new Date(s.createdMs - d.months * 30.4 * 86_400_000).toISOString().slice(0, 10),
        city: d.city.city, postalCode: d.city.zip, department: d.city.dept, region: d.city.region, categorie: "PME",
      },
      notes: ["Données d'enrichissement fictives (démonstration)."],
    };
    const lead: Lead = {
      id: uid(6, n), orgId, firstName: d.first, lastName: d.last, email, phone: `06 00 00 0${kind === "maintia" ? 3 : 4} ${String(10 + (n % 90))}`,
      company: d.company, jobTitle: d.job, website: null, location: `${d.city.city} (${d.city.dept})`, message: d.message, source: s.source,
      sourceDetail: d.sourceDetail, status: "new", ownerId: null, assignedAt: null, firstContactedAt: null, enrichment, isDemo: true, createdAt, updatedAt: createdAt,
    };

    const result = scoreLead(lead, data.icp, new Date(createdAt));
    const score: LeadScore = { id: uid(9, 100 + n), leadId: lead.id, orgId, total: result.total, details: result.details, breakdown: result.breakdown, createdAt };
    const verdict: Verdict = verdictFromScore(result.total, result.details);
    const analysisContent = rulesAnalysis({ lead, score, icp: data.icp, objections: data.objections });
    const analysis: LeadAnalysis = { id: uid(10, n), leadId: lead.id, orgId, version: 1, origin: "rules", model: null, content: analysisContent, createdAt };

    assign(data, lead, result.total, cursor, new Date(s.createdMs + 60_000), 1000 + n);
    const rep = skill.get(lead.ownerId ?? "") ?? 1;
    const target = verdict === "call_now" ? targets.callNowMinutes : verdict === "nurture" ? targets.nurtureMinutes : null;

    // Délai de premier contact : plus court pour un lead chaud et pour un commercial rapide.
    const baseMedian = verdict === "call_now" ? 7 : verdict === "nurture" ? 150 : 600;
    let delay = lognormal(rng, baseMedian / (rep * rep), 0.8);
    delay = Math.min(Math.max(1, delay), 60 * 48);
    const neverReached = rng() < 0.03 / (rep * rep);
    const ageDays = s.ageH / 24;
    const contacted = !neverReached;
    const contactAt = new Date(s.createdMs + delay * 60_000);

    const speedBonus = target === null || !contacted ? 1 : delay <= target ? 1.18 : delay > target * 4 ? 0.7 : 1;
    // Critère neutre : sa contribution au score ne joue pas sur le résultat fictif (il ne prédit rien, par construction).
    const neutral = NEUTRAL_CRITERION[kind] ? result.details.find((d) => d.key === NEUTRAL_CRITERION[kind]) : undefined;
    const effective = neutral ? result.total - neutral.points + neutral.max * 0.5 : result.total;
    const pWin = contacted ? result.total < 40 ? 0.02 : Math.min(0.8, (0.04 + 0.9 * Math.pow(effective / 100, 2.4)) * Math.pow(0.45 + 0.55 * rep, 1.6) * speedBonus) : 0;
    const closeProb = ageDays > 10 ? 0.93 : 0.55;
    const closed = contacted ? rng() < closeProb : ageDays > 10;

    let status: LeadStatus = "new";
    let outcome: Outcome | null = null;
    if (contacted) {
      lead.firstContactedAt = contactAt.toISOString();
      status = "contacted";
      data.activities.push({ id: uid(8, n), leadId: lead.id, orgId, type: "call", content: pick(rng, CALL_NOTES) + " (activité fictive)", authorId: lead.ownerId, createdAt: contactAt.toISOString() });
      if (rng() < 0.45) {
        data.activities.push({ id: uid(11, n), leadId: lead.id, orgId, type: "email", content: "Email de suivi envoyé avec la proposition (activité fictive).", authorId: lead.ownerId, createdAt: new Date(contactAt.getTime() + (20 + rng() * 40) * 3_600_000).toISOString() });
      }
      if (closed) {
        const roll = rng();
        const won = result.total >= 40 && roll < pWin;
        status = won ? "won" : "lost";
        const closedAt = new Date(Math.min(now.getTime() - 3_600_000, contactAt.getTime() + (1 + rng() * 9) * 86_400_000)).toISOString();
        const pool = won ? WON_REASONS : LOST_REASONS;
        const reasonText = pick(rng, pool);
        const reasonCode = (won ? WON_CODES : LOST_CODES)[pool.indexOf(reasonText)] ?? null;
        outcome = { id: uid(12, n), leadId: lead.id, orgId, result: won ? "won" : "lost", reason: reasonText, reasonCode, createdAt: closedAt };
        lead.updatedAt = closedAt;
      } else if (rng() < 0.5) {
        status = "qualified";
      }
    } else {
      // Jamais joint : perdu faute de suivi, ce qui pèse sur le taux de gain du commercial.
      status = "lost";
      outcome = { id: uid(12, n), leadId: lead.id, orgId, result: "lost", reason: "Jamais rappelé dans les temps", reasonCode: "Injoignable", createdAt: new Date(s.createdMs + 5 * 86_400_000).toISOString() };
    }
    lead.status = status;
    data.leads.push(lead);
    data.scores.push(score);
    data.analyses.push(analysis);
    data.scoreByLead.set(lead.id, result.total);
    data.verdictByLead.set(lead.id, analysisContent.verdict.decision);
    if (outcome) data.outcomes.push(outcome);
  });

  data.rrCursor = cursor.value;
  return data;
}
