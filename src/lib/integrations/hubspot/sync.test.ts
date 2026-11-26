import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DEMO_ORG_ID } from "@/lib/demo/data";
import { memberId } from "@/lib/demo/team";
import { demoRepository as repo } from "@/lib/repo/demo";
import { decryptSecret, encryptSecret, EncryptionKeyError, loadEncryptionKey } from "../crypto";
import { fakeHubSpotState, setFakeIncident } from "./fake";
import { autoPushIfEnabled, connectHubSpot, disconnectHubSpot, importRecentContacts, pushLead } from "./sync";

const ORG = DEMO_ORG_ID;
const ADMIN = memberId("maintia", "admin");
const ctx = { repo, orgId: ORG, actorId: ADMIN };

async function aQualifiedLead(index = 0) {
  const leads = (await repo.listLeads(ORG)).filter((x) => x.verdict && x.scoreTotal !== null);
  return leads[index]!;
}

beforeEach(async () => {
  setFakeIncident(ORG, "none");
  await disconnectHubSpot(repo, ORG);
});

describe("synchronisation HubSpot en démo (faux client)", () => {
  it("refuse tant que HubSpot n'est pas connecté", async () => {
    const lead = await aQualifiedLead();
    expect(await pushLead(ctx, lead.id, "manual")).toMatchObject({ ok: false, error: expect.stringContaining("pas connecté") });
  });

  it("connexion simulée : aucun jeton stocké, marquée simulée", async () => {
    const r = await connectHubSpot(repo, ORG, null);
    expect(r.ok).toBe(true);
    expect(await repo.getIntegration(ORG, "hubspot")).toMatchObject({ status: "connected", simulated: true, tokenHint: null, autoPush: true });
  });

  it("envoie un lead : contact et transaction créés avec score et verdict, puis mis à jour sans doublon", async () => {
    await connectHubSpot(repo, ORG, null);
    const lead = await aQualifiedLead();
    const first = await pushLead(ctx, lead.id, "manual");
    expect(first).toMatchObject({ ok: true, message: expect.stringContaining("contact créé, transaction créée") });
    const link = await repo.getCrmLink(ORG, lead.id, "hubspot");
    expect(link?.contactId).toBeTruthy();
    expect(link?.dealId).toBeTruthy();

    const state = fakeHubSpotState(ORG);
    const contact = state.contacts.get(link!.contactId!)!;
    expect(contact.properties.email).toBe(lead.email);
    expect(Number(contact.properties.priora_score)).toBe(lead.scoreTotal);
    expect(contact.properties.priora_verdict).toBeTruthy();
    const deal = state.deals.get(link!.dealId!)!;
    expect(deal.properties.priora_score).toBe(String(lead.scoreTotal));
    expect(deal.properties.description).toContain("verdict");

    const dealsBefore = state.deals.size;
    await repo.updateLeadStatus(ORG, lead.id, "won");
    const second = await pushLead(ctx, lead.id, "manual");
    expect(second).toMatchObject({ ok: true, message: expect.stringContaining("contact mis à jour, transaction mise à jour") });
    expect(state.deals.size).toBe(dealsBefore);
    expect(state.deals.get(link!.dealId!)!.properties.dealstage).toBe("closedwon");
  });

  it("journalise chaque envoi (date, sens, statut, message)", async () => {
    await connectHubSpot(repo, ORG, null);
    const lead = await aQualifiedLead();
    await pushLead(ctx, lead.id, "manual");
    const [log] = await repo.listSyncLogs(ORG, 5);
    expect(log).toMatchObject({ provider: "hubspot", direction: "push", status: "success", leadId: lead.id });
    expect(log!.createdAt).toBeTruthy();
    expect((await repo.getIntegration(ORG, "hubspot"))?.lastSyncAt).toBeTruthy();
  });

  it("429 : réessai automatique, l'envoi réussit", async () => {
    await connectHubSpot(repo, ORG, null);
    setFakeIncident(ORG, "429");
    const lead = await aQualifiedLead();
    expect(await pushLead(ctx, lead.id, "manual")).toMatchObject({ ok: true });
  });

  it("401 : échec journalisé, intégration en erreur, administrateurs notifiés", async () => {
    await connectHubSpot(repo, ORG, null);
    setFakeIncident(ORG, "401");
    const lead = await aQualifiedLead();
    const r = await pushLead(ctx, lead.id, "manual");
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("401") });
    const [log] = await repo.listSyncLogs(ORG, 1);
    expect(log).toMatchObject({ status: "error", direction: "push" });
    expect((await repo.getIntegration(ORG, "hubspot"))?.status).toBe("error");
    const notes = await repo.listNotifications(ORG, ADMIN, 20);
    expect(notes.some((n) => n.kind === "sync_failed")).toBe(true);
    expect((await repo.listNotifications(ORG, memberId("maintia", "sales-1"), 50)).some((n) => n.kind === "sync_failed")).toBe(false);
  });

  it("500 : échec après réessais, journalisé", async () => {
    await connectHubSpot(repo, ORG, null);
    setFakeIncident(ORG, "500");
    const lead = await aQualifiedLead();
    expect(await pushLead(ctx, lead.id, "manual")).toMatchObject({ ok: false, error: expect.stringContaining("indisponible") });
  });

  it("envoi automatique : respecte l'option autoPush", async () => {
    await connectHubSpot(repo, ORG, null);
    const lead = await aQualifiedLead(7);
    const info = (await repo.getIntegration(ORG, "hubspot"))!;
    await repo.saveIntegration(ORG, { ...info, autoPush: false });
    await autoPushIfEnabled(ctx, lead.id);
    expect(await repo.getCrmLink(ORG, lead.id, "hubspot")).toBeNull();
    await repo.saveIntegration(ORG, { ...info, autoPush: true });
    await autoPushIfEnabled(ctx, lead.id);
    expect(await repo.getCrmLink(ORG, lead.id, "hubspot")).not.toBeNull();
  });

  it("import : crée des leads de source crm, ignore les doublons, et ne recrée rien au second passage", async () => {
    await connectHubSpot(repo, ORG, null);
    const before = (await repo.listLeads(ORG)).length;
    const r = await importRecentContacts(ctx, 30);
    expect(r).toMatchObject({ ok: true, created: 4 });
    // Le contact déjà présent côté Priora, et ceux que Priora a lui-même envoyés plus tôt, sont ignorés.
    expect(r.ok && r.skipped).toBeGreaterThanOrEqual(1);
    const leads = await repo.listLeads(ORG);
    expect(leads.length).toBe(before + 4);
    const crm = leads.filter((l) => l.source === "crm" && l.sourceDetail === "Import HubSpot");
    expect(crm).toHaveLength(4);
    expect(crm.every((l) => l.scoreTotal !== null && l.ownerId)).toBe(true);
    const again = await importRecentContacts(ctx, 30);
    expect(again).toMatchObject({ ok: true, created: 0, skipped: 4 + (r.ok ? r.skipped ?? 0 : 0) });
    expect((await repo.listLeads(ORG)).length).toBe(before + 4);
    const [log] = await repo.listSyncLogs(ORG, 1);
    expect(log).toMatchObject({ direction: "pull", status: "success" });
  });
});

describe("chiffrement des jetons", () => {
  const key = Buffer.alloc(32, 7);
  it("chiffre et déchiffre, sans jamais laisser le jeton en clair", () => {
    const blob = encryptSecret("pat-na1-secret-token", "org-1:hubspot", key);
    expect(blob).not.toContain("secret-token");
    expect(blob.startsWith("v1.")).toBe(true);
    expect(decryptSecret(blob, "org-1:hubspot", key)).toBe("pat-na1-secret-token");
    expect(encryptSecret("pat-na1-secret-token", "org-1:hubspot", key)).not.toBe(blob); // IV aléatoire
  });
  it("refuse un autre contexte, une autre clé ou des données altérées", () => {
    const blob = encryptSecret("pat-x", "org-1:hubspot", key);
    expect(() => decryptSecret(blob, "org-2:hubspot", key)).toThrow();
    expect(() => decryptSecret(blob, "org-1:hubspot", Buffer.alloc(32, 9))).toThrow();
    const parts = blob.split(".");
    parts[3] = Buffer.from("altéré").toString("base64url");
    expect(() => decryptSecret(parts.join("."), "org-1:hubspot", key)).toThrow();
  });
  it("exige une clé de 32 octets en base64", () => {
    expect(() => loadEncryptionKey(undefined)).toThrow(EncryptionKeyError);
    expect(() => loadEncryptionKey("trop-court")).toThrow(EncryptionKeyError);
    expect(loadEncryptionKey(Buffer.alloc(32, 1).toString("base64"))).toHaveLength(32);
  });
});
