import { rulesAnalysis } from "@/lib/ai/fallback";
import { DEFAULT_CRITERIA, DEFAULT_OBJECTIONS } from "@/lib/scoring/defaults";
import { scoreLead, verdictFromScore } from "@/lib/scoring/engine";
import { EFFECTIFS, nafLabel } from "@/lib/enrichment/naf";
import type {
  AppNotification, CrmLink, IntegrationInfo, ScoreConfigVersion, SyncLogEntry,
  Activity, Enrichment, IcpConfig, Lead, LeadAnalysis, LeadScore, LeadSourceType, LeadStatus, Member, ObjectionItem, Organization, OrgSettings, Outcome,
} from "@/lib/types";
import { DEFAULT_ORG_SETTINGS } from "@/lib/types";
import { applyTeamLayer } from "./team";

/**
 * DONNEES DE DEMONSTRATION. Toutes les entreprises, personnes, SIREN et sites sont FICTIFS.
 * Les SIREN commencent par 999 (non attribués), les domaines utilisent le TLD réservé ".example".
 * Ces données ne doivent jamais être présentées comme réelles.
 */

export const DEMO_ORG_ID = "00000000-0000-4000-8000-000000000001";
export const DEMO_USER_ID = "00000000-0000-4000-8000-0000000000aa";

interface Seed {
  first: string; last: string; company: string; job: string | null; domain: string; email?: string; phone?: boolean;
  naf: string; eff: keyof typeof EFFECTIFS | null; city: string; zip: string; dept: string; region: string;
  message: string; source: LeadSourceType; detail?: string; ageH: number; status?: LeadStatus; site?: [string, string];
  outcome?: { result: "won" | "lost"; reason: string };
}

const ARA = "Auvergne-Rhône-Alpes";
const OCC = "Occitanie";
const IDF = "Île-de-France";

const SEEDS: Seed[] = [
  // Bons profils
  { first: "Claire", last: "Mollard", company: "Atelier Valdor Mécanique", job: "Directrice des opérations", domain: "valdor-mecanique.example", phone: true, naf: "25.62A", eff: "21", city: "Villeurbanne", zip: "69100", dept: "69", region: ARA, message: "Nous avons 3 sites et une maintenance gérée sur Excel. Nous cherchons un outil de GMAO, budget validé autour de 25 k€. Pourriez-vous nous rappeler cette semaine ?", source: "formulaire", detail: "Demande de démo", ageH: 0.4, site: ["Valdor Mécanique, usinage de précision", "Sous-traitant en usinage de pièces pour l'industrie, 3 sites en Rhône-Alpes."] },
  { first: "Thomas", last: "Eyraud", company: "Logistique Pontcarré", job: "Directeur général", domain: "pontcarre-logistique.example", phone: true, naf: "52.29A", eff: "22", city: "Saint-Priest", zip: "69800", dept: "69", region: ARA, message: "Notre flotte de chariots tombe trop souvent en panne. Nous voulons mettre en place un outil de suivi rapidement, un devis serait utile.", source: "formulaire", detail: "Demande de devis", ageH: 2, site: ["Pontcarré Logistique", "Entreposage et transport pour l'industrie et la distribution."] },
  { first: "Sophie", last: "Barral", company: "Conserverie Lavandou-Nord", job: "Responsable maintenance", domain: "lavandou-nord.example", phone: true, naf: "10.39B", eff: "12", city: "Grenoble", zip: "38000", dept: "38", region: ARA, message: "Nous remplaçons notre logiciel actuel, fin de contrat en mars. Besoin d'une démo pour 2 sites de production.", source: "formulaire", detail: "Demande de démo", ageH: 5 },
  { first: "Julien", last: "Castaing", company: "Fonderie Aubrac Sud", job: "Directeur industriel", domain: "aubrac-sud.example", phone: true, naf: "24.51Z", eff: "31", city: "Toulouse", zip: "31000", dept: "31", region: OCC, message: "Projet de digitalisation de la maintenance cette année, enveloppe de 40 000 euros prévue. Rendez-vous possible dès la semaine prochaine.", source: "webhook", detail: "Formulaire site web", ageH: 9, status: "contacted" },
  { first: "Nadia", last: "Ferrand", company: "Transports Combe-Rivière", job: "Responsable de site", domain: "combe-riviere.example", phone: true, naf: "49.41A", eff: "21", city: "Montpellier", zip: "34000", dept: "34", region: OCC, message: "Nous devons suivre l'entretien de 60 camions et passer au numérique d'ici 2 mois. Quels sont vos tarifs ?", source: "formulaire", detail: "Demande de tarif", ageH: 14, status: "qualified" },
  { first: "Hugo", last: "Lenfant", company: "Presses Marnaval", job: "Directeur de production", domain: "marnaval.example", phone: true, naf: "22.29A", eff: "22", city: "Nanterre", zip: "92000", dept: "92", region: IDF, message: "Nous cherchons à automatiser nos ordres de travail de maintenance. Besoin urgent, un audit est prévu ce mois.", source: "email", ageH: 20, site: ["Marnaval Plasturgie", "Injection plastique pour l'automobile et le médical."] },
  { first: "Élise", last: "Garnier", company: "Biscuiterie Tourneval", job: "Directrice générale", domain: "tourneval.example", phone: true, naf: "10.72Z", eff: "12", city: "Saint-Étienne", zip: "42000", dept: "42", region: ARA, message: "Cherche une solution de maintenance préventive pour notre ligne de production. Budget à définir avec la direction financière.", source: "formulaire", ageH: 30, status: "won", outcome: { result: "won", reason: "Pilote concluant sur un site, contrat signé" } },
  { first: "Marc", last: "Sabatier", company: "Cartonnages Fontvieille", job: "Responsable maintenance", domain: "fontvieille-carton.example", phone: true, naf: "17.21A", eff: "21", city: "Lyon", zip: "69007", dept: "69", region: ARA, message: "Notre GMAO actuelle est obsolète, nous souhaitons comparer plusieurs offres d'ici la fin du trimestre.", source: "formulaire", detail: "Demande de contact", ageH: 41 },
  { first: "Aurélie", last: "Benoît", company: "Chaudronnerie Ventadour", job: "Gérante", domain: "ventadour-chaudronnerie.example", phone: true, naf: "25.11Z", eff: "11", city: "Lyon", zip: "69003", dept: "69", region: ARA, message: "Je dirige une PME de 18 personnes, nous voulons structurer notre maintenance. Un devis pour un abonnement serait bienvenu.", source: "formulaire", detail: "Demande de devis", ageH: 52 },
  { first: "Paul", last: "Rieux", company: "Entrepôts Garonne Express", job: "Directeur d'exploitation", domain: "garonne-express.example", phone: true, naf: "52.10B", eff: "22", city: "Toulouse", zip: "31200", dept: "31", region: OCC, message: "Besoin de centraliser la maintenance de nos 4 entrepôts. Merci de me rappeler pour une présentation rapide.", source: "crm", ageH: 70, status: "contacted" },
  // Profils moyens
  { first: "Camille", last: "Duret", company: "Menuiseries Lacoste-Alpes", job: "Chargée de projets", domain: "lacoste-alpes.example", phone: false, naf: "16.23Z", eff: "11", city: "Chambéry", zip: "73000", dept: "73", region: ARA, message: "Nous étudions l'intérêt d'un outil de suivi de maintenance, pouvez-vous m'envoyer de la documentation ?", source: "formulaire", ageH: 7 },
  { first: "Olivier", last: "Magnan", company: "Laiterie des Hautes-Combes", job: "Responsable qualité", domain: "hautes-combes.example", phone: true, naf: "10.51A", eff: "21", city: "Annecy", zip: "74000", dept: "74", region: ARA, message: "Nous sommes intéressés, mais nous avons déjà un outil en place. On voudrait voir ce que vous proposez en plus.", source: "webhook", detail: "Formulaire partenaire", ageH: 26 },
  { first: "Laure", last: "Vidal", company: "Imprimerie Sainte-Croix", job: "Assistante de direction", domain: "sainte-croix-print.example", phone: true, naf: "18.12Z", eff: "12", city: "Marseille", zip: "13001", dept: "13", region: "Provence-Alpes-Côte d'Azur", message: "Mon directeur souhaite des informations sur vos solutions, pas de date précise.", source: "formulaire", ageH: 48 },
  { first: "Franck", last: "Delmas", company: "Distribution Bastide Nord", job: "Directeur logistique", domain: "bastide-nord.example", phone: true, naf: "46.90Z", eff: "32", city: "Lille", zip: "59000", dept: "59", region: "Hauts-de-France", message: "Nous gérons 12 plateformes et cherchons un outil, mais le projet démarrera plutôt l'année prochaine.", source: "email", ageH: 33 },
  { first: "Amandine", last: "Roux", company: "Atelier Cérès Bio", job: "Responsable production", domain: "ceres-bio.example", phone: false, naf: "10.61A", eff: "03", city: "Nantes", zip: "44000", dept: "44", region: "Pays de la Loire", message: "Bonjour, quels sont vos prix pour un petit atelier ? Nous avons un budget limité.", source: "formulaire", detail: "Demande de tarif", ageH: 60 },
  { first: "Vincent", last: "Perrot", company: "Groupe Orsival Services", job: "Acheteur", domain: "orsival.example", phone: true, naf: "70.22Z", eff: "41", city: "Paris", zip: "75008", dept: "75", region: IDF, message: "Nous lançons une consultation pour un outil de maintenance, plusieurs fournisseurs seront comparés.", source: "email", ageH: 96, status: "contacted" },
  { first: "Inès", last: "Caron", company: "Usinage Précis Roanne", job: "Technicienne méthodes", domain: "precis-roanne.example", phone: true, naf: "25.62B", eff: "12", city: "Roanne", zip: "42300", dept: "42", region: ARA, message: "On voudrait tester un outil de GMAO, est-ce qu'il y a une version d'essai ?", source: "formulaire", ageH: 120 },
  { first: "Sébastien", last: "Moreau", company: "Brasserie du Vieux-Pont", job: "Cogérant", domain: "vieux-pont-brasserie.example", phone: true, naf: "11.05Z", eff: "11", city: "Strasbourg", zip: "67000", dept: "67", region: "Grand Est", message: "Je cherche un outil pour suivre l'entretien de nos cuves, budget autour de 3 000 euros.", source: "saisie", detail: "Salon professionnel", ageH: 200, status: "lost", outcome: { result: "lost", reason: "Budget inférieur à l'offre minimale" } },
  { first: "Delphine", last: "Aubert", company: "Textiles Marcellin", job: "Directrice administrative", domain: "marcellin-textiles.example", phone: true, naf: "13.20Z", eff: "21", city: "Villefranche-sur-Saône", zip: "69400", dept: "69", region: ARA, message: "Nous réfléchissons à moderniser notre suivi d'équipements. Contactez-moi quand vous avez un moment.", source: "formulaire", ageH: 150, status: "contacted" },
  { first: "Mathieu", last: "Brun", company: "Plasturgie Haut-Vivarais", job: "Responsable achats", domain: "haut-vivarais-plast.example", phone: true, naf: "22.22Z", eff: "12", city: "Annonay", zip: "07100", dept: "07", region: ARA, message: "Bonjour, nous évaluons des outils de maintenance pour l'an prochain. Pouvez-vous nous présenter votre solution ?", source: "email", ageH: 75 },
  // Mauvais profils
  { first: "Kévin", last: "Lopes", company: "Kévin Lopes", job: "Étudiant", domain: "gmail.com", email: "kevin.lopes.demo@gmail.com", phone: false, naf: "85.59A", eff: null, city: "Rennes", zip: "35000", dept: "35", region: "Bretagne", message: "Bonjour, je suis étudiant et je cherche un stage dans votre entreprise.", source: "formulaire", ageH: 3 },
  { first: "Patricia", last: "Noël", company: "Boulangerie Noël et Fils", job: "Gérante", domain: "gmail.com", email: "pat.noel.demo@gmail.com", phone: true, naf: "10.71C", eff: "02", city: "Lille", zip: "59000", dept: "59", region: "Hauts-de-France", message: "Pas de budget pour le moment, je voulais juste savoir si c'est gratuit.", source: "formulaire", ageH: 18 },
  { first: "Romain", last: "Texier", company: "Agence Pixelrame", job: "Fondateur", domain: "pixelrame.example", phone: false, naf: "73.11Z", eff: "01", city: "Bordeaux", zip: "33000", dept: "33", region: "Nouvelle-Aquitaine", message: "Je vous propose mes services de référencement et de backlinks pour améliorer votre visibilité.", source: "formulaire", ageH: 8 },
  { first: "Nathalie", last: "Girard", company: "Cabinet Girard Conseil", job: "Consultante", domain: "girard-conseil.example", phone: false, naf: "70.22Z", eff: "01", city: "Paris", zip: "75011", dept: "75", region: IDF, message: "Bonjour, curieuse de découvrir votre produit.", source: "csv", ageH: 300 },
  { first: "Damien", last: "Fabre", company: "Restaurant Chez Damien", job: "Propriétaire", domain: "outlook.com", email: "damien.fabre.demo@outlook.com", phone: true, naf: "56.10A", eff: "03", city: "Marseille", zip: "13006", dept: "13", region: "Provence-Alpes-Côte d'Azur", message: "Avez-vous une solution pour gérer mon restaurant ?", source: "formulaire", ageH: 28 },
  { first: "Lucie", last: "Maréchal", company: "Mairie de Valmont (fictive)", job: "Assistante", domain: "valmont-mairie.example", phone: true, naf: "84.11Z", eff: "22", city: "Dijon", zip: "21000", dept: "21", region: "Bourgogne-Franche-Comté", message: "Informations sur vos tarifs, merci.", source: "csv", ageH: 400 },
  { first: "Yann", last: "Kerbrat", company: "Chantiers Navals Kerbrat", job: "Chef d'atelier", domain: "kerbrat-navals.example", phone: true, naf: "30.11Z", eff: "22", city: "Lorient", zip: "56100", dept: "56", region: "Bretagne", message: "Nous cherchons un outil de maintenance, mais nous sommes en Bretagne, intervenez-vous ?", source: "webhook", ageH: 36 },
  { first: "Marion", last: "Pasquier", company: "Start-up Lumenia", job: "Stagiaire marketing", domain: "lumenia.example", phone: false, naf: "62.01Z", eff: "02", city: "Paris", zip: "75002", dept: "75", region: IDF, message: "Je fais un mémoire sur les outils de maintenance et je voudrais vous interviewer.", source: "email", ageH: 90 },
  { first: "Gérard", last: "Lambert", company: "Lambert Négoce", job: null, domain: "lambert-negoce.example", phone: false, naf: "46.19B", eff: null, city: "Orléans", zip: "45000", dept: "45", region: "Centre-Val de Loire", message: "", source: "csv", ageH: 500 },
  { first: "Stéphanie", last: "Joly", company: "Salon Joly Coiffure", job: "Gérante", domain: "yahoo.fr", email: "steph.joly.demo@yahoo.fr", phone: true, naf: "96.02A", eff: "01", city: "Tours", zip: "37000", dept: "37", region: "Centre-Val de Loire", message: "Bonjour, vous faites des devis pour des salons de coiffure ?", source: "formulaire", ageH: 55, status: "lost", outcome: { result: "lost", reason: "Hors cible (coiffure)" } },
];

export const DEMO_ORG: Organization = {
  id: DEMO_ORG_ID,
  name: "Maintia (démo)",
  slug: "demo-maintia",
  onboardedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
};

export const DEMO_ICP: IcpConfig = {
  orgId: DEMO_ORG_ID,
  offer: "Logiciel de gestion de maintenance (GMAO) pour PME industrielles et logistiques : ordres de travail, maintenance préventive, suivi des pannes.",
  idealCustomer: "PME industrielle ou logistique de 20 à 250 salariés, plusieurs sites ou équipements critiques, maintenance encore gérée sur tableur.",
  sectors: ["Industrie", "Fabrication", "Logistique", "Transports", "Agroalimentaire"],
  sizeMin: 20,
  sizeMax: 250,
  zones: ["Auvergne-Rhône-Alpes", "Occitanie", "Île-de-France"],
  decisionRoles: ["Directeur", "Directrice", "Responsable maintenance", "Responsable de site", "Gérant", "DG"],
  criteria: DEFAULT_CRITERIA.map((c) => ({ ...c })),
  personas: [
    {
      name: "Responsable maintenance", role: "Responsable maintenance",
      challenges: "Sortir du tableur, réduire les pannes et suivre les interventions des techniciens.",
      objections: ["Nous avons déjà un outil en place", "Mes équipes n'auront pas le temps de se former"],
    },
    {
      name: "Directeur des opérations", role: "Directeur des opérations",
      challenges: "Coût des arrêts de production, retour sur investissement et budget à justifier auprès de la direction.",
      objections: ["Quel est le retour sur investissement ?", "Je dois en parler à la direction financière"],
    },
    {
      name: "Dirigeant de PME", role: "Gérant, directeur général",
      challenges: "Structurer la maintenance sans recruter, avec un budget maîtrisé et un déploiement rapide.",
      objections: ["C'est trop cher pour notre taille", "Nous n'avons pas le temps pour un projet"],
    },
  ],
};

export interface DemoStoreData {
  org: Organization;
  icp: IcpConfig;
  objections: ObjectionItem[];
  leads: Lead[];
  scores: LeadScore[];
  analyses: LeadAnalysis[];
  activities: Activity[];
  outcomes: Outcome[];
  scoreByLead: Map<string, number>;
  verdictByLead: Map<string, "call_now" | "nurture" | "disqualify">;
  webhook: { hash: string | null; prefix: string | null; createdAt: string | null };
  members: Member[];
  settings: OrgSettings;
  /** Curseur du tour de rôle (dernier commercial servi). */
  rrCursor: string | null;
  /** S3 : créés à la demande par le repository démo. */
  inboundKey?: { hash: string | null; prefix: string | null; createdAt: string | null };
  integrations?: Record<string, IntegrationInfo>;
  syncLogs?: SyncLogEntry[];
  crmLinks?: CrmLink[];
  scoreVersions?: ScoreConfigVersion[];
  notifications?: AppNotification[];
}

/** Jeu complet : leads actuels, équipe, attribution et historique de 90 jours. */
export function buildDemoData(): DemoStoreData {
  return applyTeamLayer(buildDemoBase(), "maintia");
}

/** Leads actuels seulement (sans équipe ni historique). */
export function buildDemoBase(): DemoStoreData {
  const now = new Date();
  const objections: ObjectionItem[] = DEFAULT_OBJECTIONS.map((o, i) => ({ ...o, id: `demo-obj-${i + 1}`, orgId: DEMO_ORG_ID }));
  const data: DemoStoreData = {
    org: { ...DEMO_ORG },
    icp: structuredClone(DEMO_ICP),
    objections,
    leads: [], scores: [], analyses: [], activities: [], outcomes: [],
    scoreByLead: new Map(), verdictByLead: new Map(),
    webhook: { hash: null, prefix: null, createdAt: null },
    members: [], settings: DEFAULT_ORG_SETTINGS(DEMO_ORG_ID), rrCursor: null,
  };

  SEEDS.forEach((s, i) => {
    const id = `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
    const createdAt = new Date(now.getTime() - s.ageH * 3_600_000).toISOString();
    const email = s.email ?? `${s.first}.${s.last}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z.]/g, "") + `@${s.domain}`;
    const free = ["gmail.com", "outlook.com", "yahoo.fr"].includes(s.domain);
    const enrichment: Enrichment = {
      status: "ok",
      fetchedAt: createdAt,
      company: {
        siren: `999${String(i + 1).padStart(6, "0")}`,
        legalName: s.company.toUpperCase(),
        nafCode: s.naf,
        sectorLabel: nafLabel(s.naf),
        employees: s.eff ? EFFECTIFS[s.eff] ?? null : null,
        creationDate: `${2001 + (i % 20)}-0${(i % 9) + 1}-15`,
        city: s.city, postalCode: s.zip, department: s.dept, region: s.region, categorie: "PME",
      },
      website: s.site ? { url: `https://${s.domain}`, title: s.site[0], description: s.site[1] } : undefined,
      notes: ["Données d'enrichissement fictives (démonstration)."],
    };
    const lead: Lead = {
      id, orgId: DEMO_ORG_ID, firstName: s.first, lastName: s.last, email,
      phone: s.phone ? "06 00 00 00 " + String(10 + i) : null,
      company: s.company, jobTitle: s.job, website: free ? null : `https://${s.domain}`, location: `${s.city} (${s.dept})`,
      message: s.message, source: s.source, sourceDetail: s.detail ?? null,
      status: s.status ?? "new", ownerId: null, assignedAt: null,
      firstContactedAt: s.status && s.status !== "new" ? new Date(new Date(createdAt).getTime() + 3_600_000).toISOString() : null,
      enrichment, isDemo: true, createdAt, updatedAt: createdAt,
    };
    data.leads.push(lead);

    const result = scoreLead(lead, data.icp, now);
    const score: LeadScore = { id: `demo-score-${i + 1}`, leadId: id, orgId: DEMO_ORG_ID, total: result.total, details: result.details, breakdown: result.breakdown, createdAt: now.toISOString() };
    data.scores.push(score);
    data.scoreByLead.set(id, result.total);
    data.verdictByLead.set(id, verdictFromScore(result.total, result.details));

    const content = rulesAnalysis({ lead, score, icp: data.icp, objections });
    data.verdictByLead.set(id, content.verdict.decision);
    data.analyses.push({ id: `demo-ana-${i + 1}`, leadId: id, orgId: DEMO_ORG_ID, version: 1, origin: "rules", model: null, content, createdAt: now.toISOString() });

    if (s.outcome) {
      data.outcomes.push({ id: `demo-out-${i + 1}`, leadId: id, orgId: DEMO_ORG_ID, result: s.outcome.result, reason: s.outcome.reason, reasonCode: null, createdAt: now.toISOString() });
    }
    if (s.status && s.status !== "new") {
      data.activities.push({
        id: `demo-act-${i + 1}`, leadId: id, orgId: DEMO_ORG_ID, type: "call",
        content: "Premier appel passé (activité de démonstration).", authorId: DEMO_USER_ID, /* remplacé par le commercial du lead (couche équipe) */
        createdAt: new Date(new Date(createdAt).getTime() + 3_600_000).toISOString(),
      });
    }
  });
  return data;
}
