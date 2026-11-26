import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePersonas } from "@/lib/ai/persona";
import { DEFAULT_CRITERIA } from "@/lib/scoring/defaults";
import type {
  Activity, Analysis, Criterion, Enrichment, IcpConfig, Lead, LeadAnalysis, LeadDetail, LeadScore, LeadWithScore, Member, ObjectionItem,
  Organization, OrgSettings, Outcome, SourceInfo, Verdict,
  AppNotification, ClosedLeadSample, CrmLink, IntegrationInfo, ScoreConfigVersion, SyncLogEntry,
} from "@/lib/types";
import { DEFAULT_ORG_SETTINGS, SOURCE_TYPES } from "@/lib/types";
import type { Repository } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function fail(context: string, error: { message: string } | null): asserts error is null {
  if (error) throw new Error(`${context} : ${error.message}`);
}

const mapOrg = (r: Row): Organization => ({ id: r.id, name: r.name, slug: r.slug, onboardedAt: r.onboarded_at, createdAt: r.created_at });

const mapLead = (r: Row): Lead => ({
  id: r.id, orgId: r.org_id, firstName: r.first_name, lastName: r.last_name, email: r.email, phone: r.phone, company: r.company,
  jobTitle: r.job_title, website: r.website, location: r.location, message: r.message, source: r.source, sourceDetail: r.source_detail,
  status: r.status, ownerId: r.owner_id, assignedAt: r.assigned_at ?? null, firstContactedAt: r.first_contacted_at, enrichment: (r.enrichment as Enrichment | null) ?? null,
  isDemo: r.is_demo, createdAt: r.created_at, updatedAt: r.updated_at,
});

const mapScore = (r: Row): LeadScore => ({ id: r.id, leadId: r.lead_id, orgId: r.org_id, total: r.total, details: r.details, breakdown: r.breakdown, createdAt: r.created_at });
const mapAnalysis = (r: Row): LeadAnalysis => ({ id: r.id, leadId: r.lead_id, orgId: r.org_id, version: r.version, origin: r.origin, model: r.model, content: r.content as Analysis, createdAt: r.created_at });
const mapActivity = (r: Row): Activity => ({ id: r.id, leadId: r.lead_id, orgId: r.org_id, type: r.type, content: r.content, authorId: r.author_id, createdAt: r.created_at });
const mapMember = (r: Row): Member => ({
  userId: r.user_id, orgId: r.org_id, role: r.role, name: r.full_name || String(r.email ?? "").split("@")[0] || "Membre", email: r.email ?? "",
  active: r.active ?? true, status: r.status ?? "active", createdAt: r.created_at,
});

const mapOutcome = (r: Row): Outcome => ({ id: r.id, leadId: r.lead_id, orgId: r.org_id, result: r.result, reason: r.reason, reasonCode: r.reason_code ?? null, createdAt: r.created_at });

const mapVersion = (r: Row): ScoreConfigVersion => ({
  id: r.id, orgId: r.org_id, version: r.version, criteria: r.criteria as Criterion[], source: r.source, note: r.note ?? "", createdBy: r.created_by ?? null, createdAt: r.created_at,
});
const mapIntegration = (r: Row): IntegrationInfo => ({
  provider: r.provider, status: r.status, tokenHint: r.token_hint ?? null, simulated: r.simulated ?? false, autoPush: r.auto_push ?? true,
  connectedAt: r.connected_at ?? null, lastSyncAt: r.last_sync_at ?? null,
});
const mapSyncLog = (r: Row): SyncLogEntry => ({
  id: r.id, orgId: r.org_id, provider: r.provider, direction: r.direction, status: r.status, message: r.message ?? "", leadId: r.lead_id ?? null, createdAt: r.created_at,
});
const mapNotification = (r: Row): AppNotification => ({
  id: r.id, orgId: r.org_id, userId: r.user_id, kind: r.kind, title: r.title, body: r.body ?? "", leadId: r.lead_id ?? null, dedupeKey: r.dedupe_key, readAt: r.read_at ?? null, createdAt: r.created_at,
});

function mapIcp(orgId: string, r: Row | null): IcpConfig {
  const criteria = (r?.criteria as Criterion[] | undefined) ?? [];
  return {
    orgId,
    offer: r?.offer ?? "",
    idealCustomer: r?.ideal_customer ?? "",
    sectors: r?.sectors ?? [],
    sizeMin: r?.size_min ?? null,
    sizeMax: r?.size_max ?? null,
    zones: r?.zones ?? [],
    decisionRoles: r?.decision_roles ?? [],
    // Complète avec les critères par défaut si la base n'en contient pas encore.
    criteria: criteria.length > 0 ? criteria : DEFAULT_CRITERIA.map((c) => ({ ...c })),
    personas: normalizePersonas(r?.personas),
  };
}

/** Repository Supabase. Le client fourni détermine le niveau d'accès : session utilisateur (RLS) ou service role (serveur uniquement). */
export function createSupabaseRepository(db: SupabaseClient): Repository {
  return {
    mode: "supabase",

    async getOrganization(orgId) {
      const { data, error } = await db.from("organizations").select("*").eq("id", orgId).maybeSingle();
      fail("Lecture organisation", error);
      return data ? mapOrg(data) : null;
    },
    async updateOrganization(orgId, patch) {
      const update: Row = {};
      if (patch.name !== undefined) update.name = patch.name;
      if (patch.onboardedAt !== undefined) update.onboarded_at = patch.onboardedAt;
      const { error } = await db.from("organizations").update(update).eq("id", orgId);
      fail("Mise à jour organisation", error);
    },

    async getIcp(orgId) {
      const { data, error } = await db.from("icp_config").select("*").eq("org_id", orgId).maybeSingle();
      fail("Lecture cible idéale", error);
      return mapIcp(orgId, data);
    },
    async saveIcp(icp) {
      const { error } = await db.from("icp_config").upsert({
        org_id: icp.orgId, offer: icp.offer, ideal_customer: icp.idealCustomer, sectors: icp.sectors, size_min: icp.sizeMin,
        size_max: icp.sizeMax, zones: icp.zones, decision_roles: icp.decisionRoles, criteria: icp.criteria, personas: icp.personas,
      });
      fail("Enregistrement cible idéale", error);
    },

    async listObjections(orgId): Promise<ObjectionItem[]> {
      const { data, error } = await db.from("objection_library").select("*").eq("org_id", orgId).order("created_at", { ascending: true });
      fail("Lecture objections", error);
      return (data ?? []).map((r: Row) => ({ id: r.id, orgId: r.org_id, objection: r.objection, response: r.response, category: r.category }));
    },
    async saveObjection(orgId, item) {
      const payload = { objection: item.objection, response: item.response, category: item.category };
      const { error } = item.id
        ? await db.from("objection_library").update(payload).eq("id", item.id).eq("org_id", orgId)
        : await db.from("objection_library").insert({ ...payload, org_id: orgId });
      fail("Enregistrement objection", error);
    },
    async deleteObjection(orgId, id) {
      const { error } = await db.from("objection_library").delete().eq("id", id).eq("org_id", orgId);
      fail("Suppression objection", error);
    },
    async replaceObjections(orgId, items) {
      const del = await db.from("objection_library").delete().eq("org_id", orgId);
      fail("Remplacement objections", del.error);
      if (items.length === 0) return;
      const ins = await db.from("objection_library").insert(items.map((o) => ({ ...o, org_id: orgId })));
      fail("Remplacement objections", ins.error);
    },

    async listSources(orgId): Promise<SourceInfo[]> {
      const [src, leads] = await Promise.all([
        db.from("lead_sources").select("type,label,enabled").eq("org_id", orgId),
        db.from("leads").select("source").eq("org_id", orgId),
      ]);
      fail("Lecture sources", src.error);
      fail("Lecture sources", leads.error);
      const counts = new Map<string, number>();
      for (const l of leads.data ?? []) counts.set(l.source, (counts.get(l.source) ?? 0) + 1);
      return SOURCE_TYPES.map((type) => {
        const row = (src.data ?? []).find((s: Row) => s.type === type);
        return { type, label: row?.label ?? type, enabled: row?.enabled ?? false, leadCount: counts.get(type) ?? 0 };
      });
    },

    async listLeads(orgId): Promise<LeadWithScore[]> {
      const { data, error } = await db.from("leads").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(1000);
      fail("Lecture leads", error);
      return (data ?? []).map((r: Row) => ({ ...mapLead(r), scoreTotal: r.score_total, verdict: (r.verdict as Verdict | null) ?? null }));
    },
    async getLeadDetail(orgId, leadId): Promise<LeadDetail | null> {
      const { data, error } = await db.from("leads").select("*").eq("id", leadId).eq("org_id", orgId).maybeSingle();
      fail("Lecture lead", error);
      if (!data) return null;
      const [score, analysis, acts, outcome] = await Promise.all([
        db.from("lead_scores").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        db.from("lead_analyses").select("*").eq("lead_id", leadId).order("version", { ascending: false }).limit(1).maybeSingle(),
        db.from("activities").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(100),
        db.from("outcomes").select("*").eq("lead_id", leadId).maybeSingle(),
      ]);
      fail("Lecture score", score.error);
      fail("Lecture analyse", analysis.error);
      fail("Lecture activités", acts.error);
      fail("Lecture résultat", outcome.error);
      return {
        lead: mapLead(data),
        score: score.data ? mapScore(score.data) : null,
        analysis: analysis.data ? mapAnalysis(analysis.data) : null,
        activities: (acts.data ?? []).map(mapActivity),
        outcome: outcome.data ? mapOutcome(outcome.data) : null,
      };
    },
    async createLead(orgId, l): Promise<Lead> {
      const { data, error } = await db.from("leads").insert({
        org_id: orgId, first_name: l.firstName, last_name: l.lastName, email: l.email, phone: l.phone, company: l.company,
        job_title: l.jobTitle, website: l.website, location: l.location, message: l.message, source: l.source,
        source_detail: l.sourceDetail, enrichment: l.enrichment ?? null, is_demo: l.isDemo ?? false,
        ...(l.createdAt ? { created_at: l.createdAt } : {}),
      }).select("*").single();
      fail("Création lead", error);
      return mapLead(data as Row);
    },
    async deleteLead(orgId, leadId) {
      const { error } = await db.from("leads").delete().eq("id", leadId).eq("org_id", orgId);
      fail("Suppression lead", error);
    },
    async updateLeadStatus(orgId, leadId, status) {
      const patch: Row = { status };
      if (status !== "new") {
        const cur = await db.from("leads").select("first_contacted_at").eq("id", leadId).eq("org_id", orgId).maybeSingle();
        if (cur.data && !cur.data.first_contacted_at) patch.first_contacted_at = new Date().toISOString();
      }
      const { error } = await db.from("leads").update(patch).eq("id", leadId).eq("org_id", orgId);
      fail("Changement de statut", error);
    },
    async updateLeadEnrichment(orgId, leadId, enrichment) {
      const { error } = await db.from("leads").update({ enrichment }).eq("id", leadId).eq("org_id", orgId);
      fail("Enregistrement enrichissement", error);
    },

    async saveScore(orgId, leadId, r): Promise<LeadScore> {
      const { data, error } = await db.from("lead_scores").insert({ lead_id: leadId, org_id: orgId, total: r.total, details: r.details, breakdown: r.breakdown }).select("*").single();
      fail("Enregistrement score", error);
      const upd = await db.from("leads").update({ score_total: r.total }).eq("id", leadId).eq("org_id", orgId);
      fail("Mise à jour du score", upd.error);
      return mapScore(data as Row);
    },
    async saveAnalysis(orgId, leadId, a): Promise<LeadAnalysis> {
      const last = await db.from("lead_analyses").select("version").eq("lead_id", leadId).order("version", { ascending: false }).limit(1).maybeSingle();
      fail("Lecture version analyse", last.error);
      const version = (last.data?.version ?? 0) + 1;
      const { data, error } = await db.from("lead_analyses").insert({ lead_id: leadId, org_id: orgId, version, origin: a.origin, model: a.model, content: a.content }).select("*").single();
      fail("Enregistrement analyse", error);
      const upd = await db.from("leads").update({ verdict: a.content.verdict.decision }).eq("id", leadId).eq("org_id", orgId);
      fail("Mise à jour du verdict", upd.error);
      return mapAnalysis(data as Row);
    },
    async countAiAnalysesSince(orgId, sinceIso) {
      const { count, error } = await db.from("lead_analyses").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("origin", "ai").gte("created_at", sinceIso);
      fail("Comptage analyses IA", error);
      return count ?? 0;
    },

    async addActivity(orgId, leadId, type, content, authorId): Promise<Activity> {
      const { data, error } = await db.from("activities").insert({ lead_id: leadId, org_id: orgId, type, content, author_id: authorId }).select("*").single();
      fail("Enregistrement activité", error);
      return mapActivity(data as Row);
    },
    async setOutcome(orgId, leadId, result, reason, reasonCode = null): Promise<Outcome> {
      const { data, error } = await db.from("outcomes").upsert({ lead_id: leadId, org_id: orgId, result, reason, reason_code: reasonCode }, { onConflict: "lead_id" }).select("*").single();
      fail("Enregistrement résultat", error);
      return mapOutcome(data as Row);
    },
    async clearOutcome(orgId, leadId) {
      const { error } = await db.from("outcomes").delete().eq("lead_id", leadId).eq("org_id", orgId);
      fail("Suppression résultat", error);
    },

    async listMembers(orgId): Promise<Member[]> {
      const { data, error } = await db.from("members").select("*").eq("org_id", orgId).order("created_at", { ascending: true });
      fail("Lecture équipe", error);
      return (data ?? []).map(mapMember);
    },
    async addMember(orgId, m): Promise<Member> {
      const { data, error } = await db.from("members").insert({
        org_id: orgId, user_id: m.userId, email: m.email, full_name: m.name, role: m.role, status: m.status, active: true,
      }).select("*").single();
      fail("Ajout d'un membre", error);
      return mapMember(data as Row);
    },
    async updateMemberRole(orgId, userId, role) {
      const { error } = await db.from("members").update({ role }).eq("org_id", orgId).eq("user_id", userId);
      fail("Changement de rôle", error);
    },
    async setMemberActive(orgId, userId, active) {
      const { error } = await db.from("members").update({ active }).eq("org_id", orgId).eq("user_id", userId);
      fail("Activation du membre", error);
    },

    async getOrgSettings(orgId): Promise<OrgSettings> {
      const { data, error } = await db.from("org_settings").select("*").eq("org_id", orgId).maybeSingle();
      fail("Lecture réglages équipe", error);
      const d = DEFAULT_ORG_SETTINGS(orgId);
      if (!data) return d;
      return {
        orgId,
        assignment: { mode: data.assignment_mode ?? d.assignment.mode, rules: data.assignment_rules ?? [] },
        commercialsSeeAll: data.commercials_see_all ?? d.commercialsSeeAll,
        speedTargets: { callNowMinutes: data.speed_call_now_minutes ?? d.speedTargets.callNowMinutes, nurtureMinutes: data.speed_nurture_minutes ?? d.speedTargets.nurtureMinutes },
      };
    },
    async saveOrgSettings(s) {
      const { error } = await db.from("org_settings").upsert({
        org_id: s.orgId, assignment_mode: s.assignment.mode, assignment_rules: s.assignment.rules, commercials_see_all: s.commercialsSeeAll,
        speed_call_now_minutes: s.speedTargets.callNowMinutes, speed_nurture_minutes: s.speedTargets.nurtureMinutes,
      });
      fail("Enregistrement réglages équipe", error);
    },
    async getRoundRobinCursor(orgId) {
      const { data, error } = await db.from("assignment_state").select("last_user_id").eq("org_id", orgId).maybeSingle();
      fail("Lecture du tour de rôle", error);
      return data?.last_user_id ?? null;
    },
    async setRoundRobinCursor(orgId, userId) {
      const { error } = await db.from("assignment_state").upsert({ org_id: orgId, last_user_id: userId });
      fail("Mise à jour du tour de rôle", error);
    },
    async assignLead(orgId, leadId, ownerId, note, actorId) {
      // Fonction SQL (droits contrôlés côté base, voir migration S2) : met à jour le lead et écrit l'activité d'attribution.
      const { error } = await db.rpc("assign_lead", { p_lead: leadId, p_owner: ownerId, p_note: note, p_actor: actorId });
      fail("Attribution du lead", error);
      void orgId;
    },

    async getWebhookKeyInfo(orgId) {
      const { data, error } = await db.from("webhook_keys").select("prefix,created_at").eq("org_id", orgId).maybeSingle();
      fail("Lecture clé webhook", error);
      return { prefix: data?.prefix ?? null, createdAt: data?.created_at ?? null };
    },
    async setWebhookKey(orgId, keyHash, prefix) {
      const { error } = await db.from("webhook_keys").upsert({ org_id: orgId, key_hash: keyHash, prefix, created_at: new Date().toISOString() });
      fail("Enregistrement clé webhook", error);
    },

    /* ---- S3 ---- */
    async findLeadByEmail(orgId, email, sinceIso): Promise<Lead | null> {
      // Les emails sont enregistrés en minuscules (schéma de validation) : égalité stricte, sans caractère générique.
      let q = db.from("leads").select("*").eq("org_id", orgId).eq("email", email.trim().toLowerCase());
      if (sinceIso) q = q.gte("created_at", sinceIso);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
      fail("Recherche par email", error);
      return data ? mapLead(data) : null;
    },
    async getInboundKeyInfo(orgId) {
      const { data, error } = await db.from("inbound_email_keys").select("prefix,created_at").eq("org_id", orgId).maybeSingle();
      fail("Lecture clé email entrant", error);
      return { prefix: data?.prefix ?? null, createdAt: data?.created_at ?? null };
    },
    async setInboundKey(orgId, keyHash, prefix) {
      const { error } = await db.from("inbound_email_keys").upsert({ org_id: orgId, key_hash: keyHash, prefix, created_at: new Date().toISOString() });
      fail("Enregistrement clé email entrant", error);
    },

    async listClosedSamples(orgId, sinceIso): Promise<ClosedLeadSample[]> {
      const { data, error } = await db
        .from("outcomes")
        .select("lead_id, result, leads!inner(created_at, score_total, verdict)")
        .eq("org_id", orgId)
        .gte("leads.created_at", sinceIso)
        .limit(2000);
      fail("Lecture des leads clos", error);
      const rows = (data ?? []) as Row[];
      const ids = rows.map((r) => r.lead_id as string);
      const latest = new Map<string, Row>();
      // Plusieurs versions de score par lead : on garde la plus récente. Lots de 100 pour rester sous la limite d'URL.
      for (let i = 0; i < ids.length; i += 100) {
        const { data: sc, error: e2 } = await db.from("lead_scores").select("lead_id, total, details, created_at").in("lead_id", ids.slice(i, i + 100)).order("created_at", { ascending: false });
        fail("Lecture des scores", e2);
        for (const r of (sc ?? []) as Row[]) if (!latest.has(r.lead_id)) latest.set(r.lead_id, r);
      }
      const out: ClosedLeadSample[] = [];
      for (const r of rows) {
        const sc = latest.get(r.lead_id);
        const lead = (Array.isArray(r.leads) ? r.leads[0] : r.leads) as Row | undefined;
        if (!sc || !lead) continue;
        out.push({
          leadId: r.lead_id, result: r.result, createdAt: lead.created_at, scoreTotal: sc.total, verdict: (lead.verdict as Verdict | null) ?? null,
          details: (sc.details as Row[]).map((d) => ({ key: d.key, points: d.points, max: d.max })),
        });
      }
      return out;
    },
    async listOutcomes(orgId, sinceIso) {
      const { data, error } = await db.from("outcomes").select("*").eq("org_id", orgId).gte("created_at", sinceIso).limit(2000);
      fail("Lecture des résultats", error);
      return (data ?? []).map(mapOutcome);
    },
    async listScoreVersions(orgId): Promise<ScoreConfigVersion[]> {
      const { data, error } = await db.from("score_config_versions").select("*").eq("org_id", orgId).order("version", { ascending: false }).limit(100);
      fail("Lecture des versions de score", error);
      return (data ?? []).map(mapVersion);
    },
    async addScoreVersion(orgId, v): Promise<ScoreConfigVersion> {
      const { data, error } = await db.rpc("add_score_version", { p_org: orgId, p_criteria: v.criteria, p_source: v.source, p_note: v.note });
      fail("Enregistrement de la version de score", error);
      return mapVersion(data as Row);
    },

    async getIntegration(orgId, provider): Promise<IntegrationInfo | null> {
      const { data, error } = await db.from("integrations").select("*").eq("org_id", orgId).eq("provider", provider).maybeSingle();
      fail("Lecture intégration", error);
      return data ? mapIntegration(data) : null;
    },
    async saveIntegration(orgId, info) {
      const { error } = await db.from("integrations").upsert({
        org_id: orgId, provider: info.provider, status: info.status, token_hint: info.tokenHint, simulated: info.simulated, auto_push: info.autoPush,
        connected_at: info.connectedAt, last_sync_at: info.lastSyncAt, updated_at: new Date().toISOString(),
      });
      fail("Enregistrement intégration", error);
    },
    async deleteIntegration(orgId, provider) {
      const { error } = await db.from("integrations").delete().eq("org_id", orgId).eq("provider", provider);
      fail("Suppression intégration", error);
    },
    async addSyncLog(orgId, entry): Promise<SyncLogEntry> {
      const { data, error } = await db.from("sync_logs").insert({
        org_id: orgId, provider: entry.provider, direction: entry.direction, status: entry.status, message: entry.message.slice(0, 1000), lead_id: entry.leadId,
      }).select("*").single();
      fail("Enregistrement du journal", error);
      return mapSyncLog(data as Row);
    },
    async listSyncLogs(orgId, limit) {
      const { data, error } = await db.from("sync_logs").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(limit);
      fail("Lecture du journal", error);
      return (data ?? []).map(mapSyncLog);
    },
    async getCrmLink(orgId, leadId, provider): Promise<CrmLink | null> {
      const { data, error } = await db.from("crm_links").select("*").eq("org_id", orgId).eq("lead_id", leadId).eq("provider", provider).maybeSingle();
      fail("Lecture du lien CRM", error);
      return data ? { leadId: data.lead_id, provider: data.provider, contactId: data.contact_id, dealId: data.deal_id, updatedAt: data.updated_at } : null;
    },
    async saveCrmLink(orgId, link) {
      const { error } = await db.from("crm_links").upsert({
        lead_id: link.leadId, provider: link.provider, org_id: orgId, contact_id: link.contactId, deal_id: link.dealId, updated_at: new Date().toISOString(),
      });
      fail("Enregistrement du lien CRM", error);
    },

    async addNotification(orgId, n): Promise<AppNotification | null> {
      const { data, error } = await db.rpc("create_notification", {
        p_org: orgId, p_user: n.userId, p_kind: n.kind, p_title: n.title, p_body: n.body, p_lead: n.leadId, p_dedupe: n.dedupeKey,
      });
      fail("Création de la notification", error);
      if (!data) return null;
      return { id: data as string, orgId, userId: n.userId, kind: n.kind, title: n.title, body: n.body, leadId: n.leadId, dedupeKey: n.dedupeKey, readAt: null, createdAt: new Date().toISOString() };
    },
    async listNotifications(orgId, userId, limit) {
      const { data, error } = await db.from("notifications").select("*").eq("org_id", orgId).eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
      fail("Lecture des notifications", error);
      return (data ?? []).map(mapNotification);
    },
    async markNotificationsRead(orgId, userId, ids) {
      let q = db.from("notifications").update({ read_at: new Date().toISOString() }).eq("org_id", orgId).eq("user_id", userId).is("read_at", null);
      if (ids !== "all") q = q.in("id", ids);
      const { error } = await q;
      fail("Marquage des notifications", error);
    },
  };
}
