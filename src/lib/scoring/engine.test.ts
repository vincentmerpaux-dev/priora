import { describe, expect, it } from "vitest";
import { DEFAULT_CRITERIA } from "./defaults";
import { scoreLead, verdictFromScore, VERDICT_THRESHOLDS, type ScoringIcp, type ScoringLead } from "./engine";

const NOW = new Date("2026-03-10T10:00:00Z");

const icp: ScoringIcp = {
  sectors: ["logistique", "industrie"],
  sizeMin: 20,
  sizeMax: 250,
  zones: ["Auvergne-Rhône-Alpes", "69"],
  decisionRoles: ["Directeur", "Responsable maintenance"],
  criteria: DEFAULT_CRITERIA.map((c) => ({ ...c })),
};

function lead(over: Partial<ScoringLead> = {}): ScoringLead {
  return {
    email: "marie@societe-exemple.test",
    phone: "0600000000",
    company: "Société Exemple",
    jobTitle: "Directeur des opérations",
    website: null,
    location: null,
    message: "Nous cherchons un outil, demande de devis urgent. Budget validé de 20 k€.",
    source: "formulaire",
    sourceDetail: "Demande de démo",
    enrichment: {
      status: "ok",
      fetchedAt: NOW.toISOString(),
      notes: [],
      company: {
        siren: "999000001",
        legalName: "SOCIETE EXEMPLE",
        nafCode: "52.29A",
        sectorLabel: "Transports et logistique",
        employees: { min: 50, max: 99, label: "50 à 99 salariés" },
        creationDate: "2012-01-01",
        city: "LYON",
        postalCode: "69003",
        department: "69",
        region: "Auvergne-Rhône-Alpes",
        categorie: "PME",
      },
    },
    createdAt: NOW.toISOString(),
    ...over,
  };
}

describe("scoreLead", () => {
  it("donne un score élevé à un lead parfaitement dans la cible", () => {
    const r = scoreLead(lead(), icp, NOW);
    expect(r.total).toBeGreaterThanOrEqual(90);
    expect(verdictFromScore(r.total, r.details)).toBe("call_now");
  });

  it("garde un score entre 0 et 100 et la somme des maxima vaut 100", () => {
    const r = scoreLead(lead(), icp, NOW);
    expect(r.total).toBeLessThanOrEqual(100);
    const sumMax = r.details.reduce((s, d) => s + d.max, 0);
    expect(Math.round(sumMax)).toBe(100);
  });

  it("justifie chaque critère avec des points et une raison", () => {
    const r = scoreLead(lead(), icp, NOW);
    expect(r.details).toHaveLength(10);
    for (const d of r.details) {
      expect(d.reason.length).toBeGreaterThan(5);
      expect(d.points).toBeGreaterThanOrEqual(0);
      expect(d.points).toBeLessThanOrEqual(d.max + 0.1);
    }
  });

  it("pénalise un lead hors cible, froid et sans intention", () => {
    const r = scoreLead(
      lead({
        email: "jean@gmail.com",
        phone: null,
        jobTitle: "Stagiaire",
        message: "Bonjour, je cherche un stage dans votre entreprise.",
        source: "csv",
        sourceDetail: null,
        createdAt: "2026-02-01T10:00:00Z",
        enrichment: {
          status: "ok",
          fetchedAt: NOW.toISOString(),
          notes: [],
          company: {
            siren: "999000002", legalName: "BOULANGERIE", nafCode: "10.71C", sectorLabel: "Boulangerie",
            employees: { min: 1, max: 2, label: "1 à 2 salariés" }, creationDate: null, city: "LILLE",
            postalCode: "59000", department: "59", region: "Hauts-de-France", categorie: "PME",
          },
        },
      }),
      icp,
      NOW,
    );
    expect(r.total).toBeLessThan(VERDICT_THRESHOLDS.nurture);
    expect(verdictFromScore(r.total, r.details)).toBe("disqualify");
  });

  it("disqualifie un message hors sujet commercial même si le profil est bon", () => {
    const r = scoreLead(lead({ message: "Candidature spontanée pour un poste." }), icp, NOW);
    const intent = r.details.find((d) => d.key === "message_intent");
    expect(intent?.points).toBe(0);
    expect(verdictFromScore(r.total, r.details)).toBe("disqualify");
  });

  it("applique la décroissance de fraîcheur", () => {
    const fresh = scoreLead(lead({ createdAt: NOW.toISOString() }), icp, NOW).details.find((d) => d.key === "freshness")!;
    const old = scoreLead(lead({ createdAt: "2026-02-01T10:00:00Z" }), icp, NOW).details.find((d) => d.key === "freshness")!;
    expect(fresh.points).toBeGreaterThan(old.points);
  });

  it("reste prudent quand l'enrichissement est absent", () => {
    const r = scoreLead(lead({ enrichment: null }), icp, NOW);
    const size = r.details.find((d) => d.key === "size")!;
    expect(size.points).toBeCloseTo(size.max * 0.3, 0);
    expect(size.reason).toMatch(/inconnu/i);
  });

  it("normalise les poids : doubler un poids ne casse pas le total à 100", () => {
    const custom = { ...icp, criteria: icp.criteria.map((c) => (c.key === "sector" ? { ...c, weight: 24 } : c)) };
    const r = scoreLead(lead(), custom, NOW);
    expect(Math.round(r.details.reduce((s, d) => s + d.max, 0))).toBe(100);
    expect(r.details.find((d) => d.key === "sector")!.max).toBeGreaterThan(20);
  });

  it("ignore les critères désactivés", () => {
    const custom = { ...icp, criteria: icp.criteria.map((c) => (c.key === "zone" ? { ...c, enabled: false } : c)) };
    const r = scoreLead(lead(), custom, NOW);
    expect(r.details.find((d) => d.key === "zone")).toBeUndefined();
    expect(r.details).toHaveLength(9);
  });

  it("renvoie 0 si aucun critère actif", () => {
    const r = scoreLead(lead(), { ...icp, criteria: [] }, NOW);
    expect(r.total).toBe(0);
    expect(r.details).toEqual([]);
  });

  it("détecte les zones par département et par région", () => {
    const byDept = scoreLead(lead(), { ...icp, zones: ["69"] }, NOW).details.find((d) => d.key === "zone")!;
    expect(byDept.points).toBeCloseTo(byDept.max, 0);
    const out = scoreLead(lead(), { ...icp, zones: ["Bretagne"] }, NOW).details.find((d) => d.key === "zone")!;
    expect(out.points).toBe(0);
  });

  it("est déterministe", () => {
    expect(scoreLead(lead(), icp, NOW)).toEqual(scoreLead(lead(), icp, NOW));
  });
});

describe("verdictFromScore", () => {
  it("respecte les seuils", () => {
    expect(verdictFromScore(70, [])).toBe("call_now");
    expect(verdictFromScore(69, [])).toBe("nurture");
    expect(verdictFromScore(40, [])).toBe("nurture");
    expect(verdictFromScore(39, [])).toBe("disqualify");
  });
});
