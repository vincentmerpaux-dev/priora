import { rulesAnalysis } from "@/lib/ai/fallback";
import { EFFECTIFS, nafLabel } from "@/lib/enrichment/naf";
import { scoreLead } from "@/lib/scoring/engine";
import { INSURANCE_CRITERIA, INSURANCE_TRADES } from "@/lib/scoring/insurance";
import { DEFAULT_ORG_SETTINGS } from "@/lib/types";
import type {
  Enrichment, IcpConfig, Lead, LeadAnalysis, LeadScore, LeadSourceType, LeadStatus, ObjectionItem, Organization, Playbook,
} from "@/lib/types";
import { DEMO_USER_ID, type DemoStoreData } from "./data";
import { applyTeamLayer } from "./team";

/**
 * CAS D'ETUDE "ORUS" : organisation de démonstration préparée par Vincent Merpaux pour sa candidature.
 * Ce n'est PAS un outil officiel d'Orus. Les offres, prix "à partir de" et arguments viennent d'informations
 * publiques (orus.eu, consulté le 24/11/2026) ; les critères, objections et scripts sont des HYPOTHESES.
 * Tous les leads, noms, entreprises, SIREN (999...), téléphones et domaines (.example) sont FICTIFS.
 */

export const ORUS_ORG_ID = "00000000-0000-4000-8000-000000000002";

export const ORUS_BANNER =
  "Cas d'étude préparé par Vincent Merpaux pour sa candidature chez Orus, à partir d'informations publiques. Leads et chiffres fictifs. Hypothèses, pas le process interne d'Orus.";

export const ORUS_ORG: Organization = {
  id: ORUS_ORG_ID,
  name: "Cas Orus (démo)",
  slug: "cas-orus",
  onboardedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
};

export const ORUS_PLAYBOOK: Playbook = {
  agentName: "Vincent",
  openingScript:
    "Bonjour {interlocuteur}, {conseiller}, de chez Orus, l'assurance pour les professionnels. Je vois que vous avez {demande}. " +
    "Est-ce que vous avez deux minutes pour qu'on en discute ? Pour commencer, qu'est-ce qui vous a {amene} à faire cette demande ?",
  discoveryQuestions: [
    "Quelle est votre activité exacte ?",
    "Travaillez-vous seul(e) ou avez-vous des salariés ?",
    "Quel est votre chiffre d'affaires approximatif ?",
    "Quel est votre assureur actuel, et à quelle date tombe l'échéance du contrat ?",
    "Avez-vous déclaré des sinistres ces dernières années ?",
    "Qu'est-ce qui a déclenché votre demande aujourd'hui ?",
    "Qu'est-ce qui compte le plus pour vous : le prix, les garanties ou la rapidité ?",
    "Une autre personne participe-t-elle à la décision (associé, comptable) ?",
  ],
  defaultObjectionCategories: ["Juste un prix", "Confiance"],
  objectionTriggers: [
    { category: "Comparaison", keywords: ["compar", "plusieurs devis", "autres devis", "3 devis", "autre courtier", "meilleure offre"] },
    { category: "Prix", keywords: ["cher", "augmente", "hausse", "moins cher", "budget", "interrompu", "abandonn"] },
    { category: "Juste un prix", keywords: ["juste un prix", "tarif", "combien", "prix"] },
    { category: "Résiliation", keywords: ["resili", "echeance", "contrat actuel", "renouvel", "expire", "se termine"] },
    { category: "Rappel", keywords: ["je rappellerai", "je vous rappellerai", "rien d'urgent", "pas de date", "je regarde", "en parler", "plus tard", "le soir", "quand j'aurai"] },
    { category: "Confiance", keywords: ["connais pas", "fiable", "confiance", "assurance en ligne", "jamais entendu"] },
    { category: "Obligation", keywords: ["obligatoire", "obligation", "oblige", "faut-il", "dois-je"] },
  ],
};

const OBJECTIONS: Omit<ObjectionItem, "id" | "orgId">[] = [
  {
    category: "Comparaison",
    objection: "Je compare plusieurs devis.",
    response:
      "Acquiescer : « Vous avez raison, c'est un contrat important. »\nQuestionner : « Qu'est-ce que vous comparez surtout : le prix, les garanties, le service ? »\nRebondir : faire une recommandation chiffrée sur ce critère, puis fixer un rappel à une heure précise (« Je vous rappelle jeudi à 14 h, ça vous convient ? »).",
  },
  {
    category: "Prix",
    objection: "C'est plus cher que prévu.",
    response:
      "Acquiescer : « Je comprends, personne n'aime payer plus que prévu. »\nQuestionner : « Plus cher que quoi, et à garanties équivalentes ? »\nRebondir : retirer les options inutiles (le contrat est modulable). Ne jamais promettre de remise.",
  },
  {
    category: "Juste un prix",
    objection: "Je voulais juste un prix.",
    response:
      "Acquiescer : « Bien sûr, c'est la première chose à savoir. »\nQuestionner : « Pour vous donner le bon prix, quelle est votre activité exacte ? »\nRebondir : donner le prix « à partir de » avec ce qu'il couvre ({prix}), puis « Si ça vous convient, on le valide en 5 minutes. »",
  },
  {
    category: "Résiliation",
    objection: "Je dois résilier l'ancien contrat.",
    response:
      "Acquiescer : « C'est normal, c'est même une bonne raison de s'y prendre à l'avance. »\nQuestionner : « Quand tombe l'échéance ? »\nRebondir : Orus peut gérer la résiliation de l'ancien contrat (RC Pro, multirisque, mutuelle) ; caler la date de début du nouveau contrat pour éviter tout trou de garantie.",
  },
  {
    category: "Rappel",
    objection: "Je rappellerai.",
    response:
      "Acquiescer : « Pas de souci, ça se réfléchit. »\nQuestionner : « Qu'est-ce qui vous manque pour décider aujourd'hui ? »\nRebondir : proposer un rendez-vous précis (jour et heure) plutôt que de laisser le prospect revenir.",
  },
  {
    category: "Confiance",
    objection: "Je ne connais pas Orus, l'assurance en ligne ne m'inspire pas confiance.",
    response:
      "Acquiescer : « C'est une bonne réaction, on confie un contrat important. »\nQuestionner : « Qu'est-ce qui vous rassurerait le plus ? »\nRebondir : contrats portés par Hiscox, AIG et Munich Re ; conseiller humain joignable du lundi au vendredi, de 9 h à 18 h ; 4,9/5 sur Trustpilot (plus de 80 000 assurés).",
  },
  {
    category: "Obligation",
    objection: "Est-ce que c'est obligatoire ?",
    response:
      "Acquiescer : « Bonne question, personne ne veut payer pour rien. »\nQuestionner : « Ça dépend du métier, je vérifie pour votre cas précis : quelle est votre activité exacte ? »\nRebondir : ne jamais affirmer une obligation légale de mémoire ; vérifier, puis expliquer ce que la garantie couvre.",
  },
];

export const ORUS_ICP: IcpConfig = {
  orgId: ORUS_ORG_ID,
  offer:
    "Courtage en assurance professionnelle en ligne pour indépendants et TPE. Contrats portés par Hiscox, AIG et Munich Re. Devis en 3 minutes, sans frais de dossier, conseiller humain du lundi au vendredi, 9 h à 18 h. " +
    "RC Pro à partir de 13 €/mois, multirisque à partir de 25 €/mois, décennale à partir de 69 €/mois (attestation sous 24 h, jusqu'à -20 % pour une entreprise de moins de 6 mois), " +
    "mutuelle TNS à partir de 30 €/mois, prévoyance TNS à partir de 25 €/mois, auto pro à partir de 35 €/mois. Informations publiques consultées le 24/11/2026, susceptibles d'évoluer.",
  idealCustomer:
    "Indépendants, freelances, artisans du BTP, commerçants et TPE de 0 à 10 salariés, France entière. Le décideur est le dirigeant lui-même, parfois avec un associé ou un comptable.",
  sectors: INSURANCE_TRADES,
  sizeMin: 0,
  sizeMax: 10,
  zones: ["France"],
  decisionRoles: ["Gérant", "Gérante", "Dirigeant", "Dirigeante", "Président", "Fondateur", "Artisan", "Indépendant"],
  criteria: INSURANCE_CRITERIA.map((c) => ({ ...c })),
  personas: [
    {
      name: "Dirigeant seul", role: "Indépendant, freelance, artisan sans salarié",
      challenges: "Décide seul, veut un prix clair, une attestation rapide et peu de paperasse.",
      objections: ["Je voulais juste un prix", "Je compare plusieurs devis", "Je rappellerai"],
    },
    {
      name: "Dirigeant et associé ou comptable", role: "Gérant de TPE, cogérant",
      challenges: "Le contrat est validé par un associé ou le comptable : besoin d'un document clair pour leur transmettre.",
      objections: ["Je dois en parler à mon associé", "Mon comptable me conseille un autre assureur"],
    },
    {
      name: "Créateur d'entreprise", role: "Futur gérant, entreprise en création",
      challenges: "Besoin d'une attestation avant l'immatriculation ou le premier chantier, peu de visibilité sur le budget.",
      objections: ["Je ne sais pas encore quelles garanties il me faut", "Est-ce que c'est obligatoire ?"],
    },
  ],
  playbook: ORUS_PLAYBOOK,
};

interface Seed {
  first: string; last: string; company: string; job: string; domain: string; phone: boolean;
  naf: string | null; eff: keyof typeof EFFECTIFS | null; city: string; zip: string; dept: string; region: string;
  /** Ancienneté de l'entreprise en mois (alimente la date de création fictive). */
  months: number;
  message: string; source: LeadSourceType; detail: string; ageH: number; status?: LeadStatus;
  noEnrichment?: boolean;
  outcome?: { result: "won" | "lost"; reason: string };
}

const ARA = "Auvergne-Rhône-Alpes";
const NAQ = "Nouvelle-Aquitaine";
const OCC = "Occitanie";
const PACA = "Provence-Alpes-Côte d'Azur";
const HDF = "Hauts-de-France";
const GE = "Grand Est";
const PDL = "Pays de la Loire";
const BRE = "Bretagne";
const CVL = "Centre-Val de Loire";

const SEEDS: Seed[] = [
  // Appeler maintenant
  { first: "Mathieu", last: "Roussel", company: "Roussel Plâtrerie Sèche", job: "Gérant, plaquiste", domain: "roussel-platrerie.example", phone: true, naf: "43.31Z", eff: "00", city: "Lille", zip: "59000", dept: "59", region: HDF, months: 30,
    message: "Bonjour, je suis plaquiste à mon compte. J'ai un chantier qui démarre lundi et le maître d'ouvrage me demande mon attestation décennale avant que j'entre sur site. Je dois souscrire au plus vite, pouvez-vous me rappeler ce matin ?", source: "formulaire", detail: "Demande de devis décennale", ageH: 0.5 },
  { first: "Inès", last: "Marchand", company: "Inès Marchand Conseil", job: "Consultante indépendante", domain: "marchand-conseil.example", phone: false, naf: "70.22Z", eff: "00", city: "Nantes", zip: "44000", dept: "44", region: PDL, months: 14,
    message: "Devis RC Pro commencé puis interrompu à l'étape du choix des garanties. Je suis consultante freelance en organisation, mon client me demande une attestation d'assurance avant le début de la mission le mois prochain.", source: "webhook", detail: "Devis abandonné", ageH: 5 },
  { first: "Laurent", last: "Gauthier", company: "Brasserie Le Quai 9", job: "Restaurateur", domain: "quai9-brasserie.example", phone: true, naf: "56.10A", eff: "01", city: "Rennes", zip: "35000", dept: "35", region: BRE, months: 96,
    message: "Mon contrat multirisque actuel arrive à échéance le mois prochain et mon assureur augmente le prix de 18 %. Je voudrais un devis multirisque pour mon restaurant de 40 couverts. Aucun sinistre depuis l'ouverture. Merci de m'appeler en fin de journée.", source: "formulaire", detail: "Demande de devis multirisque", ageH: 3 },
  { first: "Samira", last: "Haddad", company: "Samira Haddad VTC", job: "Chauffeuse VTC", domain: "haddad-vtc.example", phone: true, naf: "49.32Z", eff: "00", city: "Marseille", zip: "13001", dept: "13", region: PACA, months: 3,
    message: "Je viens de créer mon activité de VTC en micro-entreprise et j'ai besoin d'une RC Pro. La plateforme me demande une attestation d'assurance avant de m'activer, je voudrais l'avoir cette semaine.", source: "formulaire", detail: "Demande de devis RC Pro", ageH: 1.5 },
  { first: "Yannick", last: "Morel", company: "Morel Dev", job: "Développeur freelance", domain: "morel-dev.example", phone: true, naf: "62.02A", eff: "00", city: "Lyon", zip: "69002", dept: "69", region: ARA, months: 40,
    message: "Développeur freelance, je renouvelle ma RC Pro : l'échéance est fin du mois chez mon assureur actuel. Aucun sinistre. Je voudrais un devis et savoir si vous gérez la résiliation. Vous pouvez m'appeler en journée.", source: "email", detail: "Email entrant", ageH: 20 },
  { first: "Bastien", last: "Perrin", company: "Perrin Maçonnerie", job: "Gérant, maçon", domain: "perrin-maconnerie.example", phone: true, naf: "43.99C", eff: "00", city: "Bordeaux", zip: "33000", dept: "33", region: NAQ, months: 2,
    message: "J'ai créé mon entreprise de maçonnerie il y a deux mois et il me faut une décennale. J'ai vu la remise pour les entreprises de moins de 6 mois. Mon premier chantier démarre dans 10 jours et le client veut l'attestation.", source: "formulaire", detail: "Demande de devis décennale", ageH: 8 },
  { first: "Chloé", last: "Besson", company: "Atelier Floral Besson", job: "Fleuriste, future gérante", domain: "atelier-besson.example", phone: true, naf: "47.76Z", eff: "00", city: "Dijon", zip: "21000", dept: "21", region: "Bourgogne-Franche-Comté", months: 1,
    message: "Je crée ma boutique de fleurs, immatriculation en cours, ouverture le 5 janvier. Il me faut une multirisque avant l'ouverture, avec la responsabilité civile. Pouvez-vous m'appeler cette semaine ?", source: "formulaire", detail: "Demande de devis multirisque", ageH: 2 },
  { first: "Sébastien", last: "Mercier", company: "Mercier Peinture", job: "Peintre en bâtiment", domain: "mercier-peinture.example", phone: true, naf: "43.34Z", eff: "01", city: "Clermont-Ferrand", zip: "63000", dept: "63", region: ARA, months: 24,
    message: "Chantier dans 10 jours, mon client demande une attestation décennale à jour. Mon contrat actuel est résilié depuis le mois dernier, aucun sinistre. Je voudrais un devis et l'attestation rapidement.", source: "formulaire", detail: "Demande de devis décennale", ageH: 26, status: "contacted" },
  { first: "Youssef", last: "Amrani", company: "Pizzeria Amrani", job: "Gérant, restaurateur", domain: "pizzeria-amrani.example", phone: true, naf: "56.10A", eff: "02", city: "Montpellier", zip: "34000", dept: "34", region: OCC, months: 60,
    message: "Devis multirisque commencé hier soir, je n'ai pas terminé. Mon contrat actuel arrive à échéance le 31 décembre et je dois le résilier. Pizzeria, deux salariés, aucun sinistre. Pouvez-vous m'appeler ?", source: "webhook", detail: "Devis abandonné", ageH: 9, status: "qualified" },
  { first: "Nathalie", last: "Brunet", company: "Brunet Optique", job: "Opticienne indépendante", domain: "brunet-optique.example", phone: true, naf: "47.78A", eff: "02", city: "Annecy", zip: "74000", dept: "74", region: ARA, months: 120,
    message: "J'ouvre un deuxième magasin d'optique en janvier, local signé. Je voudrais une multirisque pour ce nouveau point de vente et un devis dès que possible. Rappelez-moi en début de semaine.", source: "formulaire", detail: "Demande de devis multirisque", ageH: 6 },
  { first: "Adrien", last: "Henry", company: "Plomberie Henry", job: "Plombier", domain: "plomberie-henry.example", phone: true, naf: "43.22A", eff: "01", city: "Tours", zip: "37000", dept: "37", region: CVL, months: 48,
    message: "Plombier avec deux véhicules utilitaires, je cherche une assurance auto pro et une décennale. Mon contrat actuel expire dans deux semaines. Merci de me faire un devis et de me rappeler.", source: "formulaire", detail: "Demande de rappel", ageH: 4 },
  // Nourrir
  { first: "Sandrine", last: "Navarre", company: "Navarre & Duval Électricité", job: "Cogérante, électricienne", domain: "navarre-duval.example", phone: true, naf: "43.21A", eff: "02", city: "Toulouse", zip: "31000", dept: "31", region: OCC, months: 70,
    message: "Nous sommes 4 salariés et deux associés. Nous cherchons une décennale et une multirisque pour nos locaux. Mon associé doit valider, nous pouvons en parler jeudi. Nous avons eu un sinistre l'an dernier (dégât des eaux).", source: "formulaire", detail: "Demande de devis décennale", ageH: 30 },
  { first: "Léa", last: "Fournier", company: "Salon Léa Coiffure", job: "Gérante, coiffeuse", domain: "salon-lea.example", phone: true, naf: "96.02A", eff: "01", city: "Nancy", zip: "54000", dept: "54", region: GE, months: 60,
    message: "Je compare 3 devis pour la multirisque de mon salon. J'ai un contrat qui se termine dans 3 mois. Je voulais surtout savoir vos tarifs.", source: "webhook", detail: "Comparateur", ageH: 30 },
  { first: "Maxime", last: "Leroy", company: "Leroy Coaching", job: "Coach sportif", domain: "leroy-coaching.example", phone: false, naf: "93.13Z", eff: "00", city: "Nice", zip: "06000", dept: "06", region: PACA, months: 18,
    message: "Je voulais juste un prix pour une RC Pro de coach sportif. Je n'ai pas encore d'assurance, rien d'urgent.", source: "formulaire", detail: "Demande de tarif", ageH: 26 },
  { first: "Yoann", last: "Delcourt", company: "Boulangerie Delcourt", job: "Artisan boulanger", domain: "boulangerie-delcourt.example", phone: true, naf: "10.71C", eff: "02", city: "Amiens", zip: "80000", dept: "80", region: HDF, months: 150,
    message: "Ma mutuelle d'artisan arrive à échéance dans 2 mois, je voudrais un tarif pour une mutuelle TNS et une prévoyance. Pouvez-vous m'envoyer une proposition ?", source: "formulaire", detail: "Demande de tarif", ageH: 36 },
  { first: "Camille", last: "Rey", company: "Studio Rey", job: "Graphiste freelance", domain: "studio-rey.example", phone: false, naf: "74.10Z", eff: "00", city: "Strasbourg", zip: "67000", dept: "67", region: GE, months: 36,
    message: "Graphiste freelance, je m'intéresse à une prévoyance TNS pour être couverte en cas d'arrêt de travail. Je regarde ce qui existe, pas de date précise.", source: "email", detail: "Email entrant", ageH: 60 },
  { first: "Mehdi", last: "Boucher", company: "Boucher Images", job: "Photographe indépendant", domain: "boucher-images.example", phone: true, naf: "74.20Z", eff: "00", city: "Grenoble", zip: "38000", dept: "38", region: ARA, months: 52,
    message: "Photographe indépendant, je cherche une RC Pro. J'ai déjà un devis chez un autre courtier, je compare les garanties.", source: "formulaire", detail: "Demande de devis RC Pro", ageH: 48 },
  { first: "Karine", last: "Dufour", company: "Dufour Formation", job: "Formatrice indépendante", domain: "dufour-formation.example", phone: true, naf: "85.59A", eff: "00", city: "Poitiers", zip: "86000", dept: "86", region: NAQ, months: 28,
    message: "Je voulais une RC Pro mais je ne connais pas Orus, c'est fiable une assurance en ligne ? Je préfère en parler avec quelqu'un avant de donner mes informations. Appelez-moi plutôt le soir.", source: "saisie", detail: "Demande de rappel (téléphone)", ageH: 15 },
  { first: "Éric", last: "Marchetti", company: "Marchetti Chauffage", job: "Chauffagiste", domain: "marchetti-chauffage.example", phone: true, naf: "43.22B", eff: "02", city: "Metz", zip: "57000", dept: "57", region: GE, months: 84,
    message: "Demande de devis décennale. Chauffagiste, 3 salariés. Je veux la meilleure offre, je regarde 2 ou 3 assureurs.", source: "webhook", detail: "Comparateur", ageH: 22 },
  { first: "Frédéric", last: "Aubin", company: "Carrelages Aubin", job: "Carreleur", domain: "carrelages-aubin.example", phone: true, naf: "43.33Z", eff: "01", city: "Rouen", zip: "76000", dept: "76", region: "Normandie", months: 90,
    message: "J'ai eu trois sinistres en deux ans sur mes chantiers et mon assureur m'a résilié. Il me faut une décennale, un client me demande mon attestation mais je n'ai pas de date.", source: "formulaire", detail: "Demande de devis décennale", ageH: 30 },
  { first: "Sylvie", last: "Lemaire", company: "Lemaire (activité à préciser)", job: "Indépendante", domain: "lemaire-contact.example", phone: false, naf: null, eff: null, city: "Orléans", zip: "45000", dept: "45", region: CVL, months: 0, noEnrichment: true,
    message: "Bonjour, je voudrais des renseignements sur vos assurances pour mon activité.", source: "email", detail: "Email entrant", ageH: 90 },
  // Déjà traités (pipeline)
  { first: "Nolwenn", last: "Le Gall", company: "Électricité Le Gall", job: "Électricienne", domain: "legall-electricite.example", phone: true, naf: "43.21A", eff: "01", city: "Quimper", zip: "29000", dept: "29", region: BRE, months: 20,
    message: "Électricienne, je démarre un chantier de rénovation lundi, le client exige l'attestation décennale. Je voudrais un devis, pouvez-vous me rappeler ?", source: "formulaire", detail: "Demande de devis décennale", ageH: 110, status: "won", outcome: { result: "won", reason: "Décennale souscrite, attestation envoyée sous 24 h." } },
  { first: "Pascal", last: "Teissier", company: "Menuiserie Teissier", job: "Menuisier", domain: "menuiserie-teissier.example", phone: true, naf: "43.32A", eff: "01", city: "Limoges", zip: "87000", dept: "87", region: NAQ, months: 36,
    message: "Menuisier, mon contrat arrive à échéance en décembre, je voudrais un devis pour une décennale et une RC Pro. Aucun sinistre.", source: "email", detail: "Email entrant", ageH: 150, status: "won", outcome: { result: "won", reason: "Résiliation gérée par Orus, début de contrat calé sur l'échéance." } },
  { first: "Fabien", last: "Colas", company: "Colas Coiffure", job: "Coiffeur, gérant", domain: "colas-coiffure.example", phone: true, naf: "96.02A", eff: "01", city: "Caen", zip: "14000", dept: "14", region: "Normandie", months: 50,
    message: "Je compare plusieurs devis pour ma multirisque, c'est trop cher chez vous par rapport à mon assureur actuel.", source: "formulaire", detail: "Demande de devis multirisque", ageH: 130, status: "lost", outcome: { result: "lost", reason: "Reste chez son assureur actuel (écart de prix)." } },
  { first: "Alice", last: "Vasseur", company: "Vasseur Coaching", job: "Coach", domain: "vasseur-coaching.example", phone: true, naf: "85.59B", eff: "00", city: "Reims", zip: "51100", dept: "51", region: GE, months: 10,
    message: "Je voudrais un devis RC Pro pour mon activité de coaching, je vous rappellerai quand j'aurai le temps.", source: "formulaire", detail: "Demande de devis RC Pro", ageH: 170, status: "lost", outcome: { result: "lost", reason: "Injoignable après trois relances." } },
  // Disqualifier
  { first: "Patrick", last: "Bellanger", company: "Aérotech Industrie Sud", job: "Directeur des achats", domain: "aerotech-sud.example", phone: true, naf: "30.30Z", eff: "32", city: "Toulouse", zip: "31400", dept: "31", region: OCC, months: 200,
    message: "Dans le cadre d'un appel d'offres groupe, nous souhaitons un devis d'assurance flotte et responsabilité civile produits pour nos 4 sites et nos 300 salariés.", source: "email", detail: "Email entrant", ageH: 40 },
  { first: "Romain", last: "Vidal", company: "Provence Spectacles Pyro", job: "Gérant", domain: "provence-pyro.example", phone: true, naf: "20.51Z", eff: "01", city: "Avignon", zip: "84000", dept: "84", region: PACA, months: 20,
    message: "Nous organisons des feux d'artifice pour les communes. Je cherche une RC Pro pour mon activité de pyrotechnie, c'est urgent pour un spectacle en décembre.", source: "formulaire", detail: "Demande de devis RC Pro", ageH: 7 },
  { first: "Damien", last: "Roche", company: "Garage Roche Auto", job: "Garagiste", domain: "garage-roche.example", phone: true, naf: "45.20A", eff: "02", city: "Angers", zip: "49000", dept: "49", region: PDL, months: 100,
    message: "Je cherche une assurance responsabilité civile pour mon garage automobile (réparation et vente de véhicules). Devis possible ?", source: "formulaire", detail: "Demande de devis", ageH: 50 },
  { first: "Julie", last: "Carron", company: "Étudiante en master (mémoire)", job: "Étudiante", domain: "carron-etudes.example", phone: false, naf: "85.42Z", eff: "00", city: "Lille", zip: "59000", dept: "59", region: HDF, months: 0,
    message: "Je prépare un mémoire sur l'assurance en ligne des indépendants et je voudrais interviewer un conseiller Orus.", source: "email", detail: "Email entrant", ageH: 100 },
  { first: "Franck", last: "Delorme", company: "Delorme Courtage Leads", job: "Directeur commercial", domain: "delorme-leads.example", phone: true, naf: "66.22Z", eff: "01", city: "Paris", zip: "75008", dept: "75", region: "Île-de-France", months: 30,
    message: "Je vous propose un partenariat de génération de leads pour vos devis RC Pro, nous livrons 200 leads par mois.", source: "email", detail: "Email entrant", ageH: 70 },
];

const uid = (series: number, n: number) => `00000000-0000-4000-80${String(series).padStart(2, "0")}-${String(n).padStart(12, "0")}`;

/** Jeu complet : leads actuels, équipe, attribution et historique de 90 jours. */
export function buildOrusData(): DemoStoreData {
  return applyTeamLayer(buildOrusBase(), "orus");
}

/** Leads actuels seulement (sans équipe ni historique). */
export function buildOrusBase(): DemoStoreData {
  const now = new Date();
  const objections: ObjectionItem[] = OBJECTIONS.map((o, i) => ({ ...o, id: uid(9, i + 1), orgId: ORUS_ORG_ID }));
  const data: DemoStoreData = {
    org: { ...ORUS_ORG },
    icp: structuredClone(ORUS_ICP),
    objections,
    leads: [], scores: [], analyses: [], activities: [], outcomes: [],
    scoreByLead: new Map(), verdictByLead: new Map(),
    webhook: { hash: null, prefix: null, createdAt: null },
    members: [], settings: DEFAULT_ORG_SETTINGS(ORUS_ORG_ID), rrCursor: null,
  };

  SEEDS.forEach((s, i) => {
    const n = i + 1;
    const id = uid(1, n);
    const createdAt = new Date(now.getTime() - s.ageH * 3_600_000).toISOString();
    const email = `${s.first}.${s.last}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z.]/g, "") + `@${s.domain}`;
    const creation = new Date(now.getTime() - s.months * 30.4 * 86_400_000).toISOString().slice(0, 10);
    const enrichment: Enrichment = s.noEnrichment
      ? { status: "unavailable", fetchedAt: createdAt, notes: ["Entreprise non identifiable (démonstration)."] }
      : {
          status: "ok",
          fetchedAt: createdAt,
          company: {
            siren: `999${String(500 + n).padStart(6, "0")}`,
            legalName: s.company.toUpperCase(),
            nafCode: s.naf,
            sectorLabel: nafLabel(s.naf),
            employees: s.eff ? EFFECTIFS[s.eff] ?? null : null,
            creationDate: creation,
            city: s.city, postalCode: s.zip, department: s.dept, region: s.region, categorie: s.eff === "32" ? "ETI" : "TPE",
          },
          notes: ["Données d'enrichissement fictives (démonstration)."],
        };
    const contactedAt = new Date(new Date(createdAt).getTime() + 1_800_000).toISOString();
    const lead: Lead = {
      id, orgId: ORUS_ORG_ID, firstName: s.first, lastName: s.last, email,
      phone: s.phone ? `06 00 00 01 ${String(10 + n)}` : null,
      company: s.company, jobTitle: s.job, website: null, location: `${s.city} (${s.dept})`,
      message: s.message, source: s.source, sourceDetail: s.detail,
      status: s.status ?? "new", ownerId: null, assignedAt: null,
      firstContactedAt: s.status && s.status !== "new" ? contactedAt : null,
      enrichment, isDemo: true, createdAt, updatedAt: createdAt,
    };
    data.leads.push(lead);

    const result = scoreLead(lead, data.icp, now);
    const score: LeadScore = { id: uid(2, n), leadId: id, orgId: ORUS_ORG_ID, total: result.total, details: result.details, breakdown: result.breakdown, createdAt: now.toISOString() };
    data.scores.push(score);
    data.scoreByLead.set(id, result.total);

    const content = rulesAnalysis({ lead, score, icp: data.icp, objections });
    data.verdictByLead.set(id, content.verdict.decision);
    const analysis: LeadAnalysis = { id: uid(3, n), leadId: id, orgId: ORUS_ORG_ID, version: 1, origin: "rules", model: null, content, createdAt: now.toISOString() };
    data.analyses.push(analysis);

    if (s.outcome) {
      data.outcomes.push({ id: uid(4, n), leadId: id, orgId: ORUS_ORG_ID, result: s.outcome.result, reason: s.outcome.reason, reasonCode: null, createdAt: now.toISOString() });
    }
    if (s.status && s.status !== "new") {
      data.activities.push({
        id: uid(5, n), leadId: id, orgId: ORUS_ORG_ID, type: "call",
        content: "Premier appel passé (activité de démonstration).", authorId: DEMO_USER_ID, createdAt: contactedAt,
      });
    }
  });
  return data;
}
