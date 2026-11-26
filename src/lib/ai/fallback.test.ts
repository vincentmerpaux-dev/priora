import { describe, expect, it } from "vitest";
import { clip } from "./fallback";

describe("clip", () => {
  it("garde un texte court et retire la ponctuation finale", () => {
    expect(clip("Nous avons 3 sites et une maintenance gérée sur Excel.", 120)).toBe(
      "Nous avons 3 sites et une maintenance gérée sur Excel",
    );
  });
  it("ne coupe jamais au milieu d'un mot", () => {
    const out = clip("ordres de travail, maintenance préventive, suivi des pannes et des stocks", 50);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/panne…$/);
    expect(out.length).toBeLessThanOrEqual(51);
  });
});

describe("endSentence", () => {
  it("ajoute un point seulement si besoin", async () => {
    const { endSentence } = await import("./fallback");
    expect(endSentence("suivi des pannes")).toBe("suivi des pannes.");
    expect(endSentence("suivi des…")).toBe("suivi des…");
  });
});

describe("pickNeedSentence et fillPrice", () => {
  it("retient la phrase de besoin, pas la présentation", async () => {
    const { pickNeedSentence } = await import("./fallback");
    expect(pickNeedSentence("Bonjour, je suis plaquiste à mon compte. J'ai un chantier lundi et le maître d'ouvrage exige mon attestation décennale.")).toMatch(/attestation/);
  });
  it("cite le prix du produit demandé", async () => {
    const { fillPrice } = await import("./fallback");
    const { PRODUCTS } = await import("@/lib/scoring/insurance");
    const dec = PRODUCTS.find((p) => p.key === "decennale")!;
    expect(fillPrice("Rebondir ({prix})", dec)).toBe("Rebondir (Décennale à partir de 69 €/mois)");
    expect(fillPrice("Rebondir ({prix})")).toContain("à partir de");
  });
});
