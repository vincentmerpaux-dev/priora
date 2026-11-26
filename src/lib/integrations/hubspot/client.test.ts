import { describe, expect, it, vi } from "vitest";
import { HubSpotClient, HubSpotError } from "./client";
import { createFakeHubSpotFetch, fakeHubSpotState, setFakeIncident } from "./fake";
import { contactToLeadInput, dealStageFor, leadToContactProps, leadToDealProps } from "./mapping";

const TOKEN = "pat-na1-00000000-0000-0000-0000-000000000000";

interface Call { method: string; path: string; body: unknown; auth: string | null }
type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | Error;

/** Faux fetch scripté : rejoue les réponses dans l'ordre et mémorise les appels. */
function scripted(replies: Reply[]) {
  const calls: Call[] = [];
  const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ method: init?.method ?? "GET", path: url.pathname + url.search, body: init?.body ? JSON.parse(String(init.body)) : undefined, auth: new Headers(init?.headers).get("authorization") });
    const r = replies.shift();
    if (!r) throw new Error("Plus de réponse scriptée");
    if (r instanceof Error) throw r;
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json", ...(r.headers ?? {}) } });
  });
  return { fetch: f as unknown as typeof fetch, calls };
}

const make = (replies: Reply[], extra: Partial<ConstructorParameters<typeof HubSpotClient>[0]> = {}) => {
  const s = scripted(replies);
  const sleeps: number[] = [];
  const client = new HubSpotClient({ token: TOKEN, fetch: s.fetch, sleep: async (ms) => { sleeps.push(ms); }, ...extra });
  return { client, calls: s.calls, sleeps };
};

describe("client HubSpot : contacts", () => {
  it("crée le contact quand l'email est inconnu", async () => {
    const { client, calls } = make([{ status: 200, body: { results: [] } }, { status: 201, body: { id: "11", properties: {} } }]);
    const r = await client.upsertContact("Claire@Atelier.example", { firstname: "Claire", priora_score: 82 });
    expect(r).toEqual({ id: "11", created: true });
    expect(calls[0]).toMatchObject({ method: "POST", path: "/crm/v3/objects/contacts/search", auth: `Bearer ${TOKEN}` });
    expect(calls[1]).toMatchObject({ method: "POST", path: "/crm/v3/objects/contacts" });
    expect(calls[1]!.body).toEqual({ properties: { firstname: "Claire", priora_score: 82, email: "claire@atelier.example" } });
  });

  it("met à jour le contact existant au lieu d'en créer un", async () => {
    const { client, calls } = make([{ status: 200, body: { results: [{ id: "42", properties: { email: "claire@atelier.example" } }] } }, { status: 200, body: { id: "42" } }]);
    const r = await client.upsertContact("claire@atelier.example", { priora_verdict: "Appeler maintenant" });
    expect(r).toEqual({ id: "42", created: false });
    expect(calls[1]).toMatchObject({ method: "PATCH", path: "/crm/v3/objects/contacts/42" });
    expect(calls).toHaveLength(2);
  });

  it("crée une transaction associée au contact, puis la met à jour", async () => {
    const { client, calls } = make([{ status: 201, body: { id: "900", properties: {} } }, { status: 200, body: {} }]);
    expect(await client.createDeal({ dealname: "Atelier (score 82)" }, "42")).toEqual({ id: "900" });
    await client.updateDeal("900", { dealstage: "closedwon" });
    expect(calls[0]!.body).toMatchObject({ associations: [{ to: { id: "42" }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }] }] });
    expect(calls[1]).toMatchObject({ method: "PATCH", path: "/crm/v3/objects/deals/900" });
  });
});

describe("client HubSpot : erreurs et réessais", () => {
  it("429 : attend le délai Retry-After puis réessaie avec succès", async () => {
    const { client, calls, sleeps } = make([{ status: 429, body: { message: "limit" }, headers: { "retry-after": "2" } }, { status: 200, body: { results: [] } }]);
    await expect(client.findContactByEmail("a@b.example")).resolves.toBeNull();
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([2000]);
  });

  it("429 sans Retry-After : attente exponentielle, plafonnée", async () => {
    const { client, sleeps } = make([{ status: 429 }, { status: 429 }, { status: 429 }, { status: 200, body: { results: [] } }], { maxWaitMs: 1500 });
    await client.findContactByEmail("a@b.example");
    expect(sleeps).toEqual([1000, 1500, 1500]);
  });

  it("429 persistant : s'arrête après les réessais autorisés avec une erreur rate_limit", async () => {
    const { client, calls } = make([{ status: 429 }, { status: 429 }, { status: 429 }, { status: 429 }, { status: 429 }], { maxRateLimitRetries: 3 });
    const err = await client.ping().catch((e) => e);
    expect(err).toBeInstanceOf(HubSpotError);
    expect(err).toMatchObject({ kind: "rate_limit", status: 429 });
    expect(calls).toHaveLength(4);
  });

  it("401 : erreur d'authentification claire, aucun réessai, jeton absent du message", async () => {
    const { client, calls, sleeps } = make([{ status: 401, body: { message: `Invalid token Bearer ${TOKEN}` } }]);
    const err = (await client.ping().catch((e) => e)) as HubSpotError;
    expect(err).toMatchObject({ kind: "auth", status: 401 });
    expect(err.message).toContain("401");
    expect(err.message).not.toContain(TOKEN);
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it("403 : droits insuffisants, détail masqué du jeton", async () => {
    const { client } = make([{ status: 403, body: { message: "scope missing" } }]);
    expect(await client.ping().catch((e) => e)).toMatchObject({ kind: "forbidden", status: 403 });
  });

  it("5xx : réessaie deux fois puis échoue en erreur serveur ; se rétablit si HubSpot revient", async () => {
    const failing = make([{ status: 503 }, { status: 502 }, { status: 500 }]);
    expect(await failing.client.ping().catch((e) => e)).toMatchObject({ kind: "server", status: 500 });
    expect(failing.calls).toHaveLength(3);
    const recovering = make([{ status: 500 }, { status: 200, body: { results: [] } }]);
    await expect(recovering.client.ping()).resolves.toBeUndefined();
    expect(recovering.calls).toHaveLength(2);
  });

  it("erreur réseau : un réessai, puis erreur network", async () => {
    const { client, calls } = make([new Error("ECONNRESET"), new Error("ECONNRESET"), new Error("ECONNRESET")]);
    expect(await client.ping().catch((e) => e)).toMatchObject({ kind: "network" });
    expect(calls).toHaveLength(3);
  });

  it("400 : erreur client avec le message de HubSpot, sans réessai", async () => {
    const { client, calls } = make([{ status: 400, body: { message: "Property values were not valid" } }]);
    const err = (await client.createDeal({ dealstage: "inconnu" }, "1").catch((e) => e)) as HubSpotError;
    expect(err).toMatchObject({ kind: "client", status: 400 });
    expect(err.message).toContain("Property values were not valid");
    expect(calls).toHaveLength(1);
  });
});

describe("client HubSpot : propriétés personnalisées", () => {
  it("crée priora_score et priora_verdict (contacts et transactions) quand elles manquent", async () => {
    const replies: Reply[] = [];
    for (let i = 0; i < 4; i++) replies.push({ status: 404, body: { message: "missing" } }, { status: 201, body: {} });
    const { client, calls } = make(replies);
    expect(await client.ensureProperties()).toBe(true);
    const created = calls.filter((c) => c.method === "POST");
    expect(created.map((c) => c.path)).toEqual(["/crm/v3/properties/contacts", "/crm/v3/properties/contacts", "/crm/v3/properties/deals", "/crm/v3/properties/deals"]);
    expect((created[0]!.body as { name: string; type: string }).name).toBe("priora_score");
    // Mémorisé : un second appel ne touche pas le réseau.
    await client.ensureProperties();
    expect(calls).toHaveLength(8);
  });

  it("sans les portées de schéma (403), continue sans propriétés personnalisées", async () => {
    const { client } = make([{ status: 404 }, { status: 403, body: { message: "missing scope crm.schemas.contacts.write" } }]);
    expect(await client.ensureProperties()).toBe(false);
  });
});

describe("faux HubSpot de démonstration (même client, mêmes réponses qu'une vraie API)", () => {
  const client = (key: string, dup?: string) => new HubSpotClient({ token: "demo", fetch: createFakeHubSpotFetch(key, dup), sleep: async () => undefined });

  it("crée puis met à jour un contact et une transaction", async () => {
    const c = client("t-crud");
    await c.ensureProperties();
    const a = await c.upsertContact("nouveau@demo-test.example", { firstname: "Nina", priora_score: 70 });
    const b = await c.upsertContact("NOUVEAU@demo-test.example", { priora_score: 91 });
    expect(a.created).toBe(true);
    expect(b).toEqual({ id: a.id, created: false });
    const state = fakeHubSpotState("t-crud");
    expect(state.contacts.get(a.id)!.properties).toMatchObject({ firstname: "Nina", priora_score: "91" });
    const deal = await c.createDeal({ dealname: "x" }, a.id);
    await c.updateDeal(deal.id, { dealstage: "closedwon" });
    expect(state.deals.get(deal.id)).toMatchObject({ contactId: a.id, properties: { dealstage: "closedwon" } });
    await expect(c.updateDeal("999999", {})).rejects.toMatchObject({ kind: "not_found" });
  });

  it("simule un 429 (réessai automatique), un 401 et un 500 durables", async () => {
    const c = client("t-incidents");
    setFakeIncident("t-incidents", "429");
    await expect(c.ping()).resolves.toBeUndefined();
    expect(c.calls).toBe(2);
    setFakeIncident("t-incidents", "401");
    await expect(c.ping()).rejects.toMatchObject({ kind: "auth" });
    setFakeIncident("t-incidents", "500");
    await expect(c.ping()).rejects.toMatchObject({ kind: "server" });
    setFakeIncident("t-incidents", "none");
    await expect(c.ping()).resolves.toBeUndefined();
  });

  it("liste les contacts récents, du plus récent au plus ancien, filtrés par date", async () => {
    const c = client("t-list", "doublon@x.example");
    const all = await c.listRecentContacts(Date.now() - 30 * 86_400_000);
    expect(all.length).toBe(5);
    const times = all.map((x) => Date.parse(x.properties.createdate!));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    const recent = await c.listRecentContacts(Date.now() - 3.5 * 86_400_000);
    expect(recent.length).toBeLessThan(all.length);
  });
});

describe("correspondances Priora <-> HubSpot", () => {
  const lead = { firstName: "Claire", lastName: "Mollard", phone: "06 00 00 00 01", company: "Atelier Valdor", jobTitle: "Directrice" };
  const facts = { score: 82, verdict: "call_now" as const, summary: "Besoin GMAO sur 3 sites.", status: "qualified" as const };

  it("contact : score et verdict en propriétés personnalisées, ou absents si elles ne sont pas disponibles", () => {
    expect(leadToContactProps(lead, facts, true)).toMatchObject({ firstname: "Claire", company: "Atelier Valdor", priora_score: 82, priora_verdict: "Appeler maintenant" });
    expect(leadToContactProps(lead, facts, false)).not.toHaveProperty("priora_score");
  });

  it("transaction : étape selon le statut, score et verdict aussi dans la description (repli)", () => {
    const d = leadToDealProps(lead, facts, false);
    expect(d).toMatchObject({ dealstage: "qualifiedtobuy", pipeline: "default" });
    expect(d.description).toContain("score 82/100");
    expect(d.description).toContain("Appeler maintenant");
    expect(dealStageFor("won")).toBe("closedwon");
    expect(leadToDealProps(lead, { ...facts, status: "won" }, true)).toMatchObject({ dealstage: "closedwon", priora_score: 82 });
  });

  it("contact HubSpot -> lead : entreprise déduite du domaine, refus sans email", () => {
    const input = contactToLeadInput({ id: "1", properties: { email: "Nora.Benali@atelier-benali.example", firstname: "Nora", lastname: "Benali", company: null } });
    expect(input).toMatchObject({ email: "nora.benali@atelier-benali.example", firstName: "Nora", company: "Atelier Benali" });
    expect(contactToLeadInput({ id: "2", properties: { email: null } })).toBeNull();
    expect(contactToLeadInput({ id: "3", properties: { email: "pas-un-email" } })).toBeNull();
  });
});
