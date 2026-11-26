import type { HubSpotObject } from "@/lib/integrations/hubspot/client";

/**
 * FAUX HUBSPOT (mode démo et tests). Il répond comme l'API CRM v3, au niveau de fetch : le vrai client HubSpot
 * (réessais, gestion d'erreurs) s'exécute donc réellement contre lui. Aucune donnée ne quitte l'application.
 * Les contacts de départ sont FICTIFS (domaines .example), présentés comme tels dans l'interface.
 *
 * Incidents simulables (sélecteur de l'écran Intégrations en démo) :
 * - "429" : un seul refus (Retry-After 1 s), puis tout repasse : montre le réessai automatique ;
 * - "401" : jeton refusé, durable jusqu'à retour à "none" ;
 * - "500" : HubSpot indisponible, durable jusqu'à retour à "none".
 */

export type FakeIncident = "none" | "429" | "401" | "500";

interface FakeDeal { id: string; properties: Record<string, string>; contactId: string | null }

export interface FakeHubSpotState {
  contacts: Map<string, HubSpotObject>;
  deals: Map<string, FakeDeal>;
  props: Set<string>;
  seq: number;
  incident: FakeIncident;
}

const g = globalThis as unknown as { __prioraHubspotFake?: Map<string, FakeHubSpotState> };

const SEED_CONTACTS = [
  { email: "lucie.fontaine@brasserie-tilleuls.example", firstname: "Lucie", lastname: "Fontaine", company: "Brasserie des Tilleuls", jobtitle: "Gérante", phone: "06 00 00 05 01", days: 2 },
  { email: "marc.devaux@devaux-transports.example", firstname: "Marc", lastname: "Devaux", company: "Devaux Transports", jobtitle: "Directeur d'exploitation", phone: "06 00 00 05 02", days: 4 },
  { email: "nora.benali@atelier-benali.example", firstname: "Nora", lastname: "Benali", company: "Atelier Benali", jobtitle: "Responsable de site", phone: null, days: 6 },
  { email: "sandrine.petit.demo@gmail.com", firstname: "Sandrine", lastname: "Petit", company: "", jobtitle: null, phone: null, days: 8 },
] as const;

/** `duplicateEmail` : un contact déjà présent côté Priora, pour montrer que l'import ignore les doublons. */
export function fakeHubSpotState(key: string, duplicateEmail?: string): FakeHubSpotState {
  const all = (g.__prioraHubspotFake ??= new Map());
  let s = all.get(key);
  if (!s) {
    s = { contacts: new Map(), deals: new Map(), props: new Set(), seq: 1000, incident: "none" };
    const seeds = [...SEED_CONTACTS.map((c) => ({ ...c })), ...(duplicateEmail ? [{ email: duplicateEmail, firstname: "", lastname: "", company: "", jobtitle: null, phone: null, days: 3 }] : [])];
    for (const c of seeds) {
      const id = String(++s.seq);
      const created = new Date(Date.now() - c.days * 86_400_000).toISOString();
      s.contacts.set(id, {
        id,
        properties: { email: c.email, firstname: c.firstname || null, lastname: c.lastname || null, company: c.company || null, jobtitle: c.jobtitle, phone: c.phone, createdate: created },
      });
    }
    all.set(key, s);
  }
  return s;
}

/** Supprime les faux HubSpot d'un bac à sable de démo publique (clés "sid:orgId"). */
export function dropFakeHubSpotFor(sid: string): void {
  const all = g.__prioraHubspotFake;
  if (!all) return;
  for (const k of all.keys()) if (k.startsWith(sid + ":")) all.delete(k);
}

/** Clé du faux HubSpot : une par organisation, et par bac à sable en démo publique. */
export const fakeHubSpotKey = (orgId: string, scope?: string): string => (scope ? scope + ":" + orgId : orgId);

export function setFakeIncident(key: string, incident: FakeIncident): void {
  fakeHubSpotState(key).incident = incident;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const strings = (o: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (typeof o === "object" && o !== null) for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined) out[k] = String(v);
  return out;
};

export function createFakeHubSpotFetch(key: string, duplicateEmail?: string): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const state = fakeHubSpotState(key, duplicateEmail);
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    const path = url.pathname;

    if (state.incident === "401") return json({ status: "error", message: "Authentication credentials not found (simulation)", category: "INVALID_AUTHENTICATION" }, 401);
    if (state.incident === "500") return json({ status: "error", message: "Internal error (simulation)" }, 500);
    if (state.incident === "429") {
      state.incident = "none";
      return json({ status: "error", message: "You have reached your secondly limit (simulation).", policyName: "SECONDLY" }, 429, { "retry-after": "1" });
    }

    // Propriétés personnalisées
    const prop = /^\/crm\/v3\/properties\/(contacts|deals)(?:\/([a-z_]+))?$/.exec(path);
    if (prop) {
      const id = `${prop[1]}:${prop[2] ?? String(body.name)}`;
      if (method === "GET") return state.props.has(id) ? json({ name: prop[2] }) : json({ status: "error", message: "Property does not exist" }, 404);
      if (method === "POST") {
        if (state.props.has(id)) return json({ status: "error", message: "Property already exists" }, 409);
        state.props.add(id);
        return json({ name: body.name }, 201);
      }
    }

    if (path === "/crm/v3/objects/contacts" && method === "GET") {
      const limit = Number(url.searchParams.get("limit") ?? 10);
      return json({ results: [...state.contacts.values()].slice(0, limit) });
    }

    if (path === "/crm/v3/objects/contacts/search" && method === "POST") {
      const filters = ((body.filterGroups as { filters: { propertyName: string; operator: string; value: string }[] }[] | undefined) ?? []).flatMap((g2) => g2.filters);
      let list = [...state.contacts.values()];
      for (const f of filters) {
        if (f.propertyName === "email" && f.operator === "EQ") list = list.filter((c) => (c.properties.email ?? "").toLowerCase() === f.value.toLowerCase());
        if (f.propertyName === "createdate" && f.operator === "GTE") list = list.filter((c) => Date.parse(c.properties.createdate ?? "") >= Number(f.value));
      }
      list.sort((a, b) => Date.parse(b.properties.createdate ?? "") - Date.parse(a.properties.createdate ?? ""));
      return json({ total: list.length, results: list.slice(0, Number(body.limit ?? 10)) });
    }

    if (path === "/crm/v3/objects/contacts" && method === "POST") {
      const props = strings(body.properties);
      const email = (props.email ?? "").toLowerCase();
      if ([...state.contacts.values()].some((c) => (c.properties.email ?? "").toLowerCase() === email)) return json({ status: "error", message: "Contact already exists" }, 409);
      const id = String(++state.seq);
      state.contacts.set(id, { id, properties: { ...props, createdate: new Date().toISOString() } });
      return json({ id, properties: state.contacts.get(id)!.properties }, 201);
    }

    const contact = /^\/crm\/v3\/objects\/contacts\/(\d+)$/.exec(path);
    if (contact && method === "PATCH") {
      const c = state.contacts.get(contact[1]!);
      if (!c) return json({ status: "error", message: "Not found" }, 404);
      Object.assign(c.properties, strings(body.properties));
      return json(c);
    }

    if (path === "/crm/v3/objects/deals" && method === "POST") {
      const id = String(++state.seq);
      const assoc = (body.associations as { to: { id: string } }[] | undefined)?.[0]?.to.id ?? null;
      state.deals.set(id, { id, properties: strings(body.properties), contactId: assoc });
      return json({ id, properties: state.deals.get(id)!.properties }, 201);
    }
    const deal = /^\/crm\/v3\/objects\/deals\/(\d+)$/.exec(path);
    if (deal && method === "PATCH") {
      const d = state.deals.get(deal[1]!);
      if (!d) return json({ status: "error", message: "Not found" }, 404);
      Object.assign(d.properties, strings(body.properties));
      return json({ id: d.id, properties: d.properties });
    }

    return json({ status: "error", message: `Route non simulée : ${method} ${path}` }, 404);
  }) as typeof fetch;
}
