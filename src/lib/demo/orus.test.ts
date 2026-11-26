import { describe, expect, it } from "vitest";
import { ORUS_BANNER, ORUS_ICP, buildOrusBase } from "./orus";

describe("cas Orus : données de démonstration", () => {
  const d = buildOrusBase();

  it("contient 25 à 30 leads fictifs, tous étiquetés démo", () => {
    expect(d.leads.length).toBeGreaterThanOrEqual(25);
    expect(d.leads.length).toBeLessThanOrEqual(30);
    expect(d.leads.every((l) => l.isDemo)).toBe(true);
    expect(d.leads.every((l) => l.email.endsWith(".example"))).toBe(true);
    expect(d.leads.every((l) => l.enrichment?.company?.siren.startsWith("999") ?? true)).toBe(true);
  });

  it("répartit les verdicts entre appeler, nourrir et disqualifier", () => {
    const count = (v: string) => [...d.verdictByLead.values()].filter((x) => x === v).length;
    expect(count("call_now")).toBeGreaterThanOrEqual(6);
    expect(count("nurture")).toBeGreaterThanOrEqual(6);
    expect(count("disqualify")).toBeGreaterThanOrEqual(4);
  });

  it("donne les bons verdicts aux cas emblématiques", () => {
    const verdict = (last: string) => d.verdictByLead.get(d.leads.find((l) => l.lastName === last)!.id);
    expect(verdict("Roussel")).toBe("call_now");
    expect(verdict("Marchand")).toBe("call_now");
    expect(verdict("Fournier")).toBe("nurture");
    expect(verdict("Aubin")).toBe("nurture");
    expect(verdict("Bellanger")).toBe("disqualify");
  });

  it("le script d'ouverture suit le style Orus et les 8 questions de découverte sont présentes", () => {
    const a = d.analyses.find((x) => x.leadId === d.leads.find((l) => l.lastName === "Roussel")!.id)!;
    expect(a.content.openingScript).toMatch(/^Bonjour Monsieur Roussel, Vincent, de chez Orus, l'assurance pour les professionnels\./);
    expect(a.content.discoveryQuestions).toHaveLength(8);
    expect(a.content.objections.every((o) => o.fromLibrary)).toBe(true);
  });

  it("les objections suivent Acquiescer, Questionner, Rebondir et chaque prix est en à partir de", () => {
    expect(d.objections).toHaveLength(7);
    for (const o of d.objections) expect(o.response).toMatch(/Acquiescer.*\n.*Questionner.*\n.*Rebondir/s);
    const texts = [ORUS_ICP.offer, ...d.objections.map((o) => o.response)].join(" ");
    const prices = [...texts.matchAll(/\d+ €\/mois/g)];
    expect(prices.length).toBeGreaterThan(0);
    for (const m of prices) {
      const before = texts.slice(Math.max(0, (m.index ?? 0) - 14), m.index);
      expect(before, `prix ${m[0]} sans "à partir de"`).toContain("à partir de");
    }
  });

  it("aucun tiret long dans les textes et bandeau conforme", () => {
    const all = JSON.stringify([d.leads, d.objections, d.analyses, ORUS_ICP, ORUS_BANNER]);
    expect(all).not.toMatch(/[—–]/);
    expect(ORUS_BANNER).toContain("Vincent Merpaux");
    expect(ORUS_BANNER).toContain("Leads et chiffres fictifs");
  });
});
