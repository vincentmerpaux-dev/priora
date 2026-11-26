import "server-only";
import type { CrmAdapter, CrmContact, PushFacts, PushResult } from "@/lib/integrations/adapter";
import { HubSpotClient, HubSpotError } from "@/lib/integrations/hubspot/client";
import { createFakeHubSpotFetch, fakeHubSpotKey } from "@/lib/integrations/hubspot/fake";
import { contactToLeadInput, leadToContactProps, leadToDealProps } from "@/lib/integrations/hubspot/mapping";
import { deleteToken, readToken, saveToken, secretsStatus } from "@/lib/integrations/secrets";
import { notifySyncFailed } from "@/lib/notifications/service";
import { ingestLead } from "@/lib/pipeline";
import type { Repository } from "@/lib/repo/types";
import type { IntegrationInfo, Lead } from "@/lib/types";
import { fullName } from "@/lib/format";

/**
 * Synchronisation HubSpot : envoi des leads (contact + transaction), import des contacts récents, connexion.
 * En mode démo, tout passe par un FAUX HubSpot (hubspot/fake.ts) : connexion simulée, aucun appel réseau.
 * Chaque opération écrit une ligne dans le journal de synchronisation ; un échec notifie les administrateurs.
 */

const PROVIDER = "hubspot" as const;

export interface SyncCtx {
  repo: Repository;
  orgId: string;
  actorId: string | null;
  /** Tests : client prêt à l'emploi (évite la lecture du jeton). */
  client?: HubSpotClient;
}

export type SyncOutcome = { ok: true; message: string } | { ok: false; error: string };

/* ---------- Adaptateur ---------- */

export class HubSpotAdapter implements CrmAdapter {
  readonly provider = "hubspot" as const;
  constructor(private readonly client: HubSpotClient) {}

  ping() { return this.client.ping(); }

  async pushLead(lead: Lead, facts: PushFacts, existing: { contactId: string | null; dealId: string | null } | null): Promise<PushResult> {
    const custom = await this.client.ensureProperties();
    const contact = await this.client.upsertContact(lead.email, leadToContactProps(lead, facts, custom));
    const dealProps = leadToDealProps(lead, facts, custom);
    let dealId = existing?.dealId ?? null;
    let dealCreated = false;
    if (dealId) {
      try {
        await this.client.updateDeal(dealId, dealProps);
      } catch (e) {
        // Transaction supprimée dans HubSpot depuis le dernier envoi : on en crée une nouvelle.
        if (e instanceof HubSpotError && e.kind === "not_found") dealId = null;
        else throw e;
      }
    }
    if (!dealId) {
      dealId = (await this.client.createDeal(dealProps, contact.id)).id;
      dealCreated = true;
    }
    return { contactId: contact.id, dealId, contactCreated: contact.created, dealCreated, customProperties: custom };
  }

  async listRecentContacts(sinceMs: number, limit: number): Promise<CrmContact[]> {
    const list = await this.client.listRecentContacts(sinceMs, limit);
    return list.map((c) => ({
      id: c.id, email: c.properties.email ?? "", firstName: c.properties.firstname ?? "", lastName: c.properties.lastname ?? "",
      company: c.properties.company ?? "", phone: c.properties.phone ?? null, jobTitle: c.properties.jobtitle ?? null,
    }));
  }
}

/* ---------- Client selon le mode ---------- */

async function clientFor(ctx: SyncCtx, info: IntegrationInfo): Promise<HubSpotClient> {
  if (ctx.client) return ctx.client;
  if (ctx.repo.mode === "demo" || info.simulated) {
    const leads = await ctx.repo.listLeads(ctx.orgId);
    // Un contact déjà présent côté Priora : l'import doit l'ignorer (démonstration du dédoublonnage).
    const duplicate = leads.find((l) => l.email.endsWith(".example"))?.email;
    return new HubSpotClient({ token: "demo", fetch: createFakeHubSpotFetch(fakeHubSpotKey(ctx.orgId, ctx.repo.scope), duplicate), maxWaitMs: 400 });
  }
  const token = await readToken(ctx.orgId, PROVIDER);
  if (!token) throw new HubSpotError("auth", "Aucun jeton HubSpot enregistré : reconnectez HubSpot.", 401);
  return new HubSpotClient({ token });
}

async function connectedClient(ctx: SyncCtx): Promise<{ client: HubSpotClient; info: IntegrationInfo } | { error: string }> {
  const info = await ctx.repo.getIntegration(ctx.orgId, PROVIDER);
  if (!info || info.status === "disconnected") return { error: "HubSpot n'est pas connecté. Un administrateur peut le connecter dans Réglages, Intégrations." };
  try {
    return { client: await clientFor(ctx, info), info };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Connexion à HubSpot impossible." };
  }
}

/* ---------- Journal et suites d'un échec ---------- */

const errorText = (e: unknown): string => (e instanceof HubSpotError ? e.message : e instanceof Error ? e.message : "Erreur inconnue.");

async function logResult(
  ctx: SyncCtx, info: IntegrationInfo, direction: "push" | "pull", result: { ok: true; message: string } | { ok: false; error: string; auth?: boolean }, leadId: string | null,
): Promise<void> {
  try {
    const entry = await ctx.repo.addSyncLog(ctx.orgId, { provider: PROVIDER, direction, status: result.ok ? "success" : "error", message: result.ok ? result.message : result.error, leadId });
    const now = new Date().toISOString();
    if (result.ok) await ctx.repo.saveIntegration(ctx.orgId, { ...info, status: "connected", lastSyncAt: now });
    else {
      // Un jeton refusé met l'intégration en erreur (visible dans Réglages) ; les autres échecs sont ponctuels.
      if (result.auth) await ctx.repo.saveIntegration(ctx.orgId, { ...info, status: "error" });
      await notifySyncFailed(ctx.repo, ctx.orgId, entry.id, result.error, leadId);
    }
  } catch (e) {
    console.error("[priora] journal de synchronisation :", e instanceof Error ? e.message : e);
  }
}

/* ---------- Envoi d'un lead ---------- */

export async function pushLead(ctx: SyncCtx, leadId: string, trigger: "manual" | "auto"): Promise<SyncOutcome> {
  const conn = await connectedClient(ctx);
  if ("error" in conn) return { ok: false, error: conn.error };
  const detail = await ctx.repo.getLeadDetail(ctx.orgId, leadId);
  if (!detail) return { ok: false, error: "Lead introuvable." };
  const { lead, score, analysis } = detail;
  const facts: PushFacts = { score: score?.total ?? null, verdict: analysis?.content.verdict.decision ?? null, summary: analysis?.content.summary ?? null, status: lead.status };
  const name = fullName(lead);
  try {
    const link = await ctx.repo.getCrmLink(ctx.orgId, leadId, PROVIDER);
    const r = await new HubSpotAdapter(conn.client).pushLead(lead, facts, link ? { contactId: link.contactId, dealId: link.dealId } : null);
    await ctx.repo.saveCrmLink(ctx.orgId, { leadId, provider: PROVIDER, contactId: r.contactId, dealId: r.dealId });
    const message = [
      `${name} : contact ${r.contactCreated ? "créé" : "mis à jour"}, transaction ${r.dealCreated ? "créée" : "mise à jour"}`,
      facts.score !== null ? ` (score ${facts.score}/100)` : "",
      r.customProperties ? "" : ". Propriétés personnalisées indisponibles : score et verdict placés dans la description de la transaction",
      trigger === "auto" ? " [envoi automatique]" : "",
      ".",
    ].join("");
    await logResult(ctx, conn.info, "push", { ok: true, message }, leadId);
    return { ok: true, message };
  } catch (e) {
    const error = `${name} : ${errorText(e)}`;
    await logResult(ctx, conn.info, "push", { ok: false, error, auth: e instanceof HubSpotError && e.kind === "auth" }, leadId);
    return { ok: false, error: errorText(e) };
  }
}

/** Envoi automatique à la qualification et au gain, si l'intégration est connectée et l'option active. Ne lève jamais. */
export async function autoPushIfEnabled(ctx: SyncCtx, leadId: string): Promise<void> {
  try {
    const info = await ctx.repo.getIntegration(ctx.orgId, PROVIDER);
    if (!info || info.status !== "connected" || !info.autoPush) return;
    await pushLead(ctx, leadId, "auto");
  } catch (e) {
    console.error("[priora] envoi automatique HubSpot :", e instanceof Error ? e.message : e);
  }
}

/* ---------- Import ---------- */

const IMPORT_MAX = 25;

export async function importRecentContacts(ctx: SyncCtx, days = 30): Promise<SyncOutcome & { created?: number; skipped?: number }> {
  const conn = await connectedClient(ctx);
  if ("error" in conn) return { ok: false, error: conn.error };
  try {
    const adapter = new HubSpotAdapter(conn.client);
    const contacts = await adapter.listRecentContacts(Date.now() - days * 86_400_000, 50);
    let created = 0;
    let duplicates = 0;
    let invalid = 0;
    for (const c of contacts) {
      if (created >= IMPORT_MAX) break;
      const input = contactToLeadInput({ id: c.id, properties: { email: c.email, firstname: c.firstName, lastname: c.lastName, company: c.company, phone: c.phone, jobtitle: c.jobTitle } });
      if (!input) { invalid++; continue; }
      // Sans doublon : un contact dont l'email correspond déjà à un lead (quelle que soit sa date) est ignoré.
      if (await ctx.repo.findLeadByEmail(ctx.orgId, input.email)) { duplicates++; continue; }
      const lead = await ingestLead(ctx.repo, ctx.orgId, input, { source: "crm", enrich: true, ai: "never" });
      await ctx.repo.saveCrmLink(ctx.orgId, { leadId: lead.id, provider: PROVIDER, contactId: c.id, dealId: null });
      created++;
    }
    const message = `Import des contacts des ${days} derniers jours : ${created} lead${created > 1 ? "s" : ""} créé${created > 1 ? "s" : ""}, ${duplicates} doublon${duplicates > 1 ? "s" : ""} ignoré${duplicates > 1 ? "s" : ""}${invalid ? `, ${invalid} contact${invalid > 1 ? "s" : ""} sans email valide ignoré${invalid > 1 ? "s" : ""}` : ""}.`;
    await logResult(ctx, conn.info, "pull", { ok: true, message }, null);
    return { ok: true, message, created, skipped: duplicates + invalid };
  } catch (e) {
    await logResult(ctx, conn.info, "pull", { ok: false, error: `Import : ${errorText(e)}`, auth: e instanceof HubSpotError && e.kind === "auth" }, null);
    return { ok: false, error: errorText(e) };
  }
}

/* ---------- Connexion ---------- */

export const HUBSPOT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,300}$/;

/**
 * Connecte HubSpot. Mode démo : connexion SIMULÉE (aucun jeton demandé ni stocké).
 * Mode Supabase : le jeton est vérifié auprès de HubSpot, chiffré, puis stocké ; il n'est jamais renvoyé.
 */
export async function connectHubSpot(repo: Repository, orgId: string, token: string | null): Promise<SyncOutcome> {
  const now = new Date().toISOString();
  if (repo.mode === "demo") {
    await repo.saveIntegration(orgId, { provider: PROVIDER, status: "connected", tokenHint: null, simulated: true, autoPush: true, connectedAt: now, lastSyncAt: null });
    return { ok: true, message: "Connexion simulée : aucun jeton n'est demandé ni stocké en mode démo." };
  }
  const status = secretsStatus();
  if (!status.ok) return { ok: false, error: status.reason };
  const clean = (token ?? "").trim();
  if (!HUBSPOT_TOKEN_PATTERN.test(clean)) return { ok: false, error: "Jeton invalide : collez le jeton d'accès de l'application privée HubSpot (il commence par « pat- »)." };
  try {
    await new HubSpotClient({ token: clean }).ping();
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
  try {
    await saveToken(orgId, PROVIDER, clean);
    const previous = await repo.getIntegration(orgId, PROVIDER);
    await repo.saveIntegration(orgId, { provider: PROVIDER, status: "connected", tokenHint: clean.slice(-4), simulated: false, autoPush: previous?.autoPush ?? true, connectedAt: now, lastSyncAt: previous?.lastSyncAt ?? null });
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
  return { ok: true, message: "HubSpot est connecté." };
}

export async function disconnectHubSpot(repo: Repository, orgId: string): Promise<void> {
  if (repo.mode === "supabase") await deleteToken(orgId, PROVIDER);
  await repo.deleteIntegration(orgId, PROVIDER);
}
