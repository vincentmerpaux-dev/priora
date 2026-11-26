import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/repo", async () => {
  const { demoPublicRepository } = await import("@/lib/repo/demo");
  return { getPublicRepo: () => demoPublicRepository };
});

import { NextRequest } from "next/server";
import { DEMO_ORG_ID } from "@/lib/demo/data";
import { demoRepository as repo } from "@/lib/repo/demo";
import { generateInboundKey } from "@/lib/security";
import { memberId } from "@/lib/demo/team";
import { POST as inbound } from "./inbound/email/[orgKey]/route";
import { GET as cronGet, POST as cronPost } from "./cron/speed-check/route";

const ORG = DEMO_ORG_ID;
let KEY = "";

beforeAll(async () => {
  const k = generateInboundKey();
  KEY = k.key;
  await repo.setInboundKey(ORG, k.hash, k.prefix);
});

const call = (key: string, init: { json?: unknown; form?: Record<string, string>; headers?: Record<string, string>; query?: string }) => {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  let body: BodyInit | undefined;
  if (init.json !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(init.json); }
  if (init.form) { body = new URLSearchParams(init.form); headers["content-type"] = "application/x-www-form-urlencoded"; }
  const req = new NextRequest(`http://localhost/api/inbound/email/${key}${init.query ?? ""}`, { method: "POST", headers, body });
  return inbound(req, { params: Promise.resolve({ orgKey: key }) });
};

const postmark = (email: string, extra: Record<string, unknown> = {}) => ({
  FromFull: { Email: email, Name: "Alice Route" }, Subject: "Demande de démo", MessageID: `m-${email}`,
  TextBody: "Bonjour, nous cherchons un outil de GMAO. Budget validé. Rappelez-moi cette semaine.\n\nCordialement\nAlice Route\nResponsable maintenance",
  Headers: [], ...extra,
});

describe("POST /api/inbound/email/[orgKey]", () => {
  it("crée un lead attribué et scoré à partir d'un email Postmark", async () => {
    const res = await call(KEY, { json: postmark("alice@route-test.example") });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ status: "created", assigned: true });
    const detail = await repo.getLeadDetail(ORG, body.id);
    expect(detail?.lead).toMatchObject({ source: "email", email: "alice@route-test.example" });
    expect(detail?.lead.ownerId).toBeTruthy();
    expect(detail?.score?.total).toBeGreaterThan(0);
  });

  it("dédoublonne : le second email du même expéditeur répond 200 et ajoute une activité", async () => {
    await call(KEY, { json: postmark("bob@route-test.example") });
    const before = (await repo.listLeads(ORG)).length;
    const res = await call(KEY, { json: postmark("bob@route-test.example", { TextBody: "Un complément d'information." }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "duplicate" });
    expect((await repo.listLeads(ORG)).length).toBe(before);
  });

  it("ignore une réponse automatique avec un 200 (le fournisseur ne réessaie pas)", async () => {
    const before = (await repo.listLeads(ORG)).length;
    const res = await call(KEY, { json: postmark("auto@route-test.example", { Headers: [{ Name: "Auto-Submitted", Value: "auto-replied" }] }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ignored", reason: "auto_reply" });
    expect((await repo.listLeads(ORG)).length).toBe(before);
  });

  it("lit un formulaire url-encodé de type Mailgun / SendGrid", async () => {
    const res = await call(KEY, { form: { from: "Carole Form <carole@route-test.example>", subject: "Devis", "body-plain": "Je voudrais un devis, rappelez-moi.", "message-headers": "[]" } });
    expect(res.status).toBe(201);
  });

  it("accepte la clé en en-tête Bearer (Cloudflare Worker) et le format générique", async () => {
    const res = await call("cloudflare-placeholder-segment", { json: { from: { name: "Dan Worker", address: "dan@route-test.example" }, subject: "Hello", text: "Bonjour, besoin d'un devis.", headers: {} }, headers: { authorization: `Bearer ${KEY}` }, query: "?provider=generic" });
    expect(res.status).toBe(201);
  });

  it("refuse une clé inconnue ou mal formée (401), sans rien créer", async () => {
    const before = (await repo.listLeads(ORG)).length;
    expect((await call(generateInboundKey().key, { json: postmark("x@route-test.example") })).status).toBe(401);
    expect((await call("court", { json: postmark("x@route-test.example") })).status).toBe(401);
    expect((await repo.listLeads(ORG)).length).toBe(before);
  });

  it("refuse la clé du webhook ou d'une clé régénérée (l'ancienne ne fonctionne plus)", async () => {
    const old = KEY;
    const k = generateInboundKey();
    await repo.setInboundKey(ORG, k.hash, k.prefix);
    expect((await call(old, { json: postmark("old@route-test.example") })).status).toBe(401);
    expect((await call(k.key, { json: postmark("new@route-test.example") })).status).toBe(201);
    KEY = k.key;
  });

  it("répond 400 sur un corps illisible et 200 'ignored' sur un expéditeur invalide", async () => {
    const bad = new NextRequest(`http://localhost/api/inbound/email/${KEY}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{pas du json" });
    expect((await inbound(bad, { params: Promise.resolve({ orgKey: KEY }) })).status).toBe(400);
    const res = await call(KEY, { json: { subject: "x", text: "y" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ignored", reason: "invalid_sender" });
  });

  it("répond 415-like (400) sur un type de contenu non pris en charge", async () => {
    const req = new NextRequest(`http://localhost/api/inbound/email/${KEY}`, { method: "POST", headers: { "content-type": "text/plain" }, body: "hello" });
    expect((await inbound(req, { params: Promise.resolve({ orgKey: KEY }) })).status).toBe(400);
  });
});

describe("/api/cron/speed-check", () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => { if (original === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = original; });
  const req = (auth?: string, method = "GET") => new NextRequest("http://localhost/api/cron/speed-check", { method, headers: auth ? { authorization: auth } : {} });

  it("reste fermée sans CRON_SECRET (503), jamais ouverte par défaut", async () => {
    delete process.env.CRON_SECRET;
    expect((await cronGet(req("Bearer quelconque-secret-123456"))).status).toBe(503);
    process.env.CRON_SECRET = "court";
    expect((await cronGet(req("Bearer court"))).status).toBe(503);
  });

  it("refuse un secret absent ou faux (401)", async () => {
    process.env.CRON_SECRET = "un-secret-de-test-suffisamment-long";
    expect((await cronGet(req())).status).toBe(401);
    expect((await cronGet(req("Bearer mauvais-secret-de-test-xxxxxxxx"))).status).toBe(401);
    expect((await cronGet(req("Basic un-secret-de-test-suffisamment-long"))).status).toBe(401);
  });

  it("avec le bon secret, notifie les responsables des leads en retard (GET Vercel Cron et POST GitHub Actions), sans doublon", async () => {
    process.env.CRON_SECRET = "un-secret-de-test-suffisamment-long";
    const first = await cronGet(req("Bearer un-secret-de-test-suffisamment-long"));
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body).toMatchObject({ ok: true, organizations: 2 });
    expect(body.overdueLeads).toBeGreaterThan(0);
    expect(body.ownerNotifications).toBeGreaterThan(0);

    const second = await (await cronPost(req("Bearer un-secret-de-test-suffisamment-long", "POST"))).json();
    expect(second).toMatchObject({ ok: true, ownerNotifications: 0, digestNotifications: 0 });

    const manager = memberId("maintia", "manager");
    const notes = await repo.listNotifications(ORG, manager, 20);
    expect(notes.filter((n) => n.kind === "overdue_digest")).toHaveLength(1);
  });
});
