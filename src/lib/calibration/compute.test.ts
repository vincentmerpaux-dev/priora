import { describe, expect, it } from "vitest";
import type { ClosedLeadSample, Criterion, CriterionKey } from "@/lib/types";
import {
  applyWeights, computeCalibration, MAX_VARIATION, MIN_TOTAL_FOR_SUGGESTION, normalizeWeights, previewWeights, reasonStats, rescore, signalOf, suggestWeights, weightFactor, zScore,
} from "./compute";

const crit = (key: CriterionKey, weight: number, enabled = true): Criterion => ({ key, label: key, category: "fit", weight, enabled, description: "" });

/** Fabrique n leads avec un résultat et le ratio de chaque critère (points = ratio x max). */
function sample(i: number, won: boolean, ratios: Partial<Record<CriterionKey, number>>, total = 50): ClosedLeadSample {
  return {
    leadId: `l${i}`, result: won ? "won" : "lost", createdAt: "2026-01-01T00:00:00Z", scoreTotal: total, verdict: null,
    details: Object.entries(ratios).map(([key, r]) => ({ key: key as CriterionKey, points: r! * 10, max: 10 })),
  };
}

/**
 * Jeu de test : "urgency" sépare nettement (80 % de gains quand haut, 20 % quand bas), "zone" ne prédit rien (50/50),
 * "sector" est constant (jamais bas), "size" n'a que 5 leads bas, "decision_role" a 15 leads bas (indicatif).
 */
function dataset(): ClosedLeadSample[] {
  const out: ClosedLeadSample[] = [];
  let i = 0;
  // urgency haut : 40 leads, 32 gagnés ; urgency bas : 40 leads, 8 gagnés. zone alterne indépendamment.
  for (let k = 0; k < 40; k++) out.push(sample(i++, k < 32, { urgency: 1, zone: k % 2 === 0 ? 1 : 0.1, sector: 1, size: 1, decision_role: 1 }, 75));
  for (let k = 0; k < 40; k++) out.push(sample(i++, k < 8, { urgency: 0.1, zone: k % 2 === 0 ? 1 : 0.1, sector: 1, size: 1, decision_role: 1 }, 35));
  return out;
}

describe("calibration : statistiques", () => {
  const criteria = [crit("urgency", 20), crit("zone", 20), crit("sector", 20), crit("size", 20), crit("decision_role", 20)];

  it("calcule le taux de gain par tranche de score et par verdict", () => {
    const samples = dataset().map((s, i) => ({ ...s, verdict: (i < 40 ? "call_now" : "disqualify") as "call_now" | "disqualify" }));
    const c = computeCalibration({ samples, criteria, days: 90 });
    expect(c).toMatchObject({ total: 80, won: 40, lost: 40, winRate: 0.5 });
    expect(c.byBand.find((b) => b.key === "high")).toMatchObject({ leads: 40, won: 32, winRate: 0.8 });
    expect(c.byBand.find((b) => b.key === "low")).toMatchObject({ leads: 40, won: 8, winRate: 0.2 });
    expect(c.byBand.find((b) => b.key === "mid")).toMatchObject({ leads: 0, winRate: null });
    expect(c.byVerdict.find((v) => v.verdict === "call_now")).toMatchObject({ leads: 40, winRate: 0.8 });
    expect(c.byVerdict.find((v) => v.verdict === "nurture")).toMatchObject({ leads: 0, winRate: null });
  });

  it("mesure le pouvoir prédictif : écart en points, effectifs, fiabilité, signal", () => {
    const c = computeCalibration({ samples: dataset(), criteria, days: 90 });
    const by = Object.fromEntries(c.criteria.map((s) => [s.key, s]));
    expect(by.urgency).toMatchObject({ high: { n: 40, won: 32 }, low: { n: 40, won: 8 }, reliability: "reliable", signal: "strong" });
    expect(by.urgency!.gap).toBeCloseTo(60, 5);
    expect(by.zone!.gap).toBeCloseTo(0, 5);
    expect(by.zone).toMatchObject({ reliability: "reliable", signal: "none" });
    // Constant (jamais bas) : aucune conclusion possible.
    expect(by.sector).toMatchObject({ low: { n: 0, winRate: null }, gap: null, reliability: "insufficient", signal: "unknown" });
    // Trié du plus prédictif au moins prédictif.
    expect(c.criteria[0]!.key).toBe("urgency");
  });

  it("signale un effectif trop faible ou seulement indicatif", () => {
    const s: ClosedLeadSample[] = [];
    let i = 0;
    // size : 5 leads bas seulement -> insuffisant ; decision_role : 15 bas -> indicatif.
    for (let k = 0; k < 60; k++) s.push(sample(i++, k % 2 === 0, { size: k < 5 ? 0.1 : 1, decision_role: k < 15 ? 0.1 : 1 }));
    const c = computeCalibration({ samples: s, criteria: [crit("size", 10), crit("decision_role", 10)], days: 30 });
    const by = Object.fromEntries(c.criteria.map((x) => [x.key, x]));
    expect(by.size).toMatchObject({ reliability: "insufficient", signal: "unknown" });
    expect(by.decision_role!.reliability).toBe("indicative");
  });

  it("ignore les critères désactivés et reconnaît un critère à contre-sens", () => {
    const s: ClosedLeadSample[] = [];
    let i = 0;
    for (let k = 0; k < 60; k++) s.push(sample(i++, k >= 30, { zone: k < 30 ? 1 : 0.1, size: 1 }));
    const c = computeCalibration({ samples: s, criteria: [crit("zone", 10), crit("size", 10, false)], days: 30 });
    expect(c.criteria.map((x) => x.key)).toEqual(["zone"]);
    expect(c.criteria[0]).toMatchObject({ signal: "inverted" });
    expect(c.criteria[0]!.gap).toBeLessThan(-5);
  });

  it("z-score et signal : un écart sans significativité reste 'moyen'", () => {
    expect(zScore({ n: 0, won: 0, winRate: null }, { n: 10, won: 5, winRate: 0.5 })).toBeNull();
    expect(signalOf(20, "reliable", 0.9)).toBe("medium");
    expect(signalOf(20, "reliable", 3)).toBe("strong");
    expect(signalOf(2, "reliable", 0.1)).toBe("none");
    expect(signalOf(-12, "reliable", -1)).toBe("inverted");
    expect(signalOf(40, "insufficient", 5)).toBe("unknown");
  });

  it("regroupe les motifs de gain et de perte", () => {
    const r = reasonStats([
      { result: "won", reasonCode: "Réactivité" }, { result: "won", reasonCode: "Réactivité" }, { result: "won", reasonCode: null },
      { result: "lost", reasonCode: "Prix" }, { result: "lost", reasonCode: "Concurrent" }, { result: "lost", reasonCode: "Prix" },
    ]);
    expect(r.won).toEqual([{ code: "Réactivité", won: 2, lost: 0 }]);
    expect(r.lost[0]).toEqual({ code: "Prix", won: 0, lost: 2 });
  });
});

describe("suggestion de poids", () => {
  const criteria = [crit("urgency", 20), crit("zone", 20), crit("sector", 20), crit("size", 20), crit("decision_role", 20)];
  const cal = () => computeCalibration({ samples: dataset(), criteria, days: 90 });

  it("augmente le critère prédictif, baisse celui qui ne prédit rien, fige celui qui ne varie pas, somme = 100", () => {
    const s = suggestWeights(criteria, cal());
    const w = s.weights;
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBe(100);
    expect(w.urgency).toBeGreaterThan(20);
    expect(w.zone).toBeLessThan(20);
    expect(w.sector).toBe(20); // constant : poids figé
    expect(w.size).toBe(20);
    expect(s.changed).toBe(true);
    expect(s.changes[0]!.reason).toMatch(/prédictif|Ne prédit rien/);
    const urgency = s.changes.find((c) => c.key === "urgency")!;
    expect(urgency.reason).toContain("80 %");
    expect(urgency.reason).toContain("20 %");
  });

  it("respecte la borne de +/- 25 % pour chaque critère", () => {
    const s = suggestWeights(criteria, cal());
    for (const c of s.changes) {
      expect(c.after).toBeGreaterThanOrEqual(Math.floor(c.before * (1 - MAX_VARIATION)));
      expect(c.after).toBeLessThanOrEqual(Math.ceil(c.before * (1 + MAX_VARIATION)));
    }
  });

  it("renormalise à 100 des poids de départ qui ne font pas 100", () => {
    const odd = [crit("urgency", 12), crit("zone", 8), crit("sector", 6), crit("size", 5), crit("decision_role", 4)];
    expect(Object.values(normalizeWeights(odd)).reduce((a, b) => a + b, 0)).toBe(100);
    const s = suggestWeights(odd, computeCalibration({ samples: dataset(), criteria: odd, days: 90 }));
    expect(Object.values(s.weights).reduce((a, b) => a + b, 0)).toBe(100);
    expect(Object.values(s.weights).every((v) => Number.isInteger(v) && v >= 1)).toBe(true);
  });

  it("garde 100 et les bornes sur de nombreuses configurations aléatoires (propriété)", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const keys: CriterionKey[] = ["urgency", "zone", "sector", "size", "decision_role", "budget_signal", "message_intent"];
    for (let t = 0; t < 40; t++) {
      const cs = keys.map((k) => crit(k, 1 + Math.floor(rnd() * 30)));
      const samples: ClosedLeadSample[] = [];
      for (let i = 0; i < 90; i++) {
        const ratios = Object.fromEntries(keys.map((k) => [k, rnd() < 0.5 ? 0.9 : 0.1])) as Partial<Record<CriterionKey, number>>;
        samples.push(sample(i, rnd() < 0.2 + 0.5 * (ratios.urgency ?? 0), ratios));
      }
      const base = normalizeWeights(cs);
      const s = suggestWeights(cs, computeCalibration({ samples, criteria: cs, days: 90 }));
      expect(Object.values(s.weights).reduce((a, b) => a + b, 0)).toBe(100);
      for (const k of keys) {
        const b = base[k]!;
        expect(s.weights[k]).toBeGreaterThanOrEqual(Math.max(1, Math.floor(b * (1 - MAX_VARIATION))));
        expect(s.weights[k]).toBeLessThanOrEqual(Math.max(1, Math.ceil(b * (1 + MAX_VARIATION))));
      }
    }
  });

  it("n'avance rien quand l'effectif est trop faible (moins de 30 leads clos)", () => {
    const few = dataset().slice(0, MIN_TOTAL_FOR_SUGGESTION - 1);
    const s = suggestWeights(criteria, computeCalibration({ samples: few, criteria, days: 30 }));
    expect(s.changed).toBe(false);
    expect(s.blockedReason).toContain("Pas assez de leads clos");
    expect(s.changes).toEqual([]);
  });

  it("ne change rien quand aucun critère ne se distingue", () => {
    const flat: ClosedLeadSample[] = [];
    // Tous les critères : 50 % de gains dans les deux groupes... sauf signal 'none' partout => baisse uniforme, donc poids inchangés après renormalisation.
    for (let i = 0; i < 80; i++) flat.push(sample(i, i % 2 === 0, { urgency: i % 4 < 2 ? 1 : 0.1, zone: i % 8 < 4 ? 1 : 0.1 }));
    const cs = [crit("urgency", 50), crit("zone", 50)];
    const s = suggestWeights(cs, computeCalibration({ samples: flat, criteria: cs, days: 90 }));
    expect(s.weights).toEqual({ urgency: 50, zone: 50 });
    expect(s.changed).toBe(false);
  });

  it("réduit de moitié la variation quand l'effectif n'est qu'indicatif", () => {
    const strongReliable = weightFactor({ signal: "strong", gap: 40, reliability: "reliable" });
    const strongIndicative = weightFactor({ signal: "strong", gap: 40, reliability: "indicative" });
    expect(strongReliable).toBeCloseTo(1.25, 5);
    expect(strongIndicative).toBeCloseTo(1.125, 5);
    expect(weightFactor({ signal: "unknown", gap: null, reliability: "insufficient" })).toBe(1);
    expect(weightFactor({ signal: "inverted", gap: -20, reliability: "reliable" })).toBeCloseTo(0.75, 5);
  });

  it("applyWeights ne touche pas aux critères inactifs", () => {
    const cs = [crit("urgency", 20), crit("zone", 20), crit("size", 33, false)];
    const out = applyWeights(cs, { urgency: 60, zone: 40 });
    expect(out.map((c) => [c.key, c.weight, c.enabled])).toEqual([["urgency", 60, true], ["zone", 40, true], ["size", 33, false]]);
  });
});

describe("aperçu avant / après", () => {
  const criteria = [crit("urgency", 20), crit("zone", 20), crit("sector", 20), crit("size", 20), crit("decision_role", 20)];

  it("avec les mêmes poids : aucun verdict ne change, tranches identiques", () => {
    const w = normalizeWeights(criteria);
    const p = previewWeights(dataset(), w, w);
    expect(p.verdictChanges).toEqual({ total: 0, promoted: 0, demoted: 0 });
    for (const b of p.bands) expect(b.after).toEqual(b.before);
  });

  it("recalcule le score avec de nouveaux poids et compte les changements de verdict", () => {
    const s = dataset();
    // Un lead moyen ("urgency" haut seulement) : plus de poids sur urgency le fait passer à "Appeler maintenant".
    const probe = sample(999, true, { urgency: 1, zone: 0.1, sector: 0.4, size: 0.4, decision_role: 0.4 });
    const before = { urgency: 20, zone: 20, sector: 20, size: 20, decision_role: 20 };
    const after = { urgency: 70, zone: 5, sector: 5, size: 10, decision_role: 10 };
    expect(rescore(probe, before)).toBeLessThan(70);
    expect(rescore(probe, after)).toBeGreaterThanOrEqual(70);
    const p = previewWeights([...s, probe], before, after);
    expect(p.verdictChanges.promoted).toBeGreaterThanOrEqual(1);
    expect(p.verdictChanges.total).toBe(p.verdictChanges.promoted + p.verdictChanges.demoted);
    expect(p.bands.reduce((n, b) => n + b.after.leads, 0)).toBe(s.length + 1);
  });

  it("le taux de gain simulé de la tranche haute monte quand on donne du poids au critère prédictif", () => {
    const before = normalizeWeights(criteria);
    const after = { urgency: 65, zone: 5, sector: 10, size: 10, decision_role: 10 };
    const p = previewWeights(dataset(), before, after);
    const high = p.bands.find((b) => b.key === "high")!;
    const low = p.bands.find((b) => b.key === "low")!;
    expect((high.after.winRate ?? 0)).toBeGreaterThanOrEqual(high.before.winRate ?? 0);
    expect((high.after.winRate ?? 0)).toBeGreaterThan(low.after.winRate ?? 1);
  });
});
