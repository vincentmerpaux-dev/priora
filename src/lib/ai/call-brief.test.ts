import { describe, expect, it } from "vitest";
import { buildCallBrief, firstSentence } from "@/lib/ai/call-brief";

const analysis = {
  openingScript: "Bonjour. Je suis Léa de Maintia, vous avez demandé une démonstration hier. Avez-vous deux minutes ?",
  discoveryQuestions: ["Combien d'équipements suivez-vous aujourd'hui ?", "Qui décide ?"],
  objections: [
    { objection: "C'est trop cher", response: "Comparons au coût d'un arrêt de ligne. Une panne évitée rembourse l'abonnement.", fromLibrary: true },
    { objection: "Autre", response: "Autre réponse.", fromLibrary: false },
  ],
};

describe("encadré « À dire à l'appel »", () => {
  it("produit exactement 3 lignes à partir de l'analyse", () => {
    const b = buildCallBrief(analysis);
    expect(b.hook).toBe("Je suis Léa de Maintia, vous avez demandé une démonstration hier.");
    expect(b.question).toBe("Combien d'équipements suivez-vous aujourd'hui ?");
    expect(b.objection).toEqual({ objection: "C'est trop cher", answer: "Comparons au coût d'un arrêt de ligne." });
  });

  it("sans objection, la troisième ligne est absente (rien d'inventé)", () => {
    expect(buildCallBrief({ ...analysis, objections: [] }).objection).toBeNull();
  });

  it("coupe les phrases trop longues sur un mot, avec une ellipse", () => {
    const long = "mot ".repeat(80).trim();
    const out = firstSentence(long, 60);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/mo…$/);
  });

  it("gère un script sans ponctuation et un texte vide", () => {
    expect(firstSentence("Bonjour je vous appelle", 100)).toBe("Bonjour je vous appelle");
    expect(firstSentence("   ", 100)).toBe("");
  });

  it("saute la salutation à champs à compléter et ne coupe pas une citation", () => {
    const b = buildCallBrief({
      openingScript: "Bonjour Claire, c'est [votre prénom] de [votre entreprise]. Je vous appelle suite à votre demande, vous avez 30 secondes ?",
      discoveryQuestions: ["Q ?"],
      objections: [{ objection: "Non", response: "Acquiescer : « Bien sûr, c'est la première chose à savoir. Puis recadrer. » Ensuite autre chose.", fromLibrary: true }],
    });
    expect(b.hook).toBe("Je vous appelle suite à votre demande, vous avez 30 secondes ?");
    expect(b.objection?.answer).toContain("Puis recadrer. »");
  });
});
