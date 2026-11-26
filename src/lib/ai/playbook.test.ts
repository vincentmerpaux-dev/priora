import { describe, expect, it } from "vitest";
import { ORUS_PLAYBOOK } from "@/lib/demo/orus";
import { inferCivility, playbookObjections, renderOpeningScript, whenLabel } from "./playbook";

const NOW = new Date("2026-11-26T10:00:00Z");
const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

describe("script d'ouverture configurable", () => {
  it("suit le style de rappel de lead : vouvoiement, civilité et nom, produit, quand", () => {
    const out = renderOpeningScript(
      ORUS_PLAYBOOK,
      { firstName: "Léa", lastName: "Fournier", message: "Je compare la multirisque de mon salon", sourceDetail: "Demande de devis multirisque", source: "formulaire", createdAt: ago(30) },
      NOW,
    );
    expect(out).toBe(
      "Bonjour Madame Fournier, Vincent, de chez Orus, l'assurance pour les professionnels. Je vois que vous avez fait une demande de devis pour une assurance multirisque professionnelle hier sur notre site. " +
        "Est-ce que vous avez deux minutes pour qu'on en discute ? Pour commencer, qu'est-ce qui vous a amenée à faire cette demande ?",
    );
  });

  it("accorde au masculin et adapte la phrase à un devis abandonné", () => {
    const out = renderOpeningScript(
      ORUS_PLAYBOOK,
      { firstName: "Youssef", lastName: "Amrani", message: "Devis multirisque commencé, je n'ai pas terminé", sourceDetail: "Devis abandonné", source: "webhook", createdAt: ago(9) },
      NOW,
    );
    expect(out).toContain("Bonjour Monsieur Amrani");
    expect(out).toContain("commencé un devis pour une assurance multirisque professionnelle aujourd'hui sur notre site, sans le terminer");
    expect(out).toContain("amené à faire");
  });

  it("reste neutre quand le prénom est inconnu", () => {
    expect(inferCivility("Zoran")).toBeNull();
    const out = renderOpeningScript(ORUS_PLAYBOOK, { firstName: "Zoran", lastName: "Petit", message: "" }, NOW);
    expect(out).toContain("Bonjour Zoran Petit");
    expect(out).toContain("amené(e)");
    expect(out).not.toMatch(/\{\w+\}/);
  });

  it("formule le délai de réception", () => {
    expect(whenLabel(ago(0.2), NOW)).toBe("il y a quelques minutes");
    expect(whenLabel(ago(80), NOW)).toBe("il y a 3 jours");
  });
});

describe("objections probables", () => {
  const library = ["Comparaison", "Prix", "Juste un prix", "Résiliation", "Rappel", "Confiance", "Obligation"].map((category) => ({ category }));
  it("sélectionne selon les déclencheurs du message", () => {
    const picked = playbookObjections(ORUS_PLAYBOOK, library, { message: "Je compare 3 devis, mon contrat arrive à échéance" }, 3).map((o) => o.category);
    expect(picked).toContain("Comparaison");
    expect(picked).toContain("Résiliation");
  });
});
