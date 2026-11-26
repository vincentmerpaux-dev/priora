import { describe, expect, it } from "vitest";
import { assignmentNote, nextRoundRobin, pickAssignee, ruleMatches, type AssignInput } from "./assignment";
import type { AssignmentRule } from "@/lib/types";

const member = (userId: string, role: "admin" | "manager" | "commercial" = "commercial", active = true) => ({ userId, role, active, name: userId.toUpperCase() });
const TEAM = [member("admin", "admin"), member("manager", "manager"), member("a"), member("b"), member("c")];

const lead = (over: Partial<AssignInput["lead"]> = {}): AssignInput["lead"] => ({
  source: "formulaire", sourceDetail: null, message: "Bonjour", company: "ACME", enrichment: null, ...over,
});
const rr = { assignment: { mode: "round_robin" as const, rules: [] } };

describe("tour de rôle", () => {
  it("fait tourner les commerciaux dans l'ordre de la liste et reboucle", () => {
    let cursor: string | null = null;
    const seen: (string | null)[] = [];
    for (let i = 0; i < 7; i++) {
      const r = pickAssignee({ settings: rr, members: TEAM, lead: lead(), score: 50, cursor });
      seen.push(r.ownerId);
      cursor = r.cursor;
    }
    expect(seen).toEqual(["a", "b", "c", "a", "b", "c", "a"]);
  });

  it("n'attribue jamais à un admin ni à un manager", () => {
    for (let i = 0; i < 10; i++) {
      const r = pickAssignee({ settings: rr, members: TEAM, lead: lead(), score: 50, cursor: i % 2 ? "b" : null });
      expect(["a", "b", "c"]).toContain(r.ownerId);
    }
  });

  it("exclut les commerciaux inactifs", () => {
    const team = [member("a"), member("b", "commercial", false), member("c")];
    let cursor: string | null = null;
    const seen: (string | null)[] = [];
    for (let i = 0; i < 4; i++) {
      const r = pickAssignee({ settings: rr, members: team, lead: lead(), score: 50, cursor });
      seen.push(r.ownerId);
      cursor = r.cursor;
    }
    expect(seen).toEqual(["a", "c", "a", "c"]);
  });

  it("repart du début si le curseur pointe un commercial devenu inactif", () => {
    const team = [member("a"), member("b", "commercial", false), member("c")];
    expect(nextRoundRobin(team, "b")?.userId).toBe("a");
  });

  it("ne fait rien sans commercial actif", () => {
    const team = [member("admin", "admin"), member("a", "commercial", false)];
    const r = pickAssignee({ settings: rr, members: team, lead: lead(), score: 50, cursor: null });
    expect(r.ownerId).toBeNull();
    expect(r.reason).toMatch(/aucun commercial/i);
  });

  it("ne change rien quand l'attribution est désactivée", () => {
    const r = pickAssignee({ settings: { assignment: { mode: "off", rules: [] } }, members: TEAM, lead: lead(), score: 90, cursor: "a" });
    expect(r).toMatchObject({ ownerId: null, cursor: "a" });
  });
});

const rule = (over: Partial<AssignmentRule>): AssignmentRule => ({ id: "r", label: "Règle", sources: [], keywords: [], minScore: null, assigneeId: "c", ...over });
const seg = (rules: AssignmentRule[]) => ({ assignment: { mode: "segments" as const, rules } });

describe("attribution par segment", () => {
  it("envoie un lead au score minimum vers le commercial senior", () => {
    const settings = seg([rule({ minScore: 75, assigneeId: "c", label: "Senior" })]);
    const hot = pickAssignee({ settings, members: TEAM, lead: lead(), score: 80, cursor: null });
    expect(hot).toMatchObject({ ownerId: "c", cursor: null });
    expect(hot.reason).toContain("Senior");
    const cold = pickAssignee({ settings, members: TEAM, lead: lead(), score: 60, cursor: null });
    expect(cold.ownerId).toBe("a"); // repli tour de rôle
    expect(cold.cursor).toBe("a");
  });

  it("la règle de segment ne fait pas avancer le tour de rôle", () => {
    const settings = seg([rule({ minScore: 75 })]);
    const r = pickAssignee({ settings, members: TEAM, lead: lead(), score: 99, cursor: "a" });
    expect(r.cursor).toBe("a");
  });

  it("filtre par source", () => {
    const settings = seg([rule({ sources: ["webhook", "email"], assigneeId: "b" })]);
    expect(pickAssignee({ settings, members: TEAM, lead: lead({ source: "webhook" }), score: 10, cursor: null }).ownerId).toBe("b");
    expect(pickAssignee({ settings, members: TEAM, lead: lead({ source: "csv" }), score: 10, cursor: null }).ownerId).toBe("a");
  });

  it("filtre par produit ou secteur, sans tenir compte des accents ni de la casse", () => {
    const settings = seg([rule({ keywords: ["décennale"], assigneeId: "b" })]);
    expect(pickAssignee({ settings, members: TEAM, lead: lead({ message: "Je cherche une DECENNALE rapidement" }), score: 10, cursor: null }).ownerId).toBe("b");
    expect(pickAssignee({ settings, members: TEAM, lead: lead({ sourceDetail: "Devis décennale" }), score: 10, cursor: null }).ownerId).toBe("b");
    expect(pickAssignee({ settings, members: TEAM, lead: lead({ message: "RC Pro" }), score: 10, cursor: null }).ownerId).toBe("a");
  });

  it("exige que tous les critères d'une règle correspondent", () => {
    const r = rule({ sources: ["formulaire"], minScore: 70, keywords: ["gmao"] });
    expect(ruleMatches(r, lead({ message: "une GMAO" }), 75)).toBe(true);
    expect(ruleMatches(r, lead({ message: "une GMAO" }), 60)).toBe(false);
    expect(ruleMatches(r, lead({ message: "une GMAO", source: "csv" }), 75)).toBe(false);
    expect(ruleMatches(r, lead({ message: "autre" }), 75)).toBe(false);
  });

  it("applique la première règle qui correspond", () => {
    const settings = seg([rule({ id: "1", minScore: 50, assigneeId: "b", label: "Première" }), rule({ id: "2", minScore: 10, assigneeId: "c", label: "Seconde" })]);
    expect(pickAssignee({ settings, members: TEAM, lead: lead(), score: 80, cursor: null }).ownerId).toBe("b");
  });

  it("ignore une règle sans critère", () => {
    expect(ruleMatches(rule({}), lead(), 100)).toBe(false);
  });

  it("ignore une règle dont la cible est inactive et passe à la suivante, puis au tour de rôle", () => {
    const team = [member("a"), member("b", "commercial", false), member("c")];
    const settings = seg([rule({ id: "1", minScore: 10, assigneeId: "b", label: "Vers B" }), rule({ id: "2", minScore: 10, assigneeId: "c", label: "Vers C" })]);
    expect(pickAssignee({ settings, members: team, lead: lead(), score: 50, cursor: null }).ownerId).toBe("c");
    const only = seg([rule({ minScore: 10, assigneeId: "b" })]);
    expect(pickAssignee({ settings: only, members: team, lead: lead(), score: 50, cursor: null }).ownerId).toBe("a");
  });

  it("ne cible jamais un manager, même désigné par une règle", () => {
    const settings = seg([rule({ minScore: 10, assigneeId: "manager" })]);
    expect(pickAssignee({ settings, members: TEAM, lead: lead(), score: 50, cursor: null }).ownerId).toBe("a");
  });

  it("cherche aussi dans le secteur enrichi", () => {
    const enrichment = { status: "ok", fetchedAt: "", notes: [], company: { siren: "1", legalName: "X", nafCode: null, sectorLabel: "Entreposage et logistique", employees: null, creationDate: null, city: null, postalCode: null, department: null, region: null, categorie: null } } as const;
    const settings = seg([rule({ keywords: ["logistique"], assigneeId: "b" })]);
    expect(pickAssignee({ settings, members: TEAM, lead: lead({ enrichment: enrichment as never }), score: 10, cursor: null }).ownerId).toBe("b");
  });
});

describe("historique d'attribution", () => {
  it("formule la note de l'activité", () => {
    expect(assignmentNote("Camille", "Tour de rôle")).toBe("Attribué à Camille (Tour de rôle)");
    expect(assignmentNote("Camille", "Réattribution", "Karim")).toBe("Attribué à Camille par Karim (Réattribution)");
    expect(assignmentNote(null, "", "Karim")).toMatch(/Retiré/);
  });
});
