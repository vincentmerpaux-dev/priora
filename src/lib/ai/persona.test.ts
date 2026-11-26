import { describe, expect, it } from "vitest";
import { matchPersona, normalizePersonas } from "./persona";
import { rulesAnalysis } from "./fallback";
import type { Persona } from "@/lib/types";

const PERSONAS: Persona[] = [
  { name: "Responsable maintenance", role: "Responsable maintenance", challenges: "Sortir du tableur, réduire les pannes et suivre les interventions.", objections: ["Nous avons déjà un outil en place"] },
  { name: "Directeur des opérations", role: "Directeur des opérations", challenges: "Coût des arrêts de production et retour sur investissement.", objections: ["Quel est le retour sur investissement ?"] },
  { name: "Dirigeant de PME", role: "Gérant, directeur général", challenges: "Structurer la maintenance avec un budget maîtrisé.", objections: ["C'est trop cher pour notre taille"] },
];

const lead = (jobTitle: string | null, message = "") => ({ jobTitle, message, company: "ACME" });

describe("rattachement au persona", () => {
  it("rattache par la fonction du contact", () => {
    expect(matchPersona(lead("Responsable maintenance"), PERSONAS)?.persona.name).toBe("Responsable maintenance");
    expect(matchPersona(lead("Directeur des opérations"), PERSONAS)?.persona.name).toBe("Directeur des opérations");
    expect(matchPersona(lead("Gérant"), PERSONAS)?.persona.name).toBe("Dirigeant de PME");
  });

  it("explique le rattachement", () => {
    const m = matchPersona(lead("Responsable maintenance"), PERSONAS)!;
    expect(m.reason).toMatch(/fonction/);
  });

  it("à fonction inconnue, se rabat sur le vocabulaire du message", () => {
    const m = matchPersona(lead("Chargé de projets", "Nos pannes coûtent cher, le retour sur investissement doit être clair."), PERSONAS);
    expect(m?.persona.name).toBe("Directeur des opérations");
    expect(m?.reason).toMatch(/vocabulaire/);
  });

  it("ne rattache aucun persona quand rien ne correspond", () => {
    expect(matchPersona(lead("Étudiant", "Je cherche un stage."), PERSONAS)).toBeNull();
    expect(matchPersona(lead(null, ""), PERSONAS)).toBeNull();
    expect(matchPersona(lead("Directeur", "Bonjour"), [])).toBeNull();
  });
});

describe("compatibilité des anciens personas (S1)", () => {
  it("convertit {title, description}", () => {
    expect(normalizePersonas([{ title: "Dirigeant seul", description: "Décide seul." }])).toEqual([
      { name: "Dirigeant seul", role: "Dirigeant seul", challenges: "Décide seul.", objections: [] },
    ]);
  });
  it("ignore les entrées invalides", () => {
    expect(normalizePersonas(null)).toEqual([]);
    expect(normalizePersonas([42, {}, { name: "" }])).toEqual([]);
  });
});

describe("analyse par règles", () => {
  const base = {
    score: { total: 80, details: [] },
    objections: [],
    icp: { offer: "GMAO", idealCustomer: "PME", personas: PERSONAS },
  };
  const leadFull = (job: string) => ({ firstName: "A", lastName: "B", email: "a@b.example", company: "ACME", jobTitle: job, message: "Besoin d'un outil de maintenance", source: "formulaire" as const, location: null, enrichment: null });

  it("affiche le persona rattaché sur la fiche", () => {
    const a = rulesAnalysis({ ...base, lead: leadFull("Responsable maintenance") });
    expect(a.persona?.name).toBe("Responsable maintenance");
  });

  it("n'invente pas de persona sans correspondance ni sans persona défini", () => {
    expect(rulesAnalysis({ ...base, lead: leadFull("Stagiaire") }).persona).toBeNull();
    expect(rulesAnalysis({ ...base, icp: { offer: "", idealCustomer: "" }, lead: leadFull("Responsable maintenance") }).persona).toBeNull();
  });
});
