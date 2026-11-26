import type { DemoStoreData } from "@/lib/demo/data";
import { SANDBOX_MAX_LEADS, sandboxes, STORE_BUILDERS } from "@/lib/demo/sandbox";
import { DEFAULT_ORG_SETTINGS, type Member, type OrgSettings, type Role } from "@/lib/types";
import type { AppNotification, ClosedLeadSample, CrmLink, InboundKeyInfo, IntegrationInfo, ScoreConfigVersion, SyncLogEntry } from "@/lib/types";
import type {
  Activity, ActivityType, IcpConfig, Lead, LeadAnalysis, LeadDetail, LeadScore, LeadStatus, LeadWithScore, NewLead,
  ObjectionItem, Organization, Outcome, SourceInfo, WebhookKeyInfo, Enrichment, Analysis,
} from "@/lib/types";
import { SOURCE_TYPES } from "@/lib/types";
import type { ScoreResult } from "@/lib/scoring/engine";
import type { PublicRepository, Repository } from "./types";

/** Une base en mémoire par organisation de démo (Maintia et Cas Orus), indépendantes l'une de l'autre. */
const g = globalThis as unknown as { __prioraDemoStores?: Map<string, DemoStoreData> };

/** Mode démo local (sans démo publique) : un seul jeu de données partagé par tous les visiteurs du processus. */
function globalStore(orgId: string): DemoStoreData {
  const stores = (g.__prioraDemoStores ??= new Map());
  let s = stores.get(orgId);
  if (!s) {
    const build = STORE_BUILDERS[orgId];
    if (!build) throw new Error("Organisation inconnue en mode démo.");
    s = build();
    stores.set(orgId, s);
  }
  return s;
}

/** Données d'une organisation : bac à sable du visiteur (démo publique, si `sid`) ou jeu partagé. */
function resolveStore(orgId: string, sid?: string): DemoStoreData {
  return sid ? sandboxes().store(sid, orgId) : globalStore(orgId);
}

function allStores(): DemoStoreData[] {
  return Object.keys(STORE_BUILDERS).map(globalStore);
}

const SOURCE_LABELS: Record<string, string> = {
  formulaire: "Formulaire public", webhook: "Webhook", csv: "Import CSV", saisie: "Saisie manuelle", email: "Email entrant", crm: "CRM",
};
const ENABLED_SOURCES = new Set(["formulaire", "webhook", "csv", "saisie", "email", "crm"]);

/** Repository de démonstration. `sid` : bac à sable d'un visiteur de la démo publique ; absent : jeu partagé local. */
export function createDemoRepository(sid?: string): Repository {
  const store = (orgId: string) => resolveStore(orgId, sid);
  const guard = (orgId: string) => { store(orgId); };
  return {
  mode: "demo",
  scope: sid,

  async getOrganization(orgId) {
    return orgId in STORE_BUILDERS ? { ...store(orgId).org } : null;
  },
  async updateOrganization(orgId, patch) {
    guard(orgId);
    const o = store(orgId).org;
    if (patch.name !== undefined) o.name = patch.name;
    if (patch.onboardedAt !== undefined) o.onboardedAt = patch.onboardedAt;
  },

  async getIcp(orgId) {
    guard(orgId);
    return structuredClone(store(orgId).icp);
  },
  async saveIcp(icp: IcpConfig) {
    guard(icp.orgId);
    const s = store(icp.orgId);
    // Le script et les déclencheurs d'objections ne sont pas éditables dans Réglages : on les conserve.
    s.icp = { ...structuredClone(icp), playbook: s.icp.playbook };
  },

  async listObjections(orgId) {
    guard(orgId);
    return store(orgId).objections.map((o) => ({ ...o }));
  },
  async saveObjection(orgId, item) {
    guard(orgId);
    const s = store(orgId);
    if (item.id) {
      const found = s.objections.find((o) => o.id === item.id);
      if (found) Object.assign(found, { objection: item.objection, response: item.response, category: item.category });
      return;
    }
    s.objections.push({ id: crypto.randomUUID(), orgId, objection: item.objection, response: item.response, category: item.category });
  },
  async deleteObjection(orgId, id) {
    guard(orgId);
    const s = store(orgId);
    s.objections = s.objections.filter((o) => o.id !== id);
  },
  async replaceObjections(orgId, items) {
    guard(orgId);
    store(orgId).objections = items.map((o): ObjectionItem => ({ ...o, id: crypto.randomUUID(), orgId }));
  },

  async listSources(orgId): Promise<SourceInfo[]> {
    guard(orgId);
    const leads = store(orgId).leads;
    return SOURCE_TYPES.map((type) => ({
      type, label: SOURCE_LABELS[type] ?? type, enabled: ENABLED_SOURCES.has(type), leadCount: leads.filter((l) => l.source === type).length,
    }));
  },

  async listLeads(orgId): Promise<LeadWithScore[]> {
    guard(orgId);
    const s = store(orgId);
    return s.leads.map((l) => ({ ...l, scoreTotal: s.scoreByLead.get(l.id) ?? null, verdict: s.verdictByLead.get(l.id) ?? null }));
  },
  async getLeadDetail(orgId, leadId): Promise<LeadDetail | null> {
    guard(orgId);
    const s = store(orgId);
    const lead = s.leads.find((l) => l.id === leadId);
    if (!lead) return null;
    const score = [...s.scores].reverse().find((x) => x.leadId === leadId) ?? null;
    const analysis = s.analyses.filter((a) => a.leadId === leadId).sort((a, b) => b.version - a.version)[0] ?? null;
    const activities = s.activities.filter((a) => a.leadId === leadId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const outcome = s.outcomes.find((o) => o.leadId === leadId) ?? null;
    return { lead: { ...lead }, score, analysis, activities, outcome };
  },
  async createLead(orgId, input: NewLead): Promise<Lead> {
    guard(orgId);
    if (sid && store(orgId).leads.length >= SANDBOX_MAX_LEADS) throw new Error("Limite de la démo atteinte : réinitialisez la démo pour repartir de zéro.");
    const now = new Date().toISOString();
    const lead: Lead = {
      ...input, id: crypto.randomUUID(), orgId, status: "new", ownerId: null, assignedAt: null, firstContactedAt: null,
      enrichment: input.enrichment ?? null, isDemo: input.isDemo ?? false, createdAt: input.createdAt ?? now, updatedAt: now,
    };
    store(orgId).leads.unshift(lead);
    return { ...lead };
  },
  async deleteLead(orgId, leadId) {
    guard(orgId);
    const s = store(orgId);
    s.leads = s.leads.filter((l) => l.id !== leadId);
    s.scores = s.scores.filter((x) => x.leadId !== leadId);
    s.analyses = s.analyses.filter((x) => x.leadId !== leadId);
    s.activities = s.activities.filter((x) => x.leadId !== leadId);
    s.outcomes = s.outcomes.filter((x) => x.leadId !== leadId);
  },
  async updateLeadStatus(orgId, leadId, status: LeadStatus) {
    guard(orgId);
    const lead = store(orgId).leads.find((l) => l.id === leadId);
    if (!lead) return;
    lead.status = status;
    lead.updatedAt = new Date().toISOString();
    if (status !== "new" && !lead.firstContactedAt) lead.firstContactedAt = lead.updatedAt;
    // Chaque passage Gagné ou Perdu crée (ou met à jour) un résultat, même sans motif saisi.
    if (status === "won" || status === "lost") {
      const s = store(orgId);
      const existing = s.outcomes.find((o) => o.leadId === leadId);
      if (existing) existing.result = status;
      else s.outcomes.push({ id: crypto.randomUUID(), leadId, orgId, result: status, reason: "", reasonCode: null, createdAt: lead.updatedAt });
    }
  },
  async updateLeadEnrichment(orgId, leadId, enrichment: Enrichment) {
    guard(orgId);
    const lead = store(orgId).leads.find((l) => l.id === leadId);
    if (lead) lead.enrichment = enrichment;
  },

  async saveScore(orgId, leadId, result: ScoreResult): Promise<LeadScore> {
    guard(orgId);
    const s = store(orgId);
    const score: LeadScore = { id: crypto.randomUUID(), leadId, orgId, total: result.total, details: result.details, breakdown: result.breakdown, createdAt: new Date().toISOString() };
    s.scores.push(score);
    s.scoreByLead.set(leadId, result.total);
    return score;
  },
  async saveAnalysis(orgId, leadId, a): Promise<LeadAnalysis> {
    guard(orgId);
    const s = store(orgId);
    const version = Math.max(0, ...s.analyses.filter((x) => x.leadId === leadId).map((x) => x.version)) + 1;
    const row: LeadAnalysis = { id: crypto.randomUUID(), leadId, orgId, version, origin: a.origin, model: a.model, content: a.content as Analysis, createdAt: new Date().toISOString() };
    s.analyses.push(row);
    s.verdictByLead.set(leadId, a.content.verdict.decision);
    return row;
  },
  async countAiAnalysesSince(orgId, sinceIso) {
    guard(orgId);
    return store(orgId).analyses.filter((a) => a.origin === "ai" && a.createdAt >= sinceIso).length;
  },

  async addActivity(orgId, leadId, type: ActivityType, content, authorId): Promise<Activity> {
    guard(orgId);
    const a: Activity = { id: crypto.randomUUID(), leadId, orgId, type, content, authorId, createdAt: new Date().toISOString() };
    const s = store(orgId);
    s.activities.push(a);
    // Premier contact : première activité appel ou email (speed-to-lead).
    if (type === "call" || type === "email") {
      const lead = s.leads.find((l) => l.id === leadId);
      if (lead && !lead.firstContactedAt) lead.firstContactedAt = a.createdAt;
    }
    return a;
  },
  async setOutcome(orgId, leadId, result, reason, reasonCode = null): Promise<Outcome> {
    guard(orgId);
    const s = store(orgId);
    s.outcomes = s.outcomes.filter((o) => o.leadId !== leadId);
    const o: Outcome = { id: crypto.randomUUID(), leadId, orgId, result, reason, reasonCode, createdAt: new Date().toISOString() };
    s.outcomes.push(o);
    return o;
  },
  async clearOutcome(orgId, leadId) {
    guard(orgId);
    const s = store(orgId);
    s.outcomes = s.outcomes.filter((o) => o.leadId !== leadId);
  },

  async listMembers(orgId): Promise<Member[]> {
    guard(orgId);
    return store(orgId).members.map((m) => ({ ...m }));
  },
  async addMember(orgId, m): Promise<Member> {
    guard(orgId);
    const s = store(orgId);
    const member: Member = { userId: m.userId, orgId, role: m.role, name: m.name, email: m.email, active: true, status: m.status, createdAt: new Date().toISOString() };
    s.members.push(member);
    return { ...member };
  },
  async updateMemberRole(orgId, userId, role: Role) {
    guard(orgId);
    const m = store(orgId).members.find((x) => x.userId === userId);
    if (m) m.role = role;
  },
  async setMemberActive(orgId, userId, active) {
    guard(orgId);
    const m = store(orgId).members.find((x) => x.userId === userId);
    if (m) m.active = active;
  },

  async getOrgSettings(orgId): Promise<OrgSettings> {
    guard(orgId);
    return structuredClone(store(orgId).settings ?? DEFAULT_ORG_SETTINGS(orgId));
  },
  async saveOrgSettings(settings) {
    guard(settings.orgId);
    store(settings.orgId).settings = structuredClone(settings);
  },
  async getRoundRobinCursor(orgId) {
    guard(orgId);
    return store(orgId).rrCursor;
  },
  async setRoundRobinCursor(orgId, userId) {
    guard(orgId);
    store(orgId).rrCursor = userId;
  },
  async assignLead(orgId, leadId, ownerId, note, actorId) {
    guard(orgId);
    const s = store(orgId);
    const lead = s.leads.find((l) => l.id === leadId);
    if (!lead) return;
    const now = new Date().toISOString();
    lead.ownerId = ownerId;
    lead.assignedAt = ownerId ? now : null;
    lead.updatedAt = now;
    s.activities.push({ id: crypto.randomUUID(), leadId, orgId, type: "assignment", content: note, authorId: actorId, createdAt: now });
  },

  async getWebhookKeyInfo(orgId): Promise<WebhookKeyInfo> {
    guard(orgId);
    const w = store(orgId).webhook;
    return { prefix: w.prefix, createdAt: w.createdAt };
  },
  async setWebhookKey(orgId, keyHash, prefix) {
    guard(orgId);
    store(orgId).webhook = { hash: keyHash, prefix, createdAt: new Date().toISOString() };
  },

  /* ---- S3 ---- */
  async findLeadByEmail(orgId, email, sinceIso): Promise<Lead | null> {
    guard(orgId);
    const wanted = email.trim().toLowerCase();
    const hit = store(orgId).leads
      .filter((l) => l.email.toLowerCase() === wanted && (!sinceIso || l.createdAt >= sinceIso))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return hit ? { ...hit } : null;
  },
  async getInboundKeyInfo(orgId): Promise<InboundKeyInfo> {
    guard(orgId);
    const k = store(orgId).inboundKey;
    return { prefix: k?.prefix ?? null, createdAt: k?.createdAt ?? null };
  },
  async setInboundKey(orgId, keyHash, prefix) {
    guard(orgId);
    store(orgId).inboundKey = { hash: keyHash, prefix, createdAt: new Date().toISOString() };
  },

  async listClosedSamples(orgId, sinceIso): Promise<ClosedLeadSample[]> {
    guard(orgId);
    const s = store(orgId);
    const lastScore = new Map<string, (typeof s.scores)[number]>();
    for (const sc of s.scores) lastScore.set(sc.leadId, sc);
    const out: ClosedLeadSample[] = [];
    for (const o of s.outcomes) {
      const lead = s.leads.find((l) => l.id === o.leadId);
      const sc = lastScore.get(o.leadId);
      if (!lead || !sc || lead.createdAt < sinceIso) continue;
      out.push({
        leadId: lead.id, result: o.result, createdAt: lead.createdAt, scoreTotal: sc.total, verdict: s.verdictByLead.get(lead.id) ?? null,
        details: sc.details.map((d) => ({ key: d.key, points: d.points, max: d.max })),
      });
    }
    return out;
  },
  async listOutcomes(orgId, sinceIso) {
    guard(orgId);
    return store(orgId).outcomes.filter((o) => o.createdAt >= sinceIso).map((o) => ({ ...o }));
  },
  async listScoreVersions(orgId): Promise<ScoreConfigVersion[]> {
    guard(orgId);
    return structuredClone((store(orgId).scoreVersions ?? []).slice().sort((a, b) => b.version - a.version));
  },
  async addScoreVersion(orgId, v): Promise<ScoreConfigVersion> {
    guard(orgId);
    const s = store(orgId);
    const list = (s.scoreVersions ??= []);
    const row: ScoreConfigVersion = {
      id: crypto.randomUUID(), orgId, version: Math.max(0, ...list.map((x) => x.version)) + 1, criteria: structuredClone(v.criteria),
      source: v.source, note: v.note, createdBy: v.createdBy, createdAt: new Date().toISOString(),
    };
    list.push(row);
    return structuredClone(row);
  },

  async getIntegration(orgId, provider): Promise<IntegrationInfo | null> {
    guard(orgId);
    const i = store(orgId).integrations?.[provider];
    return i ? { ...i } : null;
  },
  async saveIntegration(orgId, info) {
    guard(orgId);
    const s = store(orgId);
    (s.integrations ??= {})[info.provider] = { ...info };
  },
  async deleteIntegration(orgId, provider) {
    guard(orgId);
    const s = store(orgId);
    if (s.integrations) delete s.integrations[provider];
  },
  async addSyncLog(orgId, entry): Promise<SyncLogEntry> {
    guard(orgId);
    const row: SyncLogEntry = { ...entry, id: crypto.randomUUID(), orgId, createdAt: new Date().toISOString() };
    const logs = (store(orgId).syncLogs ??= []);
    logs.unshift(row);
    if (logs.length > 200) logs.length = 200;
    return { ...row };
  },
  async listSyncLogs(orgId, limit) {
    guard(orgId);
    return (store(orgId).syncLogs ?? []).slice(0, limit).map((l) => ({ ...l }));
  },
  async getCrmLink(orgId, leadId, provider): Promise<CrmLink | null> {
    guard(orgId);
    const l = (store(orgId).crmLinks ?? []).find((x) => x.leadId === leadId && x.provider === provider);
    return l ? { ...l } : null;
  },
  async saveCrmLink(orgId, link) {
    guard(orgId);
    const list = (store(orgId).crmLinks ??= []);
    const row: CrmLink = { ...link, updatedAt: new Date().toISOString() };
    const i = list.findIndex((x) => x.leadId === link.leadId && x.provider === link.provider);
    if (i >= 0) list[i] = row;
    else list.push(row);
  },

  async addNotification(orgId, n): Promise<AppNotification | null> {
    guard(orgId);
    const list = (store(orgId).notifications ??= []);
    if (list.some((x) => x.userId === n.userId && x.dedupeKey === n.dedupeKey)) return null;
    const row: AppNotification = { ...n, id: crypto.randomUUID(), orgId, readAt: null, createdAt: new Date().toISOString() };
    list.unshift(row);
    if (list.length > 500) list.length = 500;
    return { ...row };
  },
  async listNotifications(orgId, userId, limit) {
    guard(orgId);
    return (store(orgId).notifications ?? []).filter((x) => x.userId === userId).slice(0, limit).map((x) => ({ ...x }));
  },
  async markNotificationsRead(orgId, userId, ids) {
    guard(orgId);
    const now = new Date().toISOString();
    for (const x of store(orgId).notifications ?? []) {
      if (x.userId === userId && !x.readAt && (ids === "all" || ids.includes(x.id))) x.readAt = now;
    }
  },
  };
}

export const demoRepository: Repository = createDemoRepository();

export const demoPublicRepository: PublicRepository = {
  async getOrganizationBySlug(slug): Promise<Organization | null> {
    const o = allStores().map((x) => x.org).find((x) => x.slug === slug);
    return o ? { ...o } : null;
  },
  async findOrganizationByWebhookKeyHash(hash): Promise<Organization | null> {
    const s = allStores().find((x) => x.webhook.hash && x.webhook.hash === hash);
    return s ? { ...s.org } : null;
  },
  async findOrganizationByInboundKeyHash(hash): Promise<Organization | null> {
    const s = allStores().find((x) => x.inboundKey?.hash && x.inboundKey.hash === hash);
    return s ? { ...s.org } : null;
  },
  async listOrganizations(): Promise<Organization[]> {
    return allStores().map((x) => ({ ...x.org }));
  },
  repoForOrg: () => demoRepository,
};

/** Membres d'une organisation de démonstration, sans passer par la couche serveur (sélecteur "Voir en tant que"). */
export function demoMembers(orgId: string, sid?: string): Member[] {
  return resolveStore(orgId, sid).members.map((m) => ({ ...m }));
}
