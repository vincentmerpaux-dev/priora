import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Droits par rôle sur les actions S3 (calibration, intégrations, email entrant, notifications), de bout en bout en mode démo :
 * cookie "Voir en tant que" -> session -> permission -> repository. Seul Next.js est simulé.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); },
  forbidden: () => { throw new Error("NEXT_FORBIDDEN"); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));
let jar: Record<string, string> = {};
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (jar[n] ? { value: jar[n] } : undefined) }) }));
vi.mock("@/lib/repo", async () => {
  const { demoRepository } = await import("@/lib/repo/demo");
  return { getRepo: async () => demoRepository, getPublicRepo: () => null };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { applySuggestionAction, restoreVersionAction } from "./calibration";
import { connectHubSpotAction, disconnectHubSpotAction, importHubSpotAction, pushLeadToHubSpotAction, setDemoIncidentAction, setHubSpotAutoPushAction } from "./integrations";
import { createLeadFromEmailAction, previewEmailAction, regenerateInboundKey } from "./inbound";
import { moveLead } from "./leads";
import { markNotificationsReadAction } from "./notifications";
import { DEMO_ORGS } from "@/lib/demo/orgs";
import { memberId } from "@/lib/demo/team";
import { demoRepository } from "@/lib/repo/demo";
import { requirePermission } from "@/lib/session";
import { can, DENIED_MESSAGE } from "@/lib/team/permissions";

const ORG = DEMO_ORGS[0]!.id;
const asSlot = (slot: string) => { jar = { priora_demo_org: "maintia", priora_demo_user: memberId("maintia", slot) }; };
const SALES1 = memberId("maintia", "sales-1");
const SALES2 = memberId("maintia", "sales-2");
const ADMIN = memberId("maintia", "admin");
const DENIED = { ok: false, error: DENIED_MESSAGE };
const MAIL = "From: Test Droits <test.droits@droits-test.example>\nSubject: Demande de devis\n\nBonjour, je voudrais un devis. Merci de me rappeler.";

beforeEach(() => asSlot("admin"));

describe("matrice des droits S3", () => {
  it("calibration : manager et admin consultent, seul l'admin applique ; le commercial n'a rien", () => {
    expect([can("admin", "calibration.view"), can("manager", "calibration.view"), can("commercial", "calibration.view")]).toEqual([true, true, false]);
    expect([can("admin", "calibration.apply"), can("manager", "calibration.apply"), can("commercial", "calibration.apply")]).toEqual([true, false, false]);
  });
  it("intégrations : admin seulement", () => {
    expect([can("admin", "integrations.manage"), can("manager", "integrations.manage"), can("commercial", "integrations.manage")]).toEqual([true, false, false]);
  });
});

describe("pages protégées côté serveur", () => {
  it("/calibration : le commercial est refusé, le manager et l'admin passent", async () => {
    asSlot("sales-1");
    await expect(requirePermission("calibration.view")).rejects.toThrow("NEXT_FORBIDDEN");
    asSlot("manager");
    await expect(requirePermission("calibration.view")).resolves.toBeTruthy();
    asSlot("admin");
    await expect(requirePermission("calibration.view")).resolves.toBeTruthy();
  });
  it("intégrations : commercial et manager refusés, l'admin passe", async () => {
    asSlot("sales-1");
    await expect(requirePermission("integrations.manage")).rejects.toThrow("NEXT_FORBIDDEN");
    asSlot("manager");
    await expect(requirePermission("integrations.manage")).rejects.toThrow("NEXT_FORBIDDEN");
    asSlot("admin");
    await expect(requirePermission("integrations.manage")).resolves.toBeTruthy();
  });
});

describe("calibration : actions", () => {
  it.each(["sales-1", "manager"])("%s ne peut ni appliquer une suggestion ni restaurer une version", async (slot) => {
    asSlot(slot);
    expect(await applySuggestionAction(90)).toEqual(DENIED);
    expect(await restoreVersionAction("00000000-0000-4000-8000-000000000001")).toEqual(DENIED);
    expect(await demoRepository.listScoreVersions(ORG)).toHaveLength(0);
  });

  it("l'admin applique puis revient en arrière ; une période ou un identifiant invalide est refusé", async () => {
    expect(await applySuggestionAction(12)).toEqual({ ok: false, error: "Période invalide." });
    expect(await restoreVersionAction("pas-un-uuid")).toEqual({ ok: false, error: "Version introuvable." });
    const applied = await applySuggestionAction(90);
    expect(applied).toMatchObject({ ok: true, version: 2 });
    const versions = await demoRepository.listScoreVersions(ORG);
    const initial = versions.find((v) => v.source === "initial")!;
    expect(await restoreVersionAction(initial.id)).toMatchObject({ ok: true, version: 3 });
  });
});

describe("intégrations : actions", () => {
  it.each(["sales-1", "manager"])("%s ne peut ni connecter, ni déconnecter, ni importer, ni régler l'envoi automatique", async (slot) => {
    asSlot(slot);
    expect(await connectHubSpotAction(null)).toEqual(DENIED);
    expect(await disconnectHubSpotAction()).toEqual(DENIED);
    expect(await importHubSpotAction()).toEqual(DENIED);
    expect(await setHubSpotAutoPushAction(false)).toEqual(DENIED);
    expect(await setDemoIncidentAction("401")).toEqual(DENIED);
    expect(await demoRepository.getIntegration(ORG, "hubspot")).toBeNull();
  });

  it("l'admin connecte (simulation), importe, règle l'envoi automatique et déconnecte", async () => {
    expect(await connectHubSpotAction(null)).toMatchObject({ ok: true });
    expect(await importHubSpotAction()).toMatchObject({ ok: true });
    expect(await setHubSpotAutoPushAction(false)).toEqual({ ok: true });
    expect((await demoRepository.getIntegration(ORG, "hubspot"))?.autoPush).toBe(false);
    expect(await setDemoIncidentAction("inconnu")).toMatchObject({ ok: false });
    expect(await disconnectHubSpotAction()).toEqual({ ok: true });
    expect(await demoRepository.getIntegration(ORG, "hubspot")).toBeNull();
  });

  it("envoi d'un lead : le commercial responsable peut envoyer son lead, pas celui d'un collègue", async () => {
    await connectHubSpotAction(null);
    const leads = await demoRepository.listLeads(ORG);
    const mine = leads.find((l) => l.ownerId === SALES1)!;
    const theirs = leads.find((l) => l.ownerId === SALES2)!;
    asSlot("sales-1");
    expect(await pushLeadToHubSpotAction(mine.id)).toMatchObject({ ok: true });
    expect(await pushLeadToHubSpotAction(theirs.id)).toMatchObject({ ok: false });
    expect(await pushLeadToHubSpotAction("pas-un-uuid")).toEqual({ ok: false, error: "Lead introuvable." });
  });

  it("l'envoi automatique part à la qualification et au gain, pas aux autres statuts", async () => {
    asSlot("admin");
    await connectHubSpotAction(null);
    await setHubSpotAutoPushAction(true);
    const leads = await demoRepository.listLeads(ORG);
    const candidates = leads.filter((l) => l.status === "new" && l.ownerId === SALES1 && !l.firstContactedAt);
    let lead = candidates[0]!;
    for (const c of candidates) if (!(await demoRepository.getCrmLink(ORG, c.id, "hubspot"))) { lead = c; break; }
    expect(await moveLead({ leadId: lead.id, status: "contacted" })).toEqual({ ok: true });
    expect(await demoRepository.getCrmLink(ORG, lead.id, "hubspot")).toBeNull();
    expect(await moveLead({ leadId: lead.id, status: "qualified" })).toEqual({ ok: true });
    const link = await demoRepository.getCrmLink(ORG, lead.id, "hubspot");
    expect(link?.dealId).toBeTruthy();
    expect((await demoRepository.listSyncLogs(ORG, 3))[0]).toMatchObject({ direction: "push", status: "success", leadId: lead.id });
  });
});

describe("email entrant : actions", () => {
  it.each(["sales-1", "manager"])("%s ne peut ni générer de clé, ni utiliser le simulateur", async (slot) => {
    asSlot(slot);
    expect(await regenerateInboundKey()).toEqual(DENIED);
    expect(await previewEmailAction(MAIL)).toEqual(DENIED);
    expect(await createLeadFromEmailAction(MAIL)).toEqual(DENIED);
    expect((await demoRepository.getInboundKeyInfo(ORG)).prefix).toBeNull();
  });

  it("l'admin génère une clé (affichée une fois, seul le préfixe reste), prévisualise sans créer, puis crée", async () => {
    const k = await regenerateInboundKey();
    expect(k).toMatchObject({ ok: true });
    if (!k.ok) return;
    expect(k.key.startsWith("eml_")).toBe(true);
    expect((await demoRepository.getInboundKeyInfo(ORG)).prefix).toBe(k.prefix);
    expect(JSON.stringify(await demoRepository.getInboundKeyInfo(ORG))).not.toContain(k.key);

    const before = (await demoRepository.listLeads(ORG)).length;
    const p = await previewEmailAction(MAIL);
    expect(p).toMatchObject({ ok: true, preview: { kind: "new", lead: { email: "test.droits@droits-test.example", firstName: "Test", lastName: "Droits" } } });
    expect((await demoRepository.listLeads(ORG)).length).toBe(before);

    const c = await createLeadFromEmailAction(MAIL);
    expect(c).toMatchObject({ ok: true, outcome: "created" });
    expect((await demoRepository.listLeads(ORG)).length).toBe(before + 1);
    const again = await createLeadFromEmailAction(MAIL);
    expect(again).toMatchObject({ ok: true, outcome: "duplicate" });
    expect((await demoRepository.listLeads(ORG)).length).toBe(before + 1);
  });

  it("refuse un email vide, sans expéditeur ou trop long", async () => {
    expect(await previewEmailAction("   ")).toMatchObject({ ok: false });
    expect(await previewEmailAction("Bonjour sans expéditeur")).toMatchObject({ ok: false });
    expect(await previewEmailAction("x".repeat(60_001))).toMatchObject({ ok: false });
  });

  it("annonce un message automatique comme ignoré", async () => {
    const r = await previewEmailAction("From: robot@x.example\nSubject: Réponse automatique : absente\nAuto-Submitted: auto-replied\n\nJe suis absente.");
    expect(r).toMatchObject({ ok: true, preview: { kind: "skipped" } });
  });
});

describe("résultats gagné / perdu : un outcome à chaque passage", () => {
  it("crée un outcome avec motif structuré pour Perdu et Gagné, et refuse un motif inconnu ou l'absence de motif de perte", async () => {
    asSlot("manager");
    const leads = (await demoRepository.listLeads(ORG)).filter((l) => l.status === "new");
    const [a, b, c] = [leads[0]!, leads[1]!, leads[2]!];
    expect(await moveLead({ leadId: a.id, status: "lost" })).toEqual({ ok: false, error: "Indiquez un motif de perte." });
    expect(await moveLead({ leadId: a.id, status: "lost", reasonCode: "Inventé" })).toEqual({ ok: false, error: "Motif inconnu." });
    expect(await moveLead({ leadId: a.id, status: "lost", reasonCode: "Prix" })).toEqual({ ok: true });
    expect((await demoRepository.getLeadDetail(ORG, a.id))?.outcome).toMatchObject({ result: "lost", reasonCode: "Prix" });
    // Gagné : motif facultatif.
    expect(await moveLead({ leadId: b.id, status: "won" })).toEqual({ ok: true });
    expect((await demoRepository.getLeadDetail(ORG, b.id))?.outcome).toMatchObject({ result: "won", reason: "", reasonCode: null });
    expect(await moveLead({ leadId: c.id, status: "won", reasonCode: "Réactivité", reason: "Rappel en 3 minutes" })).toEqual({ ok: true });
    expect((await demoRepository.getLeadDetail(ORG, c.id))?.outcome).toMatchObject({ result: "won", reasonCode: "Réactivité", reason: "Rappel en 3 minutes" });
    // Un code de perte n'est pas valable pour un gain.
    expect(await moveLead({ leadId: a.id, status: "won", reasonCode: "Concurrent" })).toEqual({ ok: false, error: "Motif inconnu." });
    // Revenir à un statut ouvert retire l'outcome.
    expect(await moveLead({ leadId: c.id, status: "contacted" })).toEqual({ ok: true });
    expect((await demoRepository.getLeadDetail(ORG, c.id))?.outcome).toBeNull();
  });

  it("garantit un outcome même quand le statut change sans passer par l'action (repository)", async () => {
    const lead = (await demoRepository.listLeads(ORG)).find((l) => l.status === "new" && !l.id.startsWith("x"))!;
    await demoRepository.updateLeadStatus(ORG, lead.id, "won");
    expect((await demoRepository.getLeadDetail(ORG, lead.id))?.outcome).toMatchObject({ result: "won" });
    await demoRepository.updateLeadStatus(ORG, lead.id, "lost");
    expect((await demoRepository.getLeadDetail(ORG, lead.id))?.outcome).toMatchObject({ result: "lost" });
  });
});

describe("notifications : chacun ne marque que les siennes", () => {
  it("marque les notifications de l'utilisateur courant, jamais celles d'un autre", async () => {
    const mine = await demoRepository.addNotification(ORG, { userId: SALES1, kind: "lead_assigned", title: "A", body: "", leadId: null, dedupeKey: "t-mine" });
    const other = await demoRepository.addNotification(ORG, { userId: SALES2, kind: "lead_assigned", title: "B", body: "", leadId: null, dedupeKey: "t-other" });
    asSlot("sales-1");
    expect(await markNotificationsReadAction([other!.id, mine!.id])).toEqual({ ok: true });
    expect((await demoRepository.listNotifications(ORG, SALES1, 50)).find((n) => n.id === mine!.id)?.readAt).not.toBeNull();
    expect((await demoRepository.listNotifications(ORG, SALES2, 50)).find((n) => n.id === other!.id)?.readAt).toBeNull();
    expect(await markNotificationsReadAction(["pas-un-uuid"])).toEqual({ ok: false, error: "Demande invalide." });
    asSlot("admin");
    expect(ADMIN).toBeTruthy();
  });

  it("ne crée pas deux fois la même notification (clé de dédoublonnage)", async () => {
    const a = await demoRepository.addNotification(ORG, { userId: SALES1, kind: "lead_overdue", title: "x", body: "", leadId: null, dedupeKey: "t-dup" });
    const b = await demoRepository.addNotification(ORG, { userId: SALES1, kind: "lead_overdue", title: "x", body: "", leadId: null, dedupeKey: "t-dup" });
    expect(a).not.toBeNull();
    expect(b).toBeNull();
  });
});
