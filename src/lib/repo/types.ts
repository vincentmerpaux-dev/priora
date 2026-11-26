import type {
  AppNotification,
  ClosedLeadSample,
  CrmLink,
  InboundKeyInfo,
  IntegrationInfo,
  IntegrationProvider,
  NotificationKind,
  ScoreConfigVersion,
  SyncLogEntry,
  Criterion,
  Activity,
  ActivityType,
  Analysis,
  Enrichment,
  IcpConfig,
  Lead,
  LeadAnalysis,
  LeadDetail,
  LeadScore,
  LeadStatus,
  LeadWithScore,
  Member,
  NewLead,
  ObjectionItem,
  Organization,
  OrgSettings,
  Outcome,
  Role,
  SourceInfo,
  WebhookKeyInfo,
} from "@/lib/types";
import type { ScoreResult } from "@/lib/scoring/engine";

/**
 * Couche d'accès aux données. Deux implémentations :
 * - Supabase (Postgres + RLS) quand les variables d'environnement sont présentes ;
 * - démo en mémoire sinon.
 * Toutes les méthodes sont scopées par organisation.
 */
export interface Repository {
  readonly mode: "demo" | "supabase";
  /** Démo publique : identifiant du bac à sable du visiteur (isole aussi les états annexes, comme le faux HubSpot). */
  readonly scope?: string;

  getOrganization(orgId: string): Promise<Organization | null>;
  updateOrganization(orgId: string, patch: { name?: string; onboardedAt?: string | null }): Promise<void>;

  getIcp(orgId: string): Promise<IcpConfig>;
  saveIcp(icp: IcpConfig): Promise<void>;

  listObjections(orgId: string): Promise<ObjectionItem[]>;
  saveObjection(orgId: string, item: { id?: string; objection: string; response: string; category: string }): Promise<void>;
  deleteObjection(orgId: string, id: string): Promise<void>;
  replaceObjections(orgId: string, items: { objection: string; response: string; category: string }[]): Promise<void>;

  listSources(orgId: string): Promise<SourceInfo[]>;

  listLeads(orgId: string): Promise<LeadWithScore[]>;
  getLeadDetail(orgId: string, leadId: string): Promise<LeadDetail | null>;
  createLead(orgId: string, lead: NewLead): Promise<Lead>;
  deleteLead(orgId: string, leadId: string): Promise<void>;
  updateLeadStatus(orgId: string, leadId: string, status: LeadStatus): Promise<void>;
  updateLeadEnrichment(orgId: string, leadId: string, enrichment: Enrichment): Promise<void>;

  saveScore(orgId: string, leadId: string, score: ScoreResult): Promise<LeadScore>;
  saveAnalysis(
    orgId: string,
    leadId: string,
    analysis: { origin: "ai" | "rules"; model: string | null; content: Analysis },
  ): Promise<LeadAnalysis>;
  countAiAnalysesSince(orgId: string, sinceIso: string): Promise<number>;

  addActivity(orgId: string, leadId: string, type: ActivityType, content: string, authorId: string | null): Promise<Activity>;
  /** Enregistre le résultat. Passer par ici (ou par updateLeadStatus) garantit un outcome pour chaque lead gagné ou perdu. */
  setOutcome(orgId: string, leadId: string, result: "won" | "lost", reason: string, reasonCode?: string | null): Promise<Outcome>;
  clearOutcome(orgId: string, leadId: string): Promise<void>;

  /* ---- Équipe (S2) ---- */
  listMembers(orgId: string): Promise<Member[]>;
  addMember(orgId: string, m: { userId: string; email: string; name: string; role: Role; status: "active" | "invited" }): Promise<Member>;
  updateMemberRole(orgId: string, userId: string, role: Role): Promise<void>;
  setMemberActive(orgId: string, userId: string, active: boolean): Promise<void>;

  getOrgSettings(orgId: string): Promise<OrgSettings>;
  saveOrgSettings(settings: OrgSettings): Promise<void>;
  /** Curseur du tour de rôle : dernier commercial servi. Écrit à chaque attribution automatique. */
  getRoundRobinCursor(orgId: string): Promise<string | null>;
  setRoundRobinCursor(orgId: string, userId: string | null): Promise<void>;
  /** Attribue ou retire l'attribution d'un lead et écrit l'entrée correspondante dans les activités. */
  assignLead(orgId: string, leadId: string, ownerId: string | null, note: string, actorId: string | null): Promise<void>;

  getWebhookKeyInfo(orgId: string): Promise<WebhookKeyInfo>;
  setWebhookKey(orgId: string, keyHash: string, prefix: string): Promise<void>;

  /* ---- S3 : email entrant ---- */
  /** Lead de l'organisation avec cet email (le plus récent). `sinceIso` limite à une fenêtre de création (dédoublonnage 24 h). */
  findLeadByEmail(orgId: string, email: string, sinceIso?: string): Promise<Lead | null>;
  getInboundKeyInfo(orgId: string): Promise<InboundKeyInfo>;
  setInboundKey(orgId: string, keyHash: string, prefix: string): Promise<void>;

  /* ---- S3 : calibration et versions de la configuration de score ---- */
  /** Leads clos (gagnés ou perdus) créés depuis `sinceIso`, avec le détail du dernier score. */
  listClosedSamples(orgId: string, sinceIso: string): Promise<ClosedLeadSample[]>;
  /** Motifs structurés des résultats récents (gagné ou perdu). */
  listOutcomes(orgId: string, sinceIso: string): Promise<Outcome[]>;
  listScoreVersions(orgId: string): Promise<ScoreConfigVersion[]>;
  addScoreVersion(
    orgId: string,
    v: { criteria: Criterion[]; source: ScoreConfigVersion["source"]; note: string; createdBy: string | null },
  ): Promise<ScoreConfigVersion>;

  /* ---- S3 : intégrations (le jeton n'est jamais dans ces objets : voir src/lib/integrations/secrets.ts) ---- */
  getIntegration(orgId: string, provider: IntegrationProvider): Promise<IntegrationInfo | null>;
  saveIntegration(orgId: string, info: IntegrationInfo): Promise<void>;
  deleteIntegration(orgId: string, provider: IntegrationProvider): Promise<void>;
  addSyncLog(orgId: string, entry: Omit<SyncLogEntry, "id" | "orgId" | "createdAt">): Promise<SyncLogEntry>;
  listSyncLogs(orgId: string, limit: number): Promise<SyncLogEntry[]>;
  getCrmLink(orgId: string, leadId: string, provider: IntegrationProvider): Promise<CrmLink | null>;
  saveCrmLink(orgId: string, link: Omit<CrmLink, "updatedAt">): Promise<void>;

  /* ---- S3 : notifications ---- */
  /** Retourne null si une notification avec la même clé de dédoublonnage existe déjà pour ce destinataire. */
  addNotification(
    orgId: string,
    n: { userId: string; kind: NotificationKind; title: string; body: string; leadId: string | null; dedupeKey: string },
  ): Promise<AppNotification | null>;
  listNotifications(orgId: string, userId: string, limit: number): Promise<AppNotification[]>;
  markNotificationsRead(orgId: string, userId: string, ids: string[] | "all"): Promise<void>;
}

/** Opérations réservées au serveur, sans session utilisateur (formulaire public, webhook). */
export interface PublicRepository {
  getOrganizationBySlug(slug: string): Promise<Organization | null>;
  findOrganizationByWebhookKeyHash(hash: string): Promise<Organization | null>;
  findOrganizationByInboundKeyHash(hash: string): Promise<Organization | null>;
  /** Toutes les organisations (tâche planifiée /api/cron/speed-check). */
  listOrganizations(): Promise<Organization[]>;
  repoForOrg(): Repository;
}

export interface Session {
  mode: "demo" | "supabase";
  userId: string;
  email: string;
  name: string;
  orgId: string | null;
  role: Role | null;
  /** Compte désactivé par un administrateur : aucun accès aux données. */
  disabled?: boolean;
}
