import { describe, expect, it } from "vitest";
import { can, canReadLead, canWriteLead, isStaff, visibleLeads, type Permission } from "./permissions";

const ALL: Permission[] = [
  "dashboard.view", "leads.view_all", "leads.assign", "leads.delete", "objections.manage", "team.view", "team.manage", "settings.view", "settings.manage",
];

describe("droits par rôle", () => {
  it("l'admin peut tout", () => {
    for (const p of ALL) expect(can("admin", p)).toBe(true);
  });

  it("le manager voit tout et pilote, mais ne gère ni l'équipe ni les réglages", () => {
    for (const p of ["dashboard.view", "leads.view_all", "leads.assign", "leads.delete", "objections.manage", "team.view", "settings.view"] as const) expect(can("manager", p)).toBe(true);
    expect(can("manager", "team.manage")).toBe(false);
    expect(can("manager", "settings.manage")).toBe(false);
  });

  it("le commercial n'a accès ni au tableau de bord, ni à l'équipe, ni aux réglages", () => {
    for (const p of ALL) expect(can("commercial", p)).toBe(false);
  });

  it("refuse tout sans rôle", () => {
    expect(can(null, "dashboard.view")).toBe(false);
    expect(can(undefined, "leads.view_all")).toBe(false);
  });

  it("isStaff : admin et manager seulement", () => {
    expect([isStaff("admin"), isStaff("manager"), isStaff("commercial")]).toEqual([true, true, false]);
  });
});

describe("visibilité des leads", () => {
  const leads = [{ id: "1", ownerId: "me" }, { id: "2", ownerId: "other" }, { id: "3", ownerId: null }];

  it("un commercial ne voit que ses leads par défaut", () => {
    expect(visibleLeads(leads, "commercial", "me", { commercialsSeeAll: false }).map((l) => l.id)).toEqual(["1"]);
  });

  it("la file commune est ouverte par le réglage d'organisation, en lecture seule", () => {
    const settings = { commercialsSeeAll: true };
    expect(visibleLeads(leads, "commercial", "me", settings)).toHaveLength(3);
    expect(canReadLead("commercial", "me", leads[1]!, settings)).toBe(true);
    expect(canWriteLead("commercial", "me", leads[1]!)).toBe(false);
    expect(canWriteLead("commercial", "me", leads[0]!)).toBe(true);
  });

  it("manager et admin voient et modifient tout, quel que soit le réglage", () => {
    for (const role of ["manager", "admin"] as const) {
      expect(visibleLeads(leads, role, "x", { commercialsSeeAll: false })).toHaveLength(3);
      expect(canWriteLead(role, "x", leads[1]!)).toBe(true);
    }
  });

  it("un lead non attribué n'est modifiable que par le staff", () => {
    expect(canWriteLead("commercial", "me", leads[2]!)).toBe(false);
    expect(canWriteLead("manager", "me", leads[2]!)).toBe(true);
  });
});
