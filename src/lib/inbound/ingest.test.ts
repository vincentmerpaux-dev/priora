import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DEMO_ORG_ID } from "@/lib/demo/data";
import { demoRepository as repo } from "@/lib/repo/demo";
import { parseInbound, type InboundEmail } from "./email";
import { DEDUPE_WINDOW_MS, ingestInboundEmail, previewInboundEmail } from "./ingest";

const ORG = DEMO_ORG_ID;
const mail = (over: Record<string, unknown> = {}): InboundEmail =>
  parseInbound({
    FromFull: { Email: "claire.test@atelier-test.example", Name: "Claire Test" }, Subject: "Demande de démo GMAO", MessageID: "m-1",
    TextBody: "Bonjour,\nNous cherchons un outil de GMAO, budget validé de 25 k€, rappel cette semaine ?\n\nCordialement\nClaire Test\nDirectrice des opérations\n06 00 00 00 01",
    Headers: [], ...over,
  }) as InboundEmail;

describe("email entrant -> lead", () => {
  it("crée un lead de source email, scoré, analysé et attribué", async () => {
    const res = await ingestInboundEmail(repo, ORG, mail(), { enrich: false });
    expect(res.status).toBe("created");
    if (res.status !== "created") return;
    const detail = await repo.getLeadDetail(ORG, res.leadId);
    expect(detail?.lead).toMatchObject({ source: "email", email: "claire.test@atelier-test.example", firstName: "Claire", lastName: "Test", phone: "06 00 00 00 01", jobTitle: "Directrice des opérations" });
    expect(detail?.lead.message).toContain("GMAO");
    expect(detail?.score?.total).toBeGreaterThan(0);
    expect(detail?.analysis?.content.verdict.decision).toBeTruthy();
    expect(detail?.lead.ownerId).toBeTruthy();
    expect(res.ownerId).toBe(detail?.lead.ownerId);
    expect(detail?.activities.some((a) => a.type === "assignment")).toBe(true);
  });

  it("dédoublonne : même expéditeur dans les 24 h = activité sur le lead existant, pas de nouveau lead", async () => {
    const first = await ingestInboundEmail(repo, ORG, mail({ FromFull: { Email: "dup@dedupe-test.example", Name: "Dup Test" } }), { enrich: false });
    expect(first.status).toBe("created");
    const before = (await repo.listLeads(ORG)).length;
    const second = await ingestInboundEmail(repo, ORG, mail({ FromFull: { Email: "DUP@dedupe-test.example", Name: "Dup Test" }, Subject: "Re: démo", TextBody: "Petite précision : 3 sites.\n\n> ancien" }), { enrich: false });
    expect(second.status).toBe("duplicate");
    expect((await repo.listLeads(ORG)).length).toBe(before);
    if (first.status !== "created" || second.status !== "duplicate") return;
    expect(second.leadId).toBe(first.leadId);
    const detail = await repo.getLeadDetail(ORG, first.leadId);
    const inbound = detail?.activities.filter((a) => a.type === "inbound") ?? [];
    expect(inbound).toHaveLength(1);
    expect(inbound[0]!.content).toContain("3 sites");
    expect(inbound[0]!.content).not.toContain("ancien");
    // Un email entrant ne compte pas comme un premier contact de l'équipe.
    expect(detail?.lead.firstContactedAt).toBeNull();
  });

  it("ne duplique pas l'activité si le fournisseur renvoie le même message", async () => {
    const m = mail({ FromFull: { Email: "retry@dedupe-test.example", Name: "Retry Test" } });
    await ingestInboundEmail(repo, ORG, m, { enrich: false });
    const again = mail({ FromFull: { Email: "retry@dedupe-test.example", Name: "Retry Test" }, TextBody: "Relance : toujours intéressés." });
    const a = await ingestInboundEmail(repo, ORG, again, { enrich: false });
    const b = await ingestInboundEmail(repo, ORG, again, { enrich: false });
    expect(a).toMatchObject({ status: "duplicate", replay: false });
    expect(b).toMatchObject({ status: "duplicate", replay: true });
  });

  it("crée un nouveau lead quand le précédent a plus de 24 h", async () => {
    const first = await ingestInboundEmail(repo, ORG, mail({ FromFull: { Email: "old@window-test.example", Name: "Old Test" } }), { enrich: false });
    expect(first.status).toBe("created");
    const later = new Date(Date.now() + DEDUPE_WINDOW_MS + 60_000);
    const second = await ingestInboundEmail(repo, ORG, mail({ FromFull: { Email: "old@window-test.example", Name: "Old Test" } }), { enrich: false, now: later });
    expect(second.status).toBe("created");
  });

  it("ignore les réponses automatiques, newsletters et bounces sans créer de lead", async () => {
    const before = (await repo.listLeads(ORG)).length;
    const auto = await ingestInboundEmail(repo, ORG, mail({ Headers: [{ Name: "Auto-Submitted", Value: "auto-replied" }] }), { enrich: false });
    const news = await ingestInboundEmail(repo, ORG, mail({ Headers: [{ Name: "List-Unsubscribe", Value: "<mailto:u@x.example>" }] }), { enrich: false });
    const bounce = await ingestInboundEmail(repo, ORG, mail({ FromFull: { Email: "mailer-daemon@mx.example", Name: "" } }), { enrich: false });
    expect([auto, news, bounce]).toEqual([{ status: "skipped", reason: "auto_reply" }, { status: "skipped", reason: "newsletter" }, { status: "skipped", reason: "bounce" }]);
    expect((await repo.listLeads(ORG)).length).toBe(before);
  });

  it("l'aperçu n'écrit rien et annonce un lead existant", async () => {
    const before = (await repo.listLeads(ORG)).length;
    const p = await previewInboundEmail(repo, ORG, mail({ FromFull: { Email: "preview@x-test.example", Name: "Pre View" } }));
    expect(p.kind).toBe("new");
    expect((await repo.listLeads(ORG)).length).toBe(before);
    await ingestInboundEmail(repo, ORG, mail({ FromFull: { Email: "preview@x-test.example", Name: "Pre View" } }), { enrich: false });
    expect((await previewInboundEmail(repo, ORG, mail({ FromFull: { Email: "preview@x-test.example", Name: "Pre View" } }))).kind).toBe("existing");
    expect((await previewInboundEmail(repo, ORG, mail({ Headers: [{ Name: "Precedence", Value: "bulk" }] }))).kind).toBe("skipped");
  });

  it("prévient le responsable du lead quand le prospect répond", async () => {
    const first = await ingestInboundEmail(repo, ORG, mail({ FromFull: { Email: "notif@x-test.example", Name: "Notif Test" } }), { enrich: false });
    if (first.status !== "created" || !first.ownerId) throw new Error("lead non attribué");
    await ingestInboundEmail(repo, ORG, mail({ FromFull: { Email: "notif@x-test.example", Name: "Notif Test" }, TextBody: "Une question de plus." }), { enrich: false });
    const notes = await repo.listNotifications(ORG, first.ownerId, 50);
    expect(notes.some((n) => n.kind === "lead_message" && n.leadId === first.leadId)).toBe(true);
    expect(notes.some((n) => n.kind === "lead_assigned" && n.leadId === first.leadId)).toBe(true);
  });
});
