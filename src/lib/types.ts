// Types du domaine Priora. Partages entre moteur de score, IA, repositories et UI.

export type Role = "admin" | "manager" | "commercial";
export type LeadSourceType = "formulaire" | "webhook" | "csv" | "saisie" | "email" | "crm";
export type LeadStatus = "new" | "contacted" | "qualified" | "won" | "lost";
export type Verdict = "call_now" | "nurture" | "disqualify";
export type CriterionCategory = "fit" | "intent" | "timing" | "risk";
export type CriterionKey =
  | "sector"
  | "size"
  | "zone"
  | "decision_role"
  | "message_intent"
  | "budget_signal"
  | "source_quality"
  | "contactability"
  | "urgency"
  | "freshness"
  // Critères du moteur assurance (voir src/lib/scoring/insurance.ts)
  | "trade_covered"
  | "company_age"
  | "product_request"
  | "quote_progress"
  | "callback_request"
  | "attestation_need"
  | "contract_expiry"
  | "company_creation"
  | "past_claims"
  | "target_activity"
  | "comparing";

export const LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "won", "lost"];
export const SOURCE_TYPES: LeadSourceType[] = ["formulaire", "webhook", "csv", "saisie", "email", "crm"];

export interface Organization {
  id: string;
  name: string;
  slug: string;
  onboardedAt: string | null;
  createdAt: string;
}

export interface Member {
  userId: string;
  orgId: string;
  role: Role;
  /** Nom affiché. Repli sur la partie locale de l'email. */
  name: string;
  email: string;
  /** Un membre désactivé perd tout accès mais garde son historique. */
  active: boolean;
  /** "invited" : invitation envoyée (ou simulée en démo), pas encore de première connexion connue. */
  status: "active" | "invited";
  createdAt: string;
}

export const ROLES: Role[] = ["admin", "manager", "commercial"];
export const ROLE_LABEL: Record<Role, string> = { admin: "Administrateur", manager: "Manager", commercial: "Commercial" };

/** Règle d'attribution par segment : la première règle qui correspond l'emporte. */
export interface AssignmentRule {
  id: string;
  label: string;
  /** Au moins un critère est requis. Tous les critères renseignés doivent correspondre. */
  sources: LeadSourceType[];
  /** Mots-clés cherchés dans le message, le détail de source et le secteur (produit ou secteur). */
  keywords: string[];
  minScore: number | null;
  assigneeId: string;
}

export type AssignmentMode = "off" | "round_robin" | "segments";

export interface OrgSettings {
  orgId: string;
  assignment: { mode: AssignmentMode; rules: AssignmentRule[] };
  /** Si vrai, les commerciaux peuvent consulter la file commune (lecture seule hors de leurs leads). */
  commercialsSeeAll: boolean;
  /** Délai cible du premier contact, en minutes, selon le verdict. */
  speedTargets: { callNowMinutes: number; nurtureMinutes: number };
}

export const DEFAULT_ORG_SETTINGS = (orgId: string): OrgSettings => ({
  orgId,
  assignment: { mode: "round_robin", rules: [] },
  commercialsSeeAll: false,
  speedTargets: { callNowMinutes: 5, nurtureMinutes: 120 },
});

export interface Criterion {
  key: CriterionKey;
  label: string;
  category: CriterionCategory;
  /** Poids relatif. Le score final est normalise sur 100. */
  weight: number;
  enabled: boolean;
  description: string;
}

/** Persona de la cible idéale. Servent à rattacher chaque lead au profil le plus proche. */
export interface Persona {
  name: string;
  role: string;
  challenges: string;
  /** Objections typiques de ce profil. */
  objections: string[];
}

/**
 * Script d'appel configurable par organisation (repli par règles, sans IA).
 * Variables du script : {interlocuteur}, {conseiller}, {demande}, {produit}, {quand}, {amene}.
 */
export interface Playbook {
  agentName: string;
  openingScript: string;
  discoveryQuestions: string[];
  /** Associe une catégorie d'objection de la bibliothèque aux mots qui la rendent probable. */
  objectionTriggers: { category: string; keywords: string[] }[];
  /** Catégories ajoutées quand les déclencheurs ne suffisent pas (objections courantes sur un lead entrant). */
  defaultObjectionCategories?: string[];
}

export interface IcpConfig {
  orgId: string;
  offer: string;
  idealCustomer: string;
  sectors: string[];
  sizeMin: number | null; // effectif salarie
  sizeMax: number | null;
  zones: string[];
  decisionRoles: string[];
  criteria: Criterion[];
  personas: Persona[];
  /** Facultatif. Non persisté côté Supabase pour l'instant (mode démo uniquement). */
  playbook?: Playbook;
}

export interface ObjectionItem {
  id: string;
  orgId: string;
  objection: string;
  response: string;
  category: string;
}

export interface EmployeesRange {
  min: number;
  max: number;
  label: string;
}

export interface WebsiteInfo {
  url: string;
  title: string | null;
  description: string | null;
}

export interface Enrichment {
  status: "ok" | "partial" | "unavailable" | "skipped";
  fetchedAt: string;
  company?: {
    siren: string;
    legalName: string;
    nafCode: string | null;
    sectorLabel: string | null;
    employees: EmployeesRange | null;
    creationDate: string | null;
    city: string | null;
    postalCode: string | null;
    department: string | null;
    region: string | null;
    categorie: string | null;
  };
  website?: WebsiteInfo;
  /** Messages lisibles pour l'utilisateur (erreurs, timeouts, absence de resultat). */
  notes: string[];
}

export interface Lead {
  id: string;
  orgId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  company: string;
  jobTitle: string | null;
  website: string | null;
  location: string | null;
  message: string;
  source: LeadSourceType;
  sourceDetail: string | null;
  status: LeadStatus;
  /** Commercial responsable (S2). Null : non attribué. */
  ownerId: string | null;
  assignedAt: string | null;
  /** Premier appel ou email enregistré, ou passage à un statut autre que Nouveau (S2, speed-to-lead). */
  firstContactedAt: string | null;
  enrichment: Enrichment | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export type NewLead = Omit<
  Lead,
  "id" | "status" | "ownerId" | "assignedAt" | "firstContactedAt" | "createdAt" | "updatedAt" | "enrichment" | "isDemo"
> & { enrichment?: Enrichment | null; isDemo?: boolean; createdAt?: string };

export interface ScoreDetail {
  key: CriterionKey;
  label: string;
  category: CriterionCategory;
  points: number;
  max: number;
  reason: string;
}

export interface LeadScore {
  id: string;
  leadId: string;
  orgId: string;
  total: number;
  details: ScoreDetail[];
  breakdown: Record<CriterionCategory, { points: number; max: number }>;
  createdAt: string;
}

export interface Analysis {
  summary: string;
  probableNeed: string;
  verdict: { decision: Verdict; reason: string };
  objections: { objection: string; response: string; fromLibrary: boolean }[];
  risks: { type: "budget" | "decision_maker" | "competitor" | "timing"; level: "low" | "medium" | "high"; detail: string }[];
  discoveryQuestions: string[];
  openingScript: string;
  /** Persona de l'ICP le plus proche (absent des analyses antérieures à S2 ou sans persona défini). */
  persona?: { name: string; reason: string } | null;
}

export interface LeadAnalysis {
  id: string;
  leadId: string;
  orgId: string;
  version: number;
  origin: "ai" | "rules";
  model: string | null;
  content: Analysis;
  createdAt: string;
}

/** "inbound" : email reçu du prospect (S3). Ne compte pas comme premier contact (contrairement à "email", envoyé par l'équipe). */
export type ActivityType = "call" | "email" | "note" | "assignment" | "inbound";

export interface Activity {
  id: string;
  leadId: string;
  orgId: string;
  type: ActivityType;
  content: string;
  authorId: string | null;
  createdAt: string;
}

/** Motifs structurés (facultatifs) : alimentent la page Calibration. Le texte libre `reason` reste possible. */
export const WIN_REASONS = ["Réactivité", "Prix", "Offre adaptée", "Recommandation", "Relation existante", "Autre"] as const;
export const LOSS_REASONS = ["Prix", "Concurrent", "Timing", "Injoignable", "Hors cible", "Pas de budget", "Autre"] as const;

export interface Outcome {
  id: string;
  leadId: string;
  orgId: string;
  result: "won" | "lost";
  reason: string;
  /** Motif choisi dans une liste (WIN_REASONS ou LOSS_REASONS), facultatif pour un gain. */
  reasonCode: string | null;
  createdAt: string;
}

export interface LeadWithScore extends Lead {
  scoreTotal: number | null;
  verdict: Verdict | null;
}

export interface LeadDetail {
  lead: Lead;
  score: LeadScore | null;
  analysis: LeadAnalysis | null;
  activities: Activity[];
  outcome: Outcome | null;
}

export interface WebhookKeyInfo {
  prefix: string | null;
  createdAt: string | null;
}

export interface SourceInfo {
  type: LeadSourceType;
  label: string;
  enabled: boolean;
  leadCount: number;
}

/* ---------- S3 : intégrations, calibration, notifications ---------- */

export type IntegrationProvider = "hubspot";

export interface IntegrationInfo {
  provider: IntegrationProvider;
  status: "connected" | "error" | "disconnected";
  /** Quatre derniers caractères du jeton (jamais le jeton). */
  tokenHint: string | null;
  /** Connexion simulée (mode démo) : aucun appel réel vers le fournisseur. */
  simulated: boolean;
  /** Envoi automatique à la qualification et au gain. */
  autoPush: boolean;
  connectedAt: string | null;
  lastSyncAt: string | null;
}

export interface SyncLogEntry {
  id: string;
  orgId: string;
  provider: IntegrationProvider;
  direction: "push" | "pull";
  status: "success" | "error";
  message: string;
  leadId: string | null;
  createdAt: string;
}

export interface CrmLink {
  leadId: string;
  provider: IntegrationProvider;
  contactId: string | null;
  dealId: string | null;
  updatedAt: string;
}

export interface InboundKeyInfo {
  prefix: string | null;
  createdAt: string | null;
}

export interface ScoreConfigVersion {
  id: string;
  orgId: string;
  version: number;
  /** Critères complets (poids, activation) à cette version. */
  criteria: Criterion[];
  source: "initial" | "manual" | "suggestion" | "restore";
  note: string;
  createdBy: string | null;
  createdAt: string;
}

export type NotificationKind = "lead_assigned" | "lead_overdue" | "overdue_digest" | "sync_failed" | "lead_message";

export interface AppNotification {
  id: string;
  orgId: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  leadId: string | null;
  /** Évite les doublons (une seule notification par événement). */
  dedupeKey: string;
  readAt: string | null;
  createdAt: string;
}

/** Lead clos avec le détail du score au moment du calcul, pour la calibration. */
export interface ClosedLeadSample {
  leadId: string;
  result: "won" | "lost";
  createdAt: string;
  scoreTotal: number;
  verdict: Verdict | null;
  details: Pick<ScoreDetail, "key" | "points" | "max">[];
}
