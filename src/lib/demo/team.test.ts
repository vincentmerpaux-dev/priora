import { describe, expect, it } from "vitest";
import { buildDemoData } from "./data";
import { buildOrusData } from "./orus";
import { speedStatus } from "@/lib/team/speed";
import { computeDashboard } from "@/lib/team/stats";

describe.each([
  ["Maintia", buildDemoData],
  ["Cas Orus", buildOrusData],
])("équipe et historique de démonstration : %s", (_name, build) => {
  const d = build();
  const DAY = 86_400_000;

  it("a 5 membres fictifs : 1 admin, 1 manager, 3 commerciaux, tous actifs et en .example", () => {
    expect(d.members).toHaveLength(5);
    expect(d.members.filter((m) => m.role === "admin")).toHaveLength(1);
    expect(d.members.filter((m) => m.role === "manager")).toHaveLength(1);
    expect(d.members.filter((m) => m.role === "commercial")).toHaveLength(3);
    expect(d.members.every((m) => m.active && m.email.endsWith(".example"))).toBe(true);
    expect(new Set(d.members.map((m) => m.userId)).size).toBe(5);
  });

  it("attribue chaque lead à un commercial, jamais à un admin ni à un manager", () => {
    const sales = new Set(d.members.filter((m) => m.role === "commercial").map((m) => m.userId));
    expect(d.leads.every((l) => l.ownerId && sales.has(l.ownerId))).toBe(true);
  });

  it("trace chaque attribution dans les activités", () => {
    const assigned = new Set(d.activities.filter((a) => a.type === "assignment").map((a) => a.leadId));
    expect(d.leads.every((l) => assigned.has(l.id))).toBe(true);
  });

  it("génère un historique fictif étalé sur 90 jours, étiqueté démo", () => {
    const oldest = Math.min(...d.leads.map((l) => new Date(l.createdAt).getTime()));
    const days = (Date.now() - oldest) / DAY;
    expect(days).toBeGreaterThan(80);
    expect(days).toBeLessThan(91);
    expect(d.leads.length).toBeGreaterThanOrEqual(150);
    // Domaines réservés (.example) ou boîtes mail marquées ".demo" : aucune adresse réelle.
    expect(d.leads.every((l) => l.isDemo && /\.example$|\.demo@/.test(l.email))).toBe(true);
    expect(d.leads.every((l) => l.enrichment?.company?.siren.startsWith("999") ?? true)).toBe(true);
  });

  it("contient des leads anciens déjà traités : gagnés et perdus, avec activités", () => {
    const old = d.leads.filter((l) => Date.now() - new Date(l.createdAt).getTime() > 20 * DAY);
    const won = old.filter((l) => l.status === "won").length;
    const lost = old.filter((l) => l.status === "lost").length;
    expect(won).toBeGreaterThan(10);
    expect(lost).toBeGreaterThan(10);
    expect(old.filter((l) => l.status === "won" || l.status === "lost").length / old.length).toBeGreaterThan(0.85);
    for (const l of old.filter((x) => x.firstContactedAt)) {
      expect(d.activities.some((a) => a.leadId === l.id && (a.type === "call" || a.type === "email"))).toBe(true);
    }
    // Chaque lead gagné ou perdu a un résultat enregistré.
    for (const l of old.filter((x) => x.status === "won" || x.status === "lost")) expect(d.outcomes.some((o) => o.leadId === l.id && o.result === l.status)).toBe(true);
  });

  it("garde des dates cohérentes : premier contact après la création, jamais dans le futur", () => {
    for (const l of d.leads) {
      if (!l.firstContactedAt) continue;
      expect(new Date(l.firstContactedAt).getTime()).toBeGreaterThanOrEqual(new Date(l.createdAt).getTime());
      expect(new Date(l.firstContactedAt).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    }
  });

  it("est déterministe : deux constructions donnent les mêmes volumes", () => {
    const again = build();
    expect(again.leads.length).toBe(d.leads.length);
    expect(again.outcomes.length).toBe(d.outcomes.length);
  });

  it("rend le tableau de bord intéressant : délais variés, conversion qui monte avec le score", () => {
    const leads = d.leads.map((l) => ({ ...l, scoreTotal: d.scoreByLead.get(l.id) ?? null, verdict: d.verdictByLead.get(l.id) ?? null }));
    const dash = computeDashboard({ leads, members: d.members, settings: d.settings, days: 90 });
    expect(dash.total).toBeGreaterThanOrEqual(150);
    expect(dash.firstContact.medianMinutes).not.toBeNull();
    expect(dash.firstContact.withinPct).toBeGreaterThan(0.1);
    expect(dash.firstContact.withinPct).toBeLessThan(0.9);
    const by = Object.fromEntries(dash.byScoreBand.map((b) => [b.key, b]));
    expect(by.high!.leads).toBeGreaterThan(10);
    expect(by.low!.leads).toBeGreaterThan(10);
    expect(by.high!.winRate!).toBeGreaterThan(by.low!.winRate!);
    // La démo doit raconter "le score est fiable" sur chaque période proposée, 30 j (vue par défaut) comprise.
    for (const days of [30, 90]) {
      const b = Object.fromEntries(computeDashboard({ leads, members: d.members, settings: d.settings, days }).byScoreBand.map((x) => [x.key, x]));
      expect(b.mid!.winRate!).toBeGreaterThan(b.low!.winRate!);
      expect(b.high!.winRate!).toBeGreaterThan(b.mid!.winRate!);
    }
    const rates = dash.bySales.map((r) => r.winRate ?? 0);
    expect(Math.max(...rates) - Math.min(...rates)).toBeGreaterThan(0.03); // les commerciaux se distinguent
    const medians = dash.bySales.map((r) => r.medianMinutes ?? 0);
    expect(Math.max(...medians)).toBeGreaterThan(Math.min(...medians) * 1.5);
    expect(dash.volume.bySource.length).toBeGreaterThanOrEqual(4);
  });

  it("montre du retard en cours dans la file et des leads déjà rappelés dans le délai", () => {
    const states = d.leads
      .filter((l) => l.status !== "won" && l.status !== "lost")
      .map((l) => speedStatus({ ...l, verdict: d.verdictByLead.get(l.id) ?? null }, d.settings));
    expect(states.some((s) => s.state === "overdue")).toBe(true);
    expect(states.some((s) => s.state === "met")).toBe(true);
  });
});

describe("réglages de démonstration", () => {
  it("Maintia : tour de rôle, file commune fermée ; Cas Orus : règles par segment, file commune ouverte", () => {
    const m = buildDemoData();
    const o = buildOrusData();
    expect(m.settings.assignment.mode).toBe("round_robin");
    expect(m.settings.commercialsSeeAll).toBe(false);
    expect(o.settings.assignment.mode).toBe("segments");
    expect(o.settings.assignment.rules.length).toBeGreaterThanOrEqual(2);
    expect(o.settings.commercialsSeeAll).toBe(true);
    const sales = new Set(o.members.filter((x) => x.role === "commercial").map((x) => x.userId));
    expect(o.settings.assignment.rules.every((r) => sales.has(r.assigneeId))).toBe(true);
  });
});
