/**
 * Client HubSpot isolé (API CRM v3, jeton d'application privée, offre gratuite).
 * Aucune dépendance au reste de l'application : fetch et temporisation sont injectables (tests, mode démo).
 * Le jeton n'apparaît jamais dans les messages d'erreur ni dans les journaux.
 */

export type HubSpotErrorKind = "auth" | "forbidden" | "not_found" | "rate_limit" | "server" | "client" | "network";

export class HubSpotError extends Error {
  constructor(public kind: HubSpotErrorKind, message: string, public status: number | null = null) {
    super(message);
    this.name = "HubSpotError";
  }
}

export interface HubSpotOptions {
  token: string;
  fetch?: typeof fetch;
  baseUrl?: string;
  /** Réessais après un 429 (défaut 3). */
  maxRateLimitRetries?: number;
  /** Réessais après un 5xx ou une erreur réseau (défaut 2). */
  maxServerRetries?: number;
  /** Plafond d'une attente avant réessai, en ms (défaut 10 000). */
  maxWaitMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface HubSpotObject {
  id: string;
  properties: Record<string, string | null>;
}

export const CONTACT_PROPERTIES = ["email", "firstname", "lastname", "phone", "company", "jobtitle", "createdate"] as const;

/** Propriétés personnalisées créées dans HubSpot pour porter le score et le verdict Priora. */
export const PRIORA_PROPERTIES = [
  { name: "priora_score", label: "Score Priora", type: "number", fieldType: "number", description: "Score de qualification sur 100 calculé par Priora." },
  { name: "priora_verdict", label: "Verdict Priora", type: "string", fieldType: "text", description: "Verdict Priora : Appeler maintenant, Nourrir ou Disqualifier." },
] as const;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class HubSpotClient {
  private readonly token: string;
  private readonly doFetch: typeof fetch;
  private readonly baseUrl: string;
  private readonly rlRetries: number;
  private readonly serverRetries: number;
  private readonly maxWaitMs: number;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  /** Mémorise le résultat de ensureProperties : true = propriétés prêtes, false = droits manquants. */
  private customProps: boolean | null = null;
  /** Nombre d'appels réseau effectués (utile aux tests et au journal). */
  calls = 0;

  constructor(opts: HubSpotOptions) {
    this.token = opts.token;
    this.doFetch = opts.fetch ?? fetch;
    this.baseUrl = (opts.baseUrl ?? "https://api.hubapi.com").replace(/\/$/, "");
    this.rlRetries = opts.maxRateLimitRetries ?? 3;
    this.serverRetries = opts.maxServerRetries ?? 2;
    this.maxWaitMs = opts.maxWaitMs ?? 10_000;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  /** Requête avec réessais : 429 (en-tête Retry-After, sinon attente exponentielle), 5xx et erreurs réseau. 401 et 4xx : aucun réessai. */
  async request<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
    let rlAttempt = 0;
    let serverAttempt = 0;
    for (;;) {
      this.calls++;
      let res: Response;
      try {
        res = await this.doFetch(`${this.baseUrl}${path}`, {
          method,
          headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", Accept: "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch {
        if (serverAttempt < this.serverRetries) {
          await this.sleep(this.wait(null, serverAttempt++, 500));
          continue;
        }
        throw new HubSpotError("network", "HubSpot est injoignable (réseau ou délai dépassé).");
      }

      if (res.ok) {
        if (res.status === 204) return undefined as T;
        const text = await res.text();
        return (text ? JSON.parse(text) : undefined) as T;
      }

      if (res.status === 429) {
        if (rlAttempt < this.rlRetries) {
          await this.sleep(this.wait(res.headers.get("retry-after"), rlAttempt++, 1000));
          continue;
        }
        throw new HubSpotError("rate_limit", "HubSpot limite le débit (429) : réessayez dans quelques instants.", 429);
      }
      if (res.status >= 500) {
        if (serverAttempt < this.serverRetries) {
          await this.sleep(this.wait(res.headers.get("retry-after"), serverAttempt++, 500));
          continue;
        }
        throw new HubSpotError("server", `HubSpot est indisponible (erreur ${res.status}).`, res.status);
      }
      throw await this.toError(res);
    }
  }

  private wait(retryAfter: string | null, attempt: number, baseMs: number): number {
    const seconds = retryAfter === null ? NaN : Number(retryAfter);
    const ms = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : baseMs * 2 ** attempt;
    return Math.min(ms, this.maxWaitMs);
  }

  private async toError(res: Response): Promise<HubSpotError> {
    let detail = "";
    try {
      const j = (await res.json()) as { message?: unknown };
      if (typeof j.message === "string") detail = j.message.replace(/Bearer\s+\S+/gi, "[masqué]").slice(0, 200);
    } catch { /* corps absent ou non JSON */ }
    if (res.status === 401) return new HubSpotError("auth", "Jeton HubSpot refusé (401) : il est invalide, expiré ou révoqué. Reconnectez HubSpot.", 401);
    if (res.status === 403) return new HubSpotError("forbidden", `Droits insuffisants (403) : il manque une portée sur l'application privée${detail ? ` (${detail})` : ""}.`, 403);
    if (res.status === 404) return new HubSpotError("not_found", "Objet introuvable dans HubSpot (404).", 404);
    return new HubSpotError("client", `Requête refusée par HubSpot (${res.status})${detail ? ` : ${detail}` : ""}.`, res.status);
  }

  /* ---------- Opérations ---------- */

  /** Vérifie le jeton avec une lecture minimale. */
  async ping(): Promise<void> {
    await this.request("GET", "/crm/v3/objects/contacts?limit=1");
  }

  async findContactByEmail(email: string): Promise<HubSpotObject | null> {
    const r = await this.request<{ results: HubSpotObject[] }>("POST", "/crm/v3/objects/contacts/search", {
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email.toLowerCase() }] }],
      properties: [...CONTACT_PROPERTIES],
      limit: 1,
    });
    return r.results[0] ?? null;
  }

  /** Met à jour le contact portant cet email, sinon le crée. */
  async upsertContact(email: string, properties: Record<string, string | number>): Promise<{ id: string; created: boolean }> {
    const found = await this.findContactByEmail(email);
    if (found) {
      await this.request("PATCH", `/crm/v3/objects/contacts/${encodeURIComponent(found.id)}`, { properties });
      return { id: found.id, created: false };
    }
    const created = await this.request<HubSpotObject>("POST", "/crm/v3/objects/contacts", { properties: { ...properties, email: email.toLowerCase() } });
    return { id: created.id, created: true };
  }

  async createDeal(properties: Record<string, string | number>, contactId: string): Promise<{ id: string }> {
    const r = await this.request<HubSpotObject>("POST", "/crm/v3/objects/deals", {
      properties,
      // Association transaction vers contact : type défini par HubSpot (3).
      associations: [{ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }] }],
    });
    return { id: r.id };
  }

  async updateDeal(dealId: string, properties: Record<string, string | number>): Promise<void> {
    await this.request("PATCH", `/crm/v3/objects/deals/${encodeURIComponent(dealId)}`, { properties });
  }

  /** Contacts créés depuis `sinceMs`, du plus récent au plus ancien. */
  async listRecentContacts(sinceMs: number, limit = 50): Promise<HubSpotObject[]> {
    const r = await this.request<{ results: HubSpotObject[] }>("POST", "/crm/v3/objects/contacts/search", {
      filterGroups: [{ filters: [{ propertyName: "createdate", operator: "GTE", value: String(sinceMs) }] }],
      sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
      properties: [...CONTACT_PROPERTIES],
      limit: Math.min(100, Math.max(1, limit)),
    });
    return r.results;
  }

  /**
   * Crée les propriétés personnalisées priora_score et priora_verdict (contacts et transactions) si elles n'existent pas.
   * Nécessite les portées crm.schemas.contacts.write et crm.schemas.deals.write. Sans elles (403), retourne false :
   * l'envoi continue sans ces propriétés et place le score dans la description de la transaction.
   */
  async ensureProperties(): Promise<boolean> {
    if (this.customProps !== null) return this.customProps;
    try {
      for (const object of ["contacts", "deals"] as const) {
        for (const p of PRIORA_PROPERTIES) {
          try {
            await this.request("GET", `/crm/v3/properties/${object}/${p.name}`);
          } catch (e) {
            if (!(e instanceof HubSpotError) || e.kind !== "not_found") throw e;
            try {
              await this.request("POST", `/crm/v3/properties/${object}`, { ...p, groupName: object === "contacts" ? "contactinformation" : "dealinformation" });
            } catch (e2) {
              if (!(e2 instanceof HubSpotError) || e2.status !== 409) throw e2; // 409 : créée entre-temps
            }
          }
        }
      }
      this.customProps = true;
    } catch (e) {
      if (e instanceof HubSpotError && (e.kind === "forbidden" || e.kind === "client")) this.customProps = false;
      else throw e;
    }
    return this.customProps;
  }
}
