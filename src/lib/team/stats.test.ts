import { describe, expect, it } from "vitest";
import { computeDashboard, median, type StatLead } from "./stats";

const NOW = new Date("2026-06-30T12:00:00Z");
const ago = (days: number, extraMin = 0) => new Date(NOW.getTime() - days * 86_400_000 + extraMin * 60_000).toISOString();
const settings = { speedTargets: { callNowMinutes: 5, nurtureMinutes: 120 } };
const members = [
  { userId: "a", name: "Alice", role: "commercial" as const, active: true },
  { userId: "b", name: "Bob", role: "commercial" as const, active: true },
  { userId: "m", name: "Manon", role: "manager" as const, active: true },
];

let n = 0;
function lead(over: Partial<StatLead> & { createdDaysAgo: number; contactAfterMin?: number | null }): StatLead {
  const created = ago(over.createdDaysAgo);
  const { createdDaysAgo, contactAfterMin, ...rest } = over;
  void createdDaysAgo;
  return {
    id: `l${++n}`, createdAt: created, status: "new", ownerId: "a", source: "formulaire", scoreTotal: 50, verdict: "call_now",
    firstContactedAt: contactAfterMin === undefined || contactAfterMin === null ? null : new Date(new Date(created).getTime() + contactAfterMin * 60_000).toISOString(),
    ...rest,
  };
}

describe("median", () => {
  it("gère vide, impair et pair", () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([9, 1, 5])).toBe(5);
    expect(median([1, 2, 3, 10])).toBe(3); // arrondi de 2,5
  });
});

describe("tableau de bord : volume", () => {
  const leads = [
    lead({ createdDaysAgo: 1, source: "formulaire" }),
    lead({ createdDaysAgo: 2, source: "formulaire" }),
    lead({ createdDaysAgo: 2.1, source: "webhook" }),
    lead({ createdDaysAgo: 20, source: "email" }),
    lead({ createdDaysAgo: 60, source: "csv" }),
    lead({ createdDaysAgo: 120, source: "csv" }), // hors période, même à 90 j
  ];

  it("filtre par période", () => {
    expect(computeDashboard({ leads, members, settings, days: 7, now: NOW }).total).toBe(3);
    expect(computeDashboard({ leads, members, settings, days: 30, now: NOW }).total).toBe(4);
    expect(computeDashboard({ leads, members, settings, days: 90, now: NOW }).total).toBe(5);
  });

  it("répartit par source, du plus fréquent au moins fréquent", () => {
    const d = computeDashboard({ leads, members, settings, days: 30, now: NOW });
    expect(d.volume.bySource).toEqual([{ source: "formulaire", count: 2 }, { source: "webhook", count: 1 }, { source: "email", count: 1 }]);
  });

  it("découpe en 7, 30 et 30 barres (3 jours pour 90 j) sans perdre de lead", () => {
    for (const [days, bars] of [[7, 7], [30, 30], [90, 30]] as const) {
      const d = computeDashboard({ leads, members, settings, days, now: NOW });
      expect(d.volume.buckets).toHaveLength(bars);
      expect(d.volume.buckets.reduce((s, b) => s + b.count, 0)).toBe(d.total);
    }
    expect(computeDashboard({ leads, members, settings, days: 90, now: NOW }).volume.bucketDays).toBe(3);
  });
});

describe("tableau de bord : premier contact", () => {
  it("calcule le délai médian et le pourcentage dans le délai cible", () => {
    const leads = [
      lead({ createdDaysAgo: 3, contactAfterMin: 3, status: "contacted" }), // dans le délai
      lead({ createdDaysAgo: 3, contactAfterMin: 4, status: "contacted" }), // dans le délai
      lead({ createdDaysAgo: 3, contactAfterMin: 30, status: "contacted" }), // hors délai
      lead({ createdDaysAgo: 3, contactAfterMin: null }), // jamais contacté, en retard
      lead({ createdDaysAgo: 3, verdict: "disqualify", contactAfterMin: 500, status: "contacted" }), // pas de cible : non mesuré
    ];
    const d = computeDashboard({ leads, members, settings, days: 7, now: NOW });
    expect(d.firstContact.measured).toBe(4);
    expect(d.firstContact.within).toBe(2);
    expect(d.firstContact.withinPct).toBeCloseTo(0.5);
    expect(d.firstContact.medianMinutes).toBe(17); // 3, 4, 30, 500 : (4 + 30) / 2
    expect(d.firstContact.overdueNow).toBe(1);
    expect(d.firstContact.neverContacted).toBe(1);
  });

  it("ne compte pas comme mesurés les leads encore dans le délai", () => {
    const recent = { ...lead({ createdDaysAgo: 0 }), createdAt: new Date(NOW.getTime() - 2 * 60_000).toISOString() };
    const d = computeDashboard({ leads: [recent], members, settings, days: 7, now: NOW });
    expect(d.firstContact.measured).toBe(0);
    expect(d.firstContact.withinPct).toBeNull();
    expect(d.firstContact.overdueNow).toBe(0);
  });
});

describe("tableau de bord : conversion", () => {
  const leads = [
    lead({ createdDaysAgo: 5, scoreTotal: 20, status: "lost" }),
    lead({ createdDaysAgo: 5, scoreTotal: 39, status: "lost" }),
    lead({ createdDaysAgo: 5, scoreTotal: 40, status: "won" }),
    lead({ createdDaysAgo: 5, scoreTotal: 69, status: "lost" }),
    lead({ createdDaysAgo: 5, scoreTotal: 70, status: "won" }),
    lead({ createdDaysAgo: 5, scoreTotal: 100, status: "won" }),
    lead({ createdDaysAgo: 5, scoreTotal: 85, status: "contacted" }),
    lead({ createdDaysAgo: 5, scoreTotal: null, status: "won" }),
  ];

  it("range les scores dans les tranches 0-39, 40-69, 70-100 (bornes incluses)", () => {
    const d = computeDashboard({ leads, members, settings, days: 7, now: NOW });
    const by = Object.fromEntries(d.byScoreBand.map((b) => [b.key, b]));
    expect(by.low).toMatchObject({ leads: 2, won: 0, lost: 2, winRate: 0 });
    expect(by.mid).toMatchObject({ leads: 2, won: 1, lost: 1, winRate: 0.5 });
    expect(by.high).toMatchObject({ leads: 3, won: 2, lost: 0, open: 1, winRate: 1 });
  });

  it("exclut les leads encore ouverts du taux de gain et ignore les scores absents", () => {
    const d = computeDashboard({ leads, members, settings, days: 7, now: NOW });
    expect(d.won).toBe(4);
    expect(d.lost).toBe(3);
    expect(d.winRate).toBeCloseTo(4 / 7);
    expect(d.byScoreBand.reduce((s, b) => s + b.leads, 0)).toBe(7); // le lead sans score n'est dans aucune tranche
  });

  it("donne un taux nul (n.d.) quand rien n'est clos", () => {
    const d = computeDashboard({ leads: [lead({ createdDaysAgo: 1 })], members, settings, days: 7, now: NOW });
    expect(d.winRate).toBeNull();
    expect(d.byScoreBand.every((b) => b.winRate === null)).toBe(true);
  });
});

describe("tableau de bord : commerciaux et pipeline", () => {
  const leads = [
    lead({ createdDaysAgo: 4, ownerId: "a", status: "won", contactAfterMin: 3 }),
    lead({ createdDaysAgo: 4, ownerId: "a", status: "won", contactAfterMin: 4 }),
    lead({ createdDaysAgo: 4, ownerId: "a", status: "lost", contactAfterMin: 8 }),
    lead({ createdDaysAgo: 4, ownerId: "b", status: "won", contactAfterMin: 90 }),
    lead({ createdDaysAgo: 4, ownerId: "b", status: "lost", contactAfterMin: 200 }),
    lead({ createdDaysAgo: 4, ownerId: "b", status: "lost", contactAfterMin: null }),
    lead({ createdDaysAgo: 4, ownerId: null, status: "new" }),
  ];
  const d = computeDashboard({ leads, members, settings, days: 7, now: NOW });

  it("classe les commerciaux par leads gagnés puis taux de gain", () => {
    expect(d.bySales.map((r) => r.name)).toEqual(["Alice", "Bob"]);
    const [alice, bob] = d.bySales;
    expect(alice).toMatchObject({ assigned: 3, handled: 3, won: 2, lost: 1, medianMinutes: 4 });
    expect(alice!.winRate).toBeCloseTo(2 / 3);
    expect(alice!.withinPct).toBeCloseTo(2 / 3); // 3 et 4 min dans la cible, 8 min hors cible
    expect(bob).toMatchObject({ assigned: 3, handled: 2, won: 1, lost: 2, medianMinutes: 145 });
  });

  it("n'inclut que les commerciaux (pas les managers) et ignore les leads non attribués", () => {
    expect(d.bySales.some((r) => r.userId === "m")).toBe(false);
    expect(d.bySales.reduce((s, r) => s + r.assigned, 0)).toBe(6);
  });

  it("répartit le pipeline par statut", () => {
    expect(Object.fromEntries(d.pipeline.map((p) => [p.status, p.count]))).toEqual({ new: 1, contacted: 0, qualified: 0, won: 3, lost: 3 });
  });

  it("garde un commercial actif sans lead, mais pas un commercial inactif sans lead", () => {
    const withIdle = computeDashboard({
      leads, days: 7, now: NOW, settings,
      members: [...members, { userId: "z", name: "Zoe", role: "commercial", active: true }, { userId: "y", name: "Yann", role: "commercial", active: false }],
    });
    const names = withIdle.bySales.map((r) => r.name);
    expect(names).toContain("Zoe");
    expect(names).not.toContain("Yann");
  });
});
