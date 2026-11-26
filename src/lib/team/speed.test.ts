import { describe, expect, it } from "vitest";
import { formatMinutes, isOverdue, speedHint, speedLabel, speedStatus, targetMinutes } from "./speed";
import type { Verdict } from "@/lib/types";

const settings = { speedTargets: { callNowMinutes: 5, nurtureMinutes: 120 } };
const T0 = new Date("2026-03-10T10:00:00Z");
const at = (min: number) => new Date(T0.getTime() + min * 60_000);
const lead = (verdict: Verdict | null, over: { firstContactedAt?: string | null; status?: "new" | "contacted" | "won" | "lost" } = {}) => ({
  createdAt: T0.toISOString(), firstContactedAt: over.firstContactedAt ?? null, status: over.status ?? ("new" as const), verdict,
});

describe("délai cible", () => {
  it("dépend du verdict", () => {
    expect(targetMinutes("call_now", settings)).toBe(5);
    expect(targetMinutes("nurture", settings)).toBe(120);
    expect(targetMinutes("disqualify", settings)).toBeNull();
    expect(targetMinutes(null, settings)).toBeNull();
  });
});

describe("speedStatus", () => {
  it("décompte quand le lead n'est pas encore contacté et que le délai court", () => {
    const s = speedStatus(lead("call_now"), settings, at(2));
    expect(s).toMatchObject({ state: "pending", minutes: 3, targetMinutes: 5 });
    expect(speedLabel(s)).toBe("Reste 3 min");
  });

  it("est encore dans le délai pile à l'échéance", () => {
    expect(speedStatus(lead("call_now"), settings, at(5)).state).toBe("pending");
  });

  it("passe en retard après l'échéance et mesure le retard", () => {
    const s = speedStatus(lead("call_now"), settings, at(23));
    expect(s).toMatchObject({ state: "overdue", minutes: 18 });
    expect(isOverdue(s)).toBe(true);
    expect(speedLabel(s)).toBe("En retard de 18 min");
  });

  it("utilise le délai long pour un lead à nourrir", () => {
    expect(speedStatus(lead("nurture"), settings, at(100)).state).toBe("pending");
    expect(speedStatus(lead("nurture"), settings, at(130)).state).toBe("overdue");
  });

  it("premier contact dans le délai", () => {
    const s = speedStatus(lead("call_now", { firstContactedAt: at(4).toISOString(), status: "contacted" }), settings, at(500));
    expect(s).toMatchObject({ state: "met", contactMinutes: 4 });
    expect(speedLabel(s)).toBe("Dans le délai (4 min)");
  });

  it("premier contact pile à la limite : dans le délai", () => {
    expect(speedStatus(lead("call_now", { firstContactedAt: at(5).toISOString() }), settings, at(60)).state).toBe("met");
  });

  it("premier contact trop tardif", () => {
    const s = speedStatus(lead("call_now", { firstContactedAt: at(22).toISOString() }), settings, at(500));
    expect(s).toMatchObject({ state: "late", contactMinutes: 22 });
    expect(isOverdue(s)).toBe(false);
    expect(speedLabel(s)).toBe("Hors délai (22 min)");
    expect(speedHint(s)).toContain("Cible : 5 min");
  });

  it("un lead contacté n'est plus jamais en retard, quel que soit le temps écoulé", () => {
    const s = speedStatus(lead("nurture", { firstContactedAt: at(30).toISOString() }), settings, at(60 * 24 * 30));
    expect(s.state).toBe("met");
  });

  it("pas de délai cible pour un lead à disqualifier ou non analysé", () => {
    expect(speedStatus(lead("disqualify"), settings, at(999)).state).toBe("none");
    expect(speedStatus(lead(null), settings, at(999)).state).toBe("none");
    expect(speedLabel(speedStatus(lead("disqualify"), settings, at(999)))).toBeNull();
  });

  it("un lead clos sans contact n'est pas signalé en retard", () => {
    expect(speedStatus(lead("call_now", { status: "lost" }), settings, at(999)).state).toBe("none");
  });

  it("respecte des délais personnalisés par organisation", () => {
    const custom = { speedTargets: { callNowMinutes: 15, nurtureMinutes: 60 } };
    expect(speedStatus(lead("call_now"), custom, at(14)).state).toBe("pending");
    expect(speedStatus(lead("call_now"), custom, at(16)).state).toBe("overdue");
  });
});

describe("formatMinutes", () => {
  it("formate minutes, heures et jours", () => {
    expect(formatMinutes(0)).toBe("0 min");
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(60)).toBe("1 h");
    expect(formatMinutes(80)).toBe("1 h 20");
    expect(formatMinutes(60 * 26)).toBe("1 j 2 h");
    expect(formatMinutes(60 * 48)).toBe("2 j");
  });
});
