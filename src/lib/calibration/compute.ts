import { SCORE_BANDS } from "@/lib/team/stats";
import { VERDICT_THRESHOLDS } from "@/lib/scoring/engine";
import type { ClosedLeadSample, Criterion, CriterionCategory, CriterionKey, Outcome, Verdict } from "@/lib/types";

/**
 * CALIBRATION DU SCORE (S3). Fonctions pures : mêmes entrées, mêmes sorties.
 * Question posée : sur les leads déjà clos (gagnés ou perdus), le score et chacun de ses critères
 * séparent-ils réellement les gagnés des perdus ?
 *
 * Règles volontairement simples, explicables à un commercial :
 * - un critère est "haut" pour un lead s'il lui rapporte au moins la moitié de ses points possibles, "bas" sinon ;
 * - pouvoir prédictif = taux de gain des leads "haut" moins taux de gain des leads "bas", en points de pourcentage ;
 * - fiabilité : selon le plus petit des deux groupes (moins de 10 leads clos : aucune conclusion).
 */

export const MIN_GROUP = 10;
export const RELIABLE_GROUP = 25;
export const MIN_TOTAL_FOR_SUGGESTION = 30;
export const HIGH_RATIO = 0.5;
/** Écart, en points de pourcentage, à partir duquel un critère est jugé prédictif (moyen) ou très prédictif. */
export const GAP_MEDIUM = 5;
export const GAP_STRONG = 15;
/** Variation maximale d'un poids par application d'une suggestion (+ ou - 25 %). */
export const MAX_VARIATION = 0.25;
export const Z_SIGNIFICANT = 1.64;

const rate = (won: number, n: number): number | null => (n > 0 ? won / n : null);

export interface GroupStat { n: number; won: number; winRate: number | null }
export type Reliability = "insufficient" | "indicative" | "reliable";
export type Signal = "strong" | "medium" | "none" | "inverted" | "unknown";

export interface CriterionStat {
  key: CriterionKey;
  label: string;
  category: CriterionCategory;
  /** Poids actuel, ramené à 100 sur les critères actifs. */
  weight: number;
  high: GroupStat;
  low: GroupStat;
  /** Écart de taux de gain (haut moins bas), en points de pourcentage. Null si un groupe est vide. */
  gap: number | null;
  z: number | null;
  reliability: Reliability;
  signal: Signal;
}

export interface BandStat { key: string; label: string; leads: number; won: number; lost: number; winRate: number | null }
export interface VerdictStat { verdict: Verdict; leads: number; won: number; winRate: number | null }

export interface Calibration {
  days: number;
  total: number;
  won: number;
  lost: number;
  winRate: number | null;
  byBand: BandStat[];
  byVerdict: VerdictStat[];
  criteria: CriterionStat[];
  enoughData: boolean;
}

export function band(total: number): (typeof SCORE_BANDS)[number] {
  return SCORE_BANDS.find((b) => total >= b.min && total <= b.max) ?? SCORE_BANDS[0];
}

export function verdictOf(total: number): Verdict {
  return total >= VERDICT_THRESHOLDS.callNow ? "call_now" : total >= VERDICT_THRESHOLDS.nurture ? "nurture" : "disqualify";
}

/** Poids actifs ramenés à 100, en entiers (plus grand reste). Les critères inactifs sont ignorés. */
export function normalizeWeights(criteria: Pick<Criterion, "key" | "weight" | "enabled">[]): Record<string, number> {
  const active = criteria.filter((c) => c.enabled && c.weight > 0);
  const sum = active.reduce((s, c) => s + c.weight, 0);
  if (sum === 0) return {};
  const raw = active.map((c) => ({ key: c.key, exact: (c.weight / sum) * 100 }));
  return largestRemainder(raw.map((r) => ({ key: r.key, exact: r.exact, lo: 0, hi: 100 })), 100);
}

/** Arrondit des valeurs réelles en entiers dont la somme vaut `total`, en respectant des bornes entières. */
function largestRemainder(items: { key: string; exact: number; lo: number; hi: number }[], total: number): Record<string, number> {
  const out = items.map((i) => ({ ...i, v: Math.min(i.hi, Math.max(i.lo, Math.floor(i.exact))) }));
  let remaining = total - out.reduce((s, i) => s + i.v, 0);
  const order = [...out].sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)));
  while (remaining > 0) {
    const next = order.find((i) => i.v < i.hi);
    if (!next) break;
    next.v++;
    remaining--;
    order.push(order.splice(order.indexOf(next), 1)[0]!);
  }
  // Excédent (bornes basses relevées) : on retire là où il reste de la marge.
  while (remaining < 0) {
    const next = [...out].sort((a, b) => b.v - a.v).find((i) => i.v > i.lo);
    if (!next) break;
    next.v--;
    remaining++;
  }
  return Object.fromEntries(out.map((i) => [i.key, i.v]));
}

function groupStat(list: ClosedLeadSample[]): GroupStat {
  const won = list.filter((s) => s.result === "won").length;
  return { n: list.length, won, winRate: rate(won, list.length) };
}

/** Test z de deux proportions (variance combinée). Null si un groupe est vide ou si la variance est nulle. */
export function zScore(a: GroupStat, b: GroupStat): number | null {
  if (a.n === 0 || b.n === 0) return null;
  const p = (a.won + b.won) / (a.n + b.n);
  const se = Math.sqrt(p * (1 - p) * (1 / a.n + 1 / b.n));
  return se === 0 ? null : (a.won / a.n - b.won / b.n) / se;
}

export function reliabilityOf(high: GroupStat, low: GroupStat): Reliability {
  const m = Math.min(high.n, low.n);
  return m < MIN_GROUP ? "insufficient" : m < RELIABLE_GROUP ? "indicative" : "reliable";
}

export function signalOf(gap: number | null, reliability: Reliability, z: number | null): Signal {
  if (gap === null || reliability === "insufficient") return "unknown";
  if (gap >= GAP_STRONG && z !== null && Math.abs(z) >= Z_SIGNIFICANT) return "strong";
  if (gap >= GAP_MEDIUM) return "medium";
  if (gap <= -GAP_MEDIUM) return "inverted";
  return "none";
}

export function computeCalibration(input: { samples: ClosedLeadSample[]; criteria: Criterion[]; days: number }): Calibration {
  const { samples, criteria, days } = input;
  const won = samples.filter((s) => s.result === "won").length;
  const lost = samples.length - won;

  const byBand: BandStat[] = SCORE_BANDS.map((b) => {
    const inBand = samples.filter((s) => s.scoreTotal >= b.min && s.scoreTotal <= b.max);
    const w = inBand.filter((s) => s.result === "won").length;
    return { key: b.key, label: b.label, leads: inBand.length, won: w, lost: inBand.length - w, winRate: rate(w, inBand.length) };
  });

  const byVerdict: VerdictStat[] = (["call_now", "nurture", "disqualify"] as Verdict[]).map((v) => {
    const list = samples.filter((s) => s.verdict === v);
    const w = list.filter((s) => s.result === "won").length;
    return { verdict: v, leads: list.length, won: w, winRate: rate(w, list.length) };
  });

  const weights = normalizeWeights(criteria);
  const stats: CriterionStat[] = criteria
    .filter((c) => c.enabled && c.weight > 0)
    .map((c) => {
      const high: ClosedLeadSample[] = [];
      const low: ClosedLeadSample[] = [];
      for (const s of samples) {
        const d = s.details.find((x) => x.key === c.key);
        if (!d || d.max <= 0) continue;
        (d.points / d.max >= HIGH_RATIO ? high : low).push(s);
      }
      const h = groupStat(high);
      const l = groupStat(low);
      const gap = h.winRate !== null && l.winRate !== null ? (h.winRate - l.winRate) * 100 : null;
      const z = zScore(h, l);
      const reliability = reliabilityOf(h, l);
      return { key: c.key, label: c.label, category: c.category, weight: weights[c.key] ?? 0, high: h, low: l, gap, z, reliability, signal: signalOf(gap, reliability, z) };
    })
    .sort((a, b) => (b.gap ?? -Infinity) - (a.gap ?? -Infinity));

  return { days, total: samples.length, won, lost, winRate: rate(won, samples.length), byBand, byVerdict, criteria: stats, enoughData: samples.length >= MIN_TOTAL_FOR_SUGGESTION };
}

/* ---------- Suggestions de poids ---------- */

export interface WeightChange {
  key: CriterionKey;
  label: string;
  before: number;
  after: number;
  signal: Signal;
  reliability: Reliability;
  reason: string;
}

export interface Suggestion {
  /** Poids proposés pour les critères actifs (somme = 100). */
  weights: Record<string, number>;
  changes: WeightChange[];
  changed: boolean;
  /** Message quand aucune suggestion n'est possible (effectif trop faible). */
  blockedReason: string | null;
}

/** Facteur multiplicatif du poids selon le signal. Moitié moins fort quand la fiabilité n'est qu'indicative. */
export function weightFactor(stat: Pick<CriterionStat, "signal" | "gap" | "reliability">): number {
  let f = 1;
  if (stat.signal === "strong" || stat.signal === "medium") f = 1 + Math.min(MAX_VARIATION, (stat.gap ?? 0) / 60);
  else if (stat.signal === "none") f = 1 - 0.2;
  else if (stat.signal === "inverted") f = 1 - MAX_VARIATION;
  if (stat.reliability === "indicative") f = 1 + (f - 1) / 2;
  return f;
}

const pct = (v: number | null) => (v === null ? "n.d." : `${Math.round(v * 100)} %`);

function explain(s: CriterionStat, before: number, after: number): string {
  const detail = `${pct(s.high.winRate)} de gains quand le critère rapporte beaucoup de points (${s.high.n} leads) contre ${pct(s.low.winRate)} sinon (${s.low.n} leads)`;
  if (s.signal === "unknown") return s.high.n === 0 || s.low.n === 0 ? "Ce critère ne varie pas assez dans l'échantillon pour conclure : poids inchangé." : `Effectif trop faible (${Math.min(s.high.n, s.low.n)} leads dans le plus petit groupe, 10 minimum) : poids inchangé.`;
  const predictive = s.signal === "strong" || s.signal === "medium";
  const verb = after > before
    ? "poids augmenté"
    : after < before
      ? predictive ? "poids très légèrement réduit : la renormalisation à 100 profite à des critères plus sûrs" : "poids réduit"
      : "poids inchangé";
  const lead = s.signal === "strong" ? "Critère très prédictif" : s.signal === "medium" ? "Critère prédictif" : s.signal === "inverted" ? "Critère à contre-sens" : "Ne prédit rien";
  return `${lead} : ${detail} ; ${verb}${s.reliability === "indicative" ? " (variation réduite de moitié, effectif indicatif)" : ""}.`;
}

/**
 * Suggestion de poids : chaque poids actuel (ramené à 100) est multiplié par un facteur selon le pouvoir prédictif,
 * borné à +/- 25 %, puis l'ensemble est renormalisé à 100 sans sortir des bornes. Tout est entier.
 */
export function suggestWeights(criteria: Criterion[], cal: Calibration): Suggestion {
  const base = normalizeWeights(criteria);
  const keys = Object.keys(base);
  if (keys.length === 0) return { weights: {}, changes: [], changed: false, blockedReason: "Aucun critère actif." };
  if (!cal.enoughData) {
    return { weights: base, changes: [], changed: false, blockedReason: `Pas assez de leads clos sur la période (${cal.total}, minimum ${MIN_TOTAL_FOR_SUGGESTION}) pour proposer des poids.` };
  }

  const byKey = new Map(cal.criteria.map((c) => [c.key as string, c]));
  const items = keys.map((k) => {
    const w0 = base[k]!;
    const stat = byKey.get(k);
    const factor = stat ? weightFactor(stat) : 1;
    // Bornes entières : jamais sous 1 pour un critère actif, jamais au-delà de +25 % (arrondi supérieur).
    let lo = Math.max(1, Math.floor(w0 * (1 - MAX_VARIATION)));
    let hi = Math.max(lo, Math.ceil(w0 * (1 + MAX_VARIATION)));
    // Pas de conclusion possible (effectif trop faible, critère qui ne varie pas) : le poids est figé, la renormalisation se fait sur les autres.
    if (!stat || stat.signal === "unknown") { lo = w0; hi = w0; }
    return { key: k, w0, target: w0 * factor, lo, hi };
  });

  // Recherche du coefficient commun qui ramène la somme à 100 tout en respectant les bornes (bissection).
  const sumAt = (lambda: number) => items.reduce((s, i) => s + Math.min(i.hi, Math.max(i.lo, i.target * lambda)), 0);
  let a = 0.01;
  let b = 100;
  for (let n = 0; n < 80; n++) {
    const mid = (a + b) / 2;
    if (sumAt(mid) < 100) a = mid;
    else b = mid;
  }
  const lambda = (a + b) / 2;
  const exact = items.map((i) => ({ key: i.key, exact: Math.min(i.hi, Math.max(i.lo, i.target * lambda)), lo: i.lo, hi: i.hi }));
  const weights = largestRemainder(exact, 100);

  const changes: WeightChange[] = items
    .map((i) => {
      const stat = byKey.get(i.key);
      const after = weights[i.key]!;
      const crit = criteria.find((c) => c.key === i.key)!;
      return {
        key: i.key as CriterionKey, label: crit.label, before: i.w0, after,
        signal: stat?.signal ?? "unknown", reliability: stat?.reliability ?? "insufficient",
        reason: stat ? explain(stat, i.w0, after) : "Aucune donnée sur ce critère.",
      };
    })
    .sort((x, y) => Math.abs(y.after - y.before) - Math.abs(x.after - x.before) || y.before - x.before);
  return { weights, changes, changed: changes.some((c) => c.after !== c.before), blockedReason: null };
}

/** Critères de la configuration avec de nouveaux poids (les critères inactifs gardent leur poids et leur état). */
export function applyWeights(criteria: Criterion[], weights: Record<string, number>): Criterion[] {
  return criteria.map((c) => (c.key in weights ? { ...c, weight: weights[c.key]! } : { ...c }));
}

/* ---------- Aperçu avant / après ---------- */

export interface PreviewBand { key: string; label: string; before: { leads: number; winRate: number | null }; after: { leads: number; winRate: number | null } }
export interface Preview {
  leads: number;
  verdictChanges: { total: number; promoted: number; demoted: number };
  bands: PreviewBand[];
}

/**
 * Re-note les leads clos avec d'autres poids. Chaque lead a gardé les points obtenus par critère : le ratio
 * (points / maximum) est indépendant du poids, il suffit de le multiplier par le nouveau poids.
 * "Avant" et "après" sont recalculés de la même façon, donc comparables ; le verdict est celui des seuils (70 et 40).
 */
export function rescore(sample: ClosedLeadSample, weights: Record<string, number>): number {
  let num = 0;
  let den = 0;
  for (const d of sample.details) {
    const w = weights[d.key];
    if (!w || d.max <= 0) continue;
    num += (d.points / d.max) * w;
    den += w;
  }
  return den === 0 ? 0 : Math.max(0, Math.min(100, Math.round((num / den) * 100)));
}

export function previewWeights(samples: ClosedLeadSample[], current: Record<string, number>, proposed: Record<string, number>): Preview {
  const order: Verdict[] = ["disqualify", "nurture", "call_now"];
  let promoted = 0;
  let demoted = 0;
  const rows = samples.map((s) => {
    const before = rescore(s, current);
    const after = rescore(s, proposed);
    const vb = order.indexOf(verdictOf(before));
    const va = order.indexOf(verdictOf(after));
    if (va > vb) promoted++;
    else if (va < vb) demoted++;
    return { before, after, won: s.result === "won" };
  });
  const bands = SCORE_BANDS.map((b) => {
    const side = (pick: "before" | "after") => {
      const inBand = rows.filter((r) => r[pick] >= b.min && r[pick] <= b.max);
      return { leads: inBand.length, winRate: rate(inBand.filter((r) => r.won).length, inBand.length) };
    };
    return { key: b.key, label: b.label, before: side("before"), after: side("after") };
  });
  return { leads: samples.length, verdictChanges: { total: promoted + demoted, promoted, demoted }, bands };
}

/* ---------- Motifs ---------- */

export interface ReasonStat { code: string; won: number; lost: number }

export function reasonStats(outcomes: Pick<Outcome, "result" | "reasonCode">[]): { won: ReasonStat[]; lost: ReasonStat[] } {
  const count = (result: "won" | "lost") => {
    const m = new Map<string, number>();
    for (const o of outcomes) if (o.result === result && o.reasonCode) m.set(o.reasonCode, (m.get(o.reasonCode) ?? 0) + 1);
    return [...m.entries()].map(([code, n]) => ({ code, won: result === "won" ? n : 0, lost: result === "lost" ? n : 0 })).sort((a, b) => b.won + b.lost - (a.won + a.lost));
  };
  return { won: count("won"), lost: count("lost") };
}
