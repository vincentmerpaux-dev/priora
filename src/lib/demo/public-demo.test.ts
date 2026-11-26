import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/demo/visitor", () => ({ getDemoSid: async () => undefined, enforceDemoActionLimit: async () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));

/** Démo publique : aucun appel sortant (registre, sites, IA, email), enrichissement fictif et déterministe. */
describe("blocage des appels sortants en démo publique", () => {
  const fetchSpy = vi.fn(async () => new Response("{}"));
  beforeEach(() => {
    vi.stubEnv("PRIORA_PUBLIC_DEMO", "true");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-factice");
    vi.stubEnv("RESEND_API_KEY", "re_factice");
    vi.stubGlobal("fetch", fetchSpy);
    fetchSpy.mockClear();
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("enrichLead renvoie des données fictives sans aucun appel réseau", async () => {
    const { enrichLead } = await import("@/lib/enrichment");
    const e = await enrichLead({ company: "Atelier Exemple", email: "jean@atelier-exemple.fr", website: "https://atelier-exemple.fr" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(e.company?.siren.startsWith("999")).toBe(true);
    expect(e.notes.join(" ")).toMatch(/fictif/i);
    expect((await enrichLead({ company: "Atelier Exemple", email: "x@y.fr", website: null })).company).toEqual(e.company);
  });

  it("lookupCompany et readWebsite n'appellent pas le réseau", async () => {
    const { lookupCompany } = await import("@/lib/enrichment/gouv");
    const { readWebsite } = await import("@/lib/enrichment/website");
    const injected = vi.fn();
    expect((await lookupCompany("Atelier Exemple", injected as unknown as typeof fetch)).company).toBeUndefined();
    expect((await readWebsite("exemple.fr")).info).toBeUndefined();
    expect(injected).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("l'IA réelle est désactivée même avec une clé, et aucun email n'est envoyé", async () => {
    const { aiConfigured } = await import("@/lib/ai/analyze");
    const { sendEmail, resendConfigured } = await import("@/lib/notifications/email");
    expect(aiConfigured()).toBe(false);
    expect(resendConfigured()).toBe(false);
    const injected = vi.fn();
    const r = await sendEmail({ to: "a@b.fr", subject: "x", text: "y" }, injected as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    expect(injected).not.toHaveBeenCalled();
  });

  it("le webhook et l'email entrant répondent 403 sans rien accepter", async () => {
    const { POST: webhook } = await import("@/app/api/webhooks/leads/route");
    const { POST: inbound } = await import("@/app/api/inbound/email/[orgKey]/route");
    const { NextRequest } = await import("next/server");
    const req = () => new NextRequest("http://localhost/api/x", { method: "POST", body: "{}" });
    expect((await webhook(req())).status).toBe(403);
    expect((await inbound(req(), { params: Promise.resolve({ orgKey: "k".repeat(30) }) })).status).toBe(403);
  });

  it("l'accès public (formulaire, cron) est fermé", async () => {
    const { getPublicRepo } = await import("@/lib/repo");
    expect(getPublicRepo()).toBeNull();
  });

  it("hors démo publique, l'IA suit la présence de la clé", async () => {
    vi.stubEnv("PRIORA_PUBLIC_DEMO", "");
    const { aiConfigured } = await import("@/lib/ai/analyze");
    expect(aiConfigured()).toBe(true);
  });
});
