import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Contrôle des droits par rôle sur les actions serveur, de bout en bout en mode démo :
 * cookie "Voir en tant que" -> session -> permission -> repository. Seuls Next.js (cookies, cache, navigation) est simulé.
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

import { bulkReassignAction, reassignLeadAction } from "./assignment";
import { addActivityAction, deleteLeadAction, importLeadsChunk, moveLead } from "./leads";
import { regenerateWebhookKey, saveIcpAction, saveObjectionAction, saveOrgNameAction, saveOrgSettingsAction } from "./settings";
import { changeMemberRoleAction, inviteMemberAction, setMemberActiveAction } from "./team";
import { demoRepository } from "@/lib/repo/demo";
import { memberId } from "@/lib/demo/team";
import { DEMO_ORGS } from "@/lib/demo/orgs";
import { requirePermission } from "@/lib/session";
import { DENIED_MESSAGE } from "@/lib/team/permissions";

const ORG = DEMO_ORGS[0]!.id;
const asSlot = (slot: string) => { jar = { priora_demo_org: "maintia", priora_demo_user: memberId("maintia", slot) }; };
const SALES1 = memberId("maintia", "sales-1");
const SALES2 = memberId("maintia", "sales-2");
const MANAGER = memberId("maintia", "manager");
const ADMIN = memberId("maintia", "admin");

async function openLead(ownerId: string | "any-other-than", except?: string) {
  const leads = await demoRepository.listLeads(ORG);
  const l = leads.find((x) => x.status === "new" && (ownerId === "any-other-than" ? x.ownerId !== except && x.ownerId !== null : x.ownerId === ownerId));
  if (!l) throw new Error("Lead de test introuvable");
  return l;
}

beforeEach(() => asSlot("admin"));

describe("commercial : aucune action d'administration", () => {
  beforeEach(() => asSlot("sales-1"));

  it("ne peut ni réattribuer, ni réattribuer en masse", async () => {
    const mine = await openLead(SALES1);
    expect(await reassignLeadAction(mine.id, SALES2)).toEqual({ ok: false, error: DENIED_MESSAGE });
    expect(await bulkReassignAction([mine.id], SALES2)).toEqual({ ok: false, error: DENIED_MESSAGE });
    expect((await demoRepository.getLeadDetail(ORG, mine.id))?.lead.ownerId).toBe(SALES1);
  });

  it("ne peut ni inviter, ni changer un rôle, ni désactiver un membre", async () => {
    expect(await inviteMemberAction({ email: "x@y.example", role: "admin" })).toEqual({ ok: false, error: DENIED_MESSAGE });
    expect(await changeMemberRoleAction(SALES2, "manager")).toEqual({ ok: false, error: DENIED_MESSAGE });
    expect(await setMemberActiveAction(SALES2, false)).toEqual({ ok: false, error: DENIED_MESSAGE });
    const members = await demoRepository.listMembers(ORG);
    expect(members.find((m) => m.userId === SALES2)).toMatchObject({ role: "commercial", active: true });
    expect(members).toHaveLength(5);
  });

  it("ne peut modifier ni les réglages, ni la cible, ni la clé webhook, ni les objections", async () => {
    const icp = await demoRepository.getIcp(ORG);
    const { orgId: _o, ...values } = icp;
    void _o;
    expect(await saveIcpAction(values)).toEqual({ ok: false, error: DENIED_MESSAGE });
    expect(await saveOrgNameAction("Piratage")).toEqual({ ok: false, error: DENIED_MESSAGE });
    expect(await regenerateWebhookKey()).toEqual({ ok: false, error: DENIED_MESSAGE });
    expect(await saveObjectionAction({ objection: "Hack", response: "Hack", category: "x" })).toEqual({ ok: false, error: DENIED_MESSAGE });
    const settings = await demoRepository.getOrgSettings(ORG);
    expect(await saveOrgSettingsAction({ ...settings, commercialsSeeAll: true })).toEqual({ ok: false, error: DENIED_MESSAGE });
    expect((await demoRepository.getOrgSettings(ORG)).commercialsSeeAll).toBe(false);
    expect((await demoRepository.getOrganization(ORG))?.name).not.toBe("Piratage");
  });

  it("ne peut ni supprimer un lead, ni importer un CSV", async () => {
    const mine = await openLead(SALES1);
    expect(await deleteLeadAction(mine.id)).toEqual({ ok: false, error: DENIED_MESSAGE });
    expect(await demoRepository.getLeadDetail(ORG, mine.id)).not.toBeNull();
    const imp = await importLeadsChunk([{ row: 2, data: { email: "a@b.example", company: "Test" } }], false);
    expect(imp.created).toBe(0);
    expect(imp.errors[0]?.message).toBe(DENIED_MESSAGE);
  });

  it("ne peut pas ouvrir les pages réservées (403)", async () => {
    await expect(requirePermission("dashboard.view")).rejects.toThrow("NEXT_FORBIDDEN");
    await expect(requirePermission("team.view")).rejects.toThrow("NEXT_FORBIDDEN");
    await expect(requirePermission("settings.view")).rejects.toThrow("NEXT_FORBIDDEN");
  });

  it("modifie ses propres leads : statut, activité et premier contact", async () => {
    const mine = await openLead(SALES1);
    expect(mine.firstContactedAt).toBeNull();
    expect(await addActivityAction({ leadId: mine.id, type: "call", content: "Appel passé" })).toEqual({ ok: true });
    const after = (await demoRepository.getLeadDetail(ORG, mine.id))!;
    expect(after.lead.firstContactedAt).not.toBeNull();
    expect(after.activities[0]).toMatchObject({ type: "call", authorId: SALES1 });
    expect(await moveLead({ leadId: mine.id, status: "qualified" })).toEqual({ ok: true });
  });

  it("ne peut ni modifier ni commenter le lead d'un autre commercial", async () => {
    const other = await openLead("any-other-than", SALES1);
    const before = (await demoRepository.getLeadDetail(ORG, other.id))!;
    const move = await moveLead({ leadId: other.id, status: "qualified" });
    expect(move.ok).toBe(false);
    const note = await addActivityAction({ leadId: other.id, type: "note", content: "Intrusion" });
    expect(note.ok).toBe(false);
    const after = (await demoRepository.getLeadDetail(ORG, other.id))!;
    expect(after.lead.status).toBe(before.lead.status);
    expect(after.activities).toHaveLength(before.activities.length);
  });

  it("un identifiant de lead invalide ne fuit rien", async () => {
    expect((await moveLead({ leadId: "pas-un-uuid", status: "contacted" })).ok).toBe(false);
  });
});

describe("manager : voit tout et réattribue, sans administrer", () => {
  beforeEach(() => asSlot("manager"));

  it("réattribue un lead et l'historique garde la trace", async () => {
    const lead = await openLead(SALES1);
    expect(await reassignLeadAction(lead.id, SALES2)).toEqual({ ok: true });
    const after = (await demoRepository.getLeadDetail(ORG, lead.id))!;
    expect(after.lead.ownerId).toBe(SALES2);
    expect(after.activities[0]).toMatchObject({ type: "assignment", authorId: MANAGER });
    expect(after.activities[0]!.content).toMatch(/Réattribué à .* par Karim Delorme/);
  });

  it("réattribue en masse", async () => {
    const leads = (await demoRepository.listLeads(ORG)).filter((l) => l.ownerId === SALES2 && l.status === "new").slice(0, 3);
    const res = await bulkReassignAction(leads.map((l) => l.id), SALES1);
    expect(res).toEqual({ ok: true, changed: 3 });
    for (const l of leads) expect((await demoRepository.getLeadDetail(ORG, l.id))?.lead.ownerId).toBe(SALES1);
  });

  it("refuse une cible qui n'est pas un commercial actif", async () => {
    const lead = (await demoRepository.listLeads(ORG)).find((l) => l.status === "new")!;
    const toManager = await reassignLeadAction(lead.id, ADMIN);
    expect(toManager.ok).toBe(false);
    const toUnknown = await reassignLeadAction(lead.id, "00000000-0000-4000-8000-00000000dead");
    expect(toUnknown.ok).toBe(false);
  });

  it("refuse les demandes mal formées ou trop grosses", async () => {
    expect((await bulkReassignAction([], SALES1)).ok).toBe(false);
    expect((await bulkReassignAction(["x"], SALES1)).ok).toBe(false);
    const many = Array.from({ length: 101 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect((await bulkReassignAction(many, SALES1)).ok).toBe(false);
  });

  it("ne peut pas administrer l'équipe ni les réglages", async () => {
    expect(await inviteMemberAction({ email: "x@y.example", role: "commercial" })).toEqual({ ok: false, error: DENIED_MESSAGE });
    expect(await setMemberActiveAction(SALES1, false)).toEqual({ ok: false, error: DENIED_MESSAGE });
    const icp = await demoRepository.getIcp(ORG);
    const { orgId: _o, ...values } = icp;
    void _o;
    expect(await saveIcpAction(values)).toEqual({ ok: false, error: DENIED_MESSAGE });
  });

  it("gère la bibliothèque d'objections et ouvre le tableau de bord", async () => {
    expect((await saveObjectionAction({ objection: "Objection de test", response: "Réponse de test", category: "Test" })).ok).toBe(true);
    await expect(requirePermission("dashboard.view")).resolves.toBeDefined();
    await expect(requirePermission("team.manage")).rejects.toThrow("NEXT_FORBIDDEN");
  });

  it("ne peut pas appeler les actions d'équipe en se faisant passer pour un admin via un identifiant", async () => {
    expect(await changeMemberRoleAction(MANAGER, "admin")).toEqual({ ok: false, error: DENIED_MESSAGE });
  });
});

describe("admin : gère l'équipe, avec garde-fous", () => {
  beforeEach(() => asSlot("admin"));

  it("invite un membre (simulé en démo) puis change son rôle et le désactive", async () => {
    const res = await inviteMemberAction({ email: "Nouvelle.Recrue@Maintia.example", name: "Nouvelle Recrue", role: "commercial" });
    expect(res).toEqual({ ok: true, simulated: true });
    const added = (await demoRepository.listMembers(ORG)).find((m) => m.email === "nouvelle.recrue@maintia.example")!;
    expect(added).toMatchObject({ role: "commercial", status: "invited", active: true, name: "Nouvelle Recrue" });

    expect(await changeMemberRoleAction(added.userId, "manager")).toEqual({ ok: true });
    expect((await demoRepository.listMembers(ORG)).find((m) => m.userId === added.userId)?.role).toBe("manager");

    const off = await setMemberActiveAction(added.userId, false);
    expect(off).toEqual({ ok: true, openLeads: 0 });
    expect((await demoRepository.listMembers(ORG)).find((m) => m.userId === added.userId)?.active).toBe(false);
    expect(await setMemberActiveAction(added.userId, true)).toMatchObject({ ok: true });
  });

  it("refuse un doublon d'email et un email invalide", async () => {
    const dup = await inviteMemberAction({ email: "THEO.LAMBERT@maintia.example", role: "commercial" });
    expect(dup.ok).toBe(false);
    expect((await inviteMemberAction({ email: "pas-un-email", role: "commercial" })).ok).toBe(false);
    expect((await inviteMemberAction({ email: "ok@maintia.example", role: "superadmin" })).ok).toBe(false);
  });

  it("ne peut ni changer son propre rôle ni se désactiver, ni retirer le dernier administrateur", async () => {
    expect((await changeMemberRoleAction(ADMIN, "commercial")).ok).toBe(false);
    expect((await setMemberActiveAction(ADMIN, false)).ok).toBe(false);
    // Un second admin peut être rétrogradé tant qu'il en reste un autre ; pas l'unique restant.
    asSlot("manager");
    asSlot("admin");
    expect((await changeMemberRoleAction(MANAGER, "admin")).ok).toBe(true);
    expect((await changeMemberRoleAction(MANAGER, "manager")).ok).toBe(true);
  });

  it("signale les leads ouverts d'un commercial désactivé", async () => {
    const res = await setMemberActiveAction(SALES2, false);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.openLeads).toBeGreaterThan(0);
    await setMemberActiveAction(SALES2, true);
  });

  it("un membre désactivé n'est plus éligible à l'attribution", async () => {
    await setMemberActiveAction(SALES2, false);
    asSlot("manager");
    const lead = (await demoRepository.listLeads(ORG)).find((l) => l.status === "new" && l.ownerId === SALES1)!;
    expect((await reassignLeadAction(lead.id, SALES2)).ok).toBe(false);
    asSlot("admin");
    await setMemberActiveAction(SALES2, true);
  });

  it("enregistre les réglages d'attribution et refuse une règle qui vise un non-commercial", async () => {
    const s = await demoRepository.getOrgSettings(ORG);
    const rule = { id: "r1", label: "Gros comptes", sources: [], keywords: [], minScore: 80, assigneeId: SALES1 };
    expect((await saveOrgSettingsAction({ ...s, assignment: { mode: "segments", rules: [rule] } })).ok).toBe(true);
    expect((await demoRepository.getOrgSettings(ORG)).assignment.rules).toHaveLength(1);
    expect((await saveOrgSettingsAction({ ...s, assignment: { mode: "segments", rules: [{ ...rule, assigneeId: MANAGER }] } })).ok).toBe(false);
    expect((await saveOrgSettingsAction({ ...s, assignment: { mode: "segments", rules: [] } })).ok).toBe(false);
    expect((await saveOrgSettingsAction({ ...s, speedTargets: { callNowMinutes: 0, nurtureMinutes: 120 } })).ok).toBe(false);
    expect((await saveOrgSettingsAction({ ...s, assignment: { mode: "round_robin", rules: [] } })).ok).toBe(true);
  });

  it("modifie la cible idéale avec des personas", async () => {
    const icp = await demoRepository.getIcp(ORG);
    const { orgId: _o, ...values } = icp;
    void _o;
    const personas = [{ name: "Test", role: "Directeur", challenges: "Réduire les pannes", objections: ["Trop cher"] }];
    expect((await saveIcpAction({ ...values, personas })).ok).toBe(true);
    expect((await demoRepository.getIcp(ORG)).personas).toEqual(personas);
    expect((await saveIcpAction({ ...values, personas: [{ name: "", role: "", challenges: "", objections: [] }] })).ok).toBe(false);
  });
});
