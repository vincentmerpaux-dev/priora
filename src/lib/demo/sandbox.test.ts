import { describe, expect, it, vi } from "vitest";
import { buildDemoData, DEMO_ORG_ID } from "./data";
import { ORUS_ORG_ID } from "./orus";
import { SandboxRegistry } from "./sandbox";

const HOUR = 3_600_000;
const T0 = 1_800_000_000_000;

describe("bacs à sable de la démo publique", () => {
  it("deux visiteurs ne se voient pas", () => {
    const reg = new SandboxRegistry();
    const a = reg.store("a", DEMO_ORG_ID, T0);
    const b = reg.store("b", DEMO_ORG_ID, T0);
    expect(a).not.toBe(b);
    const before = b.leads.length;
    a.leads.shift();
    a.leads[0]!.status = "lost";
    expect(b.leads.length).toBe(before);
    expect(reg.store("b", DEMO_ORG_ID, T0).leads.length).toBe(before);
    expect(reg.store("a", DEMO_ORG_ID, T0).leads.length).toBe(before - 1);
  });

  it("garde un jeu par organisation pour un même visiteur", () => {
    const reg = new SandboxRegistry();
    const maintia = reg.store("a", DEMO_ORG_ID, T0);
    const orus = reg.store("a", ORUS_ORG_ID, T0);
    expect(maintia).not.toBe(orus);
    expect(reg.store("a", DEMO_ORG_ID, T0)).toBe(maintia);
    expect(() => reg.store("a", "inconnue", T0)).toThrow();
  });

  it("expire après le délai d'inactivité et se reconstruit à l'identique", () => {
    const reg = new SandboxRegistry({ ttlMs: 2 * HOUR });
    const first = reg.store("a", DEMO_ORG_ID, T0);
    const initial = first.leads.map((l) => l.id).join();
    first.leads.length = 3;
    // Activité à 1 h 30 : le délai repart.
    expect(reg.store("a", DEMO_ORG_ID, T0 + 1.5 * HOUR)).toBe(first);
    // Pas d'activité pendant 2 h : bac à sable reconstruit, données de départ.
    const rebuilt = reg.store("a", DEMO_ORG_ID, T0 + 3.5 * HOUR);
    expect(rebuilt).not.toBe(first);
    expect(rebuilt.leads.map((l) => l.id).join()).toBe(initial);
  });

  it("réinitialise un seul visiteur", () => {
    const onDrop = vi.fn();
    const reg = new SandboxRegistry({ onDrop });
    const a = reg.store("a", DEMO_ORG_ID, T0);
    const b = reg.store("b", DEMO_ORG_ID, T0);
    a.leads.length = 1;
    reg.reset("a");
    expect(onDrop).toHaveBeenCalledWith("a");
    expect(reg.has("a", T0)).toBe(false);
    expect(reg.store("a", DEMO_ORG_ID, T0).leads.length).toBe(buildDemoData().leads.length);
    expect(reg.store("b", DEMO_ORG_ID, T0)).toBe(b);
  });

  it("plafonne le nombre de sessions en écartant la moins récemment active", () => {
    const reg = new SandboxRegistry({ maxSessions: 3 });
    for (const sid of ["a", "b", "c"]) reg.store(sid, DEMO_ORG_ID, T0);
    reg.store("a", DEMO_ORG_ID, T0 + 10);
    reg.store("d", DEMO_ORG_ID, T0 + 20);
    expect(reg.size()).toBe(3);
    expect(reg.has("b", T0 + 20)).toBe(false);
    expect(reg.has("a", T0 + 20)).toBe(true);
    expect(reg.has("d", T0 + 20)).toBe(true);
  });

  it("nettoie les sessions expirées quand un nouveau visiteur arrive", () => {
    const reg = new SandboxRegistry({ ttlMs: HOUR });
    reg.store("a", DEMO_ORG_ID, T0);
    reg.store("b", DEMO_ORG_ID, T0);
    reg.store("c", DEMO_ORG_ID, T0 + 2 * HOUR);
    expect(reg.size()).toBe(1);
  });
});
