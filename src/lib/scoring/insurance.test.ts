import { describe, expect, it } from "vitest";
import { ORUS_ICP } from "@/lib/demo/orus";
import { scoreLead, verdictFromScore, type ScoringLead } from "./engine";
import { detectProducts, INSURANCE_CRITERIA } from "./insurance";

const NOW = new Date("2026-11-26T10:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

type Over = Partial<ScoringLead> & { employees?: { min: number; max: number; label: string }; sector?: string; created?: string };

function lead(over: Over): ScoringLead {
  const { employees, sector, created, ...rest } = over;
  return {
    email: "contact@exemple.example",
    phone: "06 00 00 00 00",
    company: "Entreprise fictive",
    jobTitle: "Gérant",
    website: null,
    location: null,
    message: "",
    source: "formulaire",
    sourceDetail: "Demande de devis",
    createdAt: hoursAgo(1),
    enrichment: {
      status: "ok",
      fetchedAt: NOW.toISOString(),
      notes: [],
      company: {
        siren: "999000001",
        legalName: "ENTREPRISE FICTIVE",
        nafCode: "43.31Z",
        sectorLabel: sector ?? "Travaux de construction spécialisés",
        employees: employees ?? { min: 0, max: 0, label: "0 salarié" },
        creationDate: created ?? "2024-05-10",
        city: "Lille",
        postalCode: "59000",
        department: "59",
        region: "Hauts-de-France",
        categorie: "TPE",
      },
    },
    ...rest,
  };
}

const detail = (r: ReturnType<typeof scoreLead>, key: string) => r.details.find((d) => d.key === key)!;

describe("critères Orus", () => {
  it("la somme des poids vaut 100 et le timing pèse le plus", () => {
    expect(INSURANCE_CRITERIA.reduce((s, c) => s + c.weight, 0)).toBe(100);
    const byCat = (cat: string) => INSURANCE_CRITERIA.filter((c) => c.category === cat).reduce((s, c) => s + c.weight, 0);
    expect(byCat("timing")).toBeGreaterThan(byCat("fit"));
    expect(byCat("timing")).toBeGreaterThan(byCat("intent"));
  });

  it("bon lead : plaquiste avec chantier lundi et attestation exigée, appeler maintenant", () => {
    const r = scoreLead(
      lead({
        jobTitle: "Gérant, plaquiste",
        message: "Je suis plaquiste. J'ai un chantier qui démarre lundi et le maître d'ouvrage me demande mon attestation décennale. Pouvez-vous me rappeler ce matin ?",
        sourceDetail: "Demande de devis décennale",
        createdAt: hoursAgo(0.5),
      }),
      ORUS_ICP,
      NOW,
    );
    expect(r.total).toBeGreaterThanOrEqual(75);
    expect(detail(r, "attestation_need").points).toBe(detail(r, "attestation_need").max);
    expect(detail(r, "product_request").reason).toContain("Décennale");
    expect(verdictFromScore(r.total, r.details)).toBe("call_now");
    expect(Object.values(r.breakdown).reduce((s, b) => s + b.max, 0)).toBeCloseTo(100, 0);
  });

  it("lead moyen : coiffeuse qui compare 3 devis, à nourrir avec un risque de comparaison", () => {
    const r = scoreLead(
      lead({
        jobTitle: "Gérante, coiffeuse",
        sector: "Autres services personnels",
        employees: { min: 1, max: 2, label: "1 à 2 salariés" },
        message: "Je compare 3 devis pour la multirisque de mon salon. J'ai un contrat qui se termine dans 3 mois. Je voulais surtout savoir vos tarifs.",
        source: "webhook",
        sourceDetail: "Comparateur",
        createdAt: hoursAgo(30),
      }),
      ORUS_ICP,
      NOW,
    );
    expect(r.total).toBeGreaterThanOrEqual(40);
    expect(r.total).toBeLessThan(70);
    expect(detail(r, "comparing").points).toBeLessThan(detail(r, "comparing").max / 2);
    expect(detail(r, "contract_expiry").reason).toContain("lointaine");
    expect(verdictFromScore(r.total, r.details)).toBe("nurture");
  });

  it("lead hors cible : 300 salariés et activité non couverte, à disqualifier", () => {
    const r = scoreLead(
      lead({
        company: "Aérotech Industrie Sud",
        jobTitle: "Directeur des achats",
        sector: "Fabrication d'autres matériels de transport",
        employees: { min: 250, max: 499, label: "250 à 499 salariés" },
        message: "Dans le cadre d'un appel d'offres groupe, nous souhaitons un devis d'assurance flotte pour nos 300 salariés.",
        source: "email",
        sourceDetail: "Email entrant",
        createdAt: hoursAgo(40),
      }),
      ORUS_ICP,
      NOW,
    );
    expect(r.total).toBeLessThan(40);
    expect(detail(r, "trade_covered").points).toBe(0);
    expect(detail(r, "size").points).toBe(0);
    expect(detail(r, "target_activity").points).toBe(0);
    expect(verdictFromScore(r.total, r.details)).toBe("disqualify");
  });

  it("sinistres répétés : le critère de sinistralité tombe à zéro", () => {
    const r = scoreLead(lead({ message: "J'ai eu trois sinistres en deux ans et mon assureur m'a résilié, il me faut une décennale." }), ORUS_ICP, NOW);
    expect(detail(r, "past_claims").points).toBe(0);
  });

  it("est déterministe", () => {
    const l = lead({ message: "Demande de devis RC Pro" });
    expect(scoreLead(l, ORUS_ICP, NOW)).toEqual(scoreLead(l, ORUS_ICP, NOW));
  });
});

describe("détection de produit", () => {
  it("reconnaît les offres publiques", () => {
    expect(detectProducts("Je cherche une RC Pro").map((p) => p.key)).toEqual(["rc_pro"]);
    expect(detectProducts("Décennale et multirisque").map((p) => p.key)).toEqual(["decennale", "multirisque"]);
    expect(detectProducts("Bonjour")).toHaveLength(0);
  });
});
