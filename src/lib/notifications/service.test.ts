import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DEMO_ORG_ID } from "@/lib/demo/data";
import { ORUS_ORG_ID } from "@/lib/demo/orus";
import { memberId } from "@/lib/demo/team";
import { demoRepository as repo } from "@/lib/repo/demo";
import { reassignLeads } from "@/lib/team/service";
import { speedStatus } from "@/lib/team/speed";
import { notifyAssigned, notifyUser, syncOverdueNotifications } from "./service";

describe("notifications de retard (Appeler maintenant)", () => {
  it("prévient le responsable de chaque lead en retard, une seule fois, plus un résumé par jour pour le staff", async () => {
    const orgId = DEMO_ORG_ID;
    const settings = await repo.getOrgSettings(orgId);
    const now = new Date();
    const expected = (await repo.listLeads(orgId)).filter((l) => l.verdict === "call_now" && now.getTime() - new Date(l.createdAt).getTime() < 7 * 86_400_000 && speedStatus(l, settings, now).state === "overdue");
    expect(expected.length).toBeGreaterThan(0);

    const first = await syncOverdueNotifications(repo, orgId, now);
    expect(first.overdue).toBe(expected.length);
    expect(first.owners).toBeGreaterThan(0);
    expect(first.digests).toBe(2); // admin + manager

    for (const l of expected.slice(0, 25)) {
      const notes = await repo.listNotifications(orgId, l.ownerId!, 100);
      expect(notes.some((n) => n.kind === "lead_overdue" && n.leadId === l.id)).toBe(true);
    }
    // Un commercial ne reçoit pas le résumé ; il n'est jamais notifié pour le lead d'un collègue.
    const sales = (await repo.listNotifications(orgId, memberId("maintia", "sales-1"), 100));
    expect(sales.some((n) => n.kind === "overdue_digest")).toBe(false);
    expect(sales.filter((n) => n.kind === "lead_overdue").every((n) => expected.find((l) => l.id === n.leadId)?.ownerId === memberId("maintia", "sales-1"))).toBe(true);

    const again = await syncOverdueNotifications(repo, orgId, now);
    expect(again).toMatchObject({ owners: 0, digests: 0 });
  });

  it("ignore les leads contactés, d'un autre verdict ou trop anciens", async () => {
    const orgId = ORUS_ORG_ID;
    const now = new Date();
    await syncOverdueNotifications(repo, orgId, now);
    const leads = await repo.listLeads(orgId);
    const all = (await Promise.all((await repo.listMembers(orgId)).map((m) => repo.listNotifications(orgId, m.userId, 200)))).flat().filter((n) => n.kind === "lead_overdue");
    for (const n of all) {
      const l = leads.find((x) => x.id === n.leadId)!;
      expect(l.verdict).toBe("call_now");
      expect(l.firstContactedAt).toBeNull();
      expect(["won", "lost"]).not.toContain(l.status);
      expect(now.getTime() - new Date(l.createdAt).getTime()).toBeLessThan(7 * 86_400_000);
    }
  });
});

describe("notification d'attribution", () => {
  it("prévient le nouveau responsable lors d'une réattribution, pas celui qui s'attribue lui-même le lead", async () => {
    const orgId = DEMO_ORG_ID;
    const manager = memberId("maintia", "manager");
    const target = memberId("maintia", "sales-3");
    const lead = (await repo.listLeads(orgId)).find((l) => l.ownerId !== target && l.status === "new")!;
    const res = await reassignLeads(repo, orgId, [lead.id], target, { userId: manager, name: "Karim Delorme" });
    expect(res).toEqual({ ok: true, changed: 1 });
    const notes = await repo.listNotifications(orgId, target, 100);
    expect(notes.some((n) => n.kind === "lead_assigned" && n.leadId === lead.id)).toBe(true);

    const other = (await repo.listLeads(orgId)).find((l) => l.ownerId === memberId("maintia", "sales-2"))!;
    const before = (await repo.listNotifications(orgId, memberId("maintia", "sales-2"), 200)).length;
    await notifyAssigned(repo, other, memberId("maintia", "sales-2"), memberId("maintia", "sales-2"));
    expect((await repo.listNotifications(orgId, memberId("maintia", "sales-2"), 200)).length).toBe(before);
  });
});

describe("email optionnel via Resend", () => {
  const original = process.env.RESEND_API_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = original;
    vi.unstubAllGlobals();
  });

  it("sans RESEND_API_KEY : notification in-app uniquement, aucun appel réseau", async () => {
    delete process.env.RESEND_API_KEY;
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const n = await notifyUser(repo, DEMO_ORG_ID, memberId("maintia", "admin"), { kind: "sync_failed", title: "t", body: "b", leadId: null, dedupeKey: "resend-1" });
    expect(n).not.toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("avec la clé : n'envoie jamais aux adresses de démonstration (.example)", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", f);
    await notifyUser(repo, DEMO_ORG_ID, memberId("maintia", "admin"), { kind: "sync_failed", title: "t", body: "b", leadId: null, dedupeKey: "resend-2" });
    expect(f).not.toHaveBeenCalled();
  });

  it("avec la clé et un vrai destinataire : appelle Resend pour les retards et échecs, pas pour une attribution", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const f = vi.fn();
    f.mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", f);
    const members = (await repo.listMembers(DEMO_ORG_ID)).map((m) => (m.role === "admin" ? { ...m, email: "vrai.admin@exemple-reel.com" } : m));
    const admin = memberId("maintia", "admin");
    await notifyUser(repo, DEMO_ORG_ID, admin, { kind: "lead_assigned", title: "a", body: "b", leadId: null, dedupeKey: "resend-3" }, members);
    expect(f).not.toHaveBeenCalled();
    await notifyUser(repo, DEMO_ORG_ID, admin, { kind: "lead_overdue", title: "Retard", body: "b", leadId: null, dedupeKey: "resend-4" }, members);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(String(init.body))).toMatchObject({ to: ["vrai.admin@exemple-reel.com"], subject: "Retard" });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test_key");
  });
});
