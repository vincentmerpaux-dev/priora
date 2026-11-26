import { describe, expect, it } from "vitest";
import { activeGroup, navFor } from "@/lib/nav";

const ids = (role: Parameters<typeof navFor>[0]) => navFor(role).map((g) => g.id);

describe("navigation par rôle", () => {
  it("admin et manager : 4 entrées au plus, dans l'ordre", () => {
    expect(ids("admin")).toEqual(["leads", "pipeline", "pilotage", "reglages"]);
    expect(ids("manager")).toEqual(["leads", "pipeline", "pilotage", "reglages"]);
  });

  it("le commercial ne voit ni Pilotage ni les réglages admin", () => {
    const nav = navFor("commercial");
    expect(nav.map((g) => g.id)).toEqual(["leads", "pipeline", "reglages"]);
    const reglages = nav.find((g) => g.id === "reglages")!;
    expect(reglages.label).toBe("Objections");
    expect(reglages.tabs.map((t) => t.href)).toEqual(["/objections"]);
  });

  it("aucun rôle n'obtient plus de 4 entrées", () => {
    for (const r of ["admin", "manager", "commercial", null] as const) expect(navFor(r).length).toBeLessThanOrEqual(4);
  });

  it("Pilotage regroupe tableau de bord et calibration ; Réglages regroupe réglages, équipe et objections", () => {
    const nav = navFor("admin");
    expect(nav.find((g) => g.id === "pilotage")!.tabs.map((t) => t.href)).toEqual(["/dashboard", "/calibration"]);
    expect(nav.find((g) => g.id === "reglages")!.tabs.map((t) => t.href)).toEqual(["/settings", "/team", "/objections"]);
  });

  it("les anciennes URL restent rattachées à leur groupe (sous-pages comprises)", () => {
    const nav = navFor("admin");
    expect(activeGroup(nav, "/calibration")?.id).toBe("pilotage");
    expect(activeGroup(nav, "/team")?.id).toBe("reglages");
    expect(activeGroup(nav, "/leads/import")?.id).toBe("leads");
    expect(activeGroup(nav, "/leadsX")).toBeUndefined();
  });
});
