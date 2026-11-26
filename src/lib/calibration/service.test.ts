import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DEMO_ORG_ID } from "@/lib/demo/data";
import { ORUS_ORG_ID } from "@/lib/demo/orus";
import { memberId } from "@/lib/demo/team";
import { demoRepository as repo } from "@/lib/repo/demo";
import { MAX_VARIATION, normalizeWeights } from "./compute";
import { applySuggestion, currentVersion, ensureInitialVersion, loadCalibration, recordManualChange, restoreVersion, scoringChanged } from "./service";

const ADMIN = (kind: "maintia" | "orus") => memberId(kind, "admin");
const sum = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0);

describe.each([
  ["Maintia", DEMO_ORG_ID, "maintia" as const],
  ["Cas Orus", ORUS_ORG_ID, "orus" as const],
])("calibration sur les données de démonstration : %s", (_name, orgId, kind) => {
  it("rend la page parlante : critère clairement prédictif, critère inutile, et cas d'effectif trop faible", async () => {
    const { calibration: c } = await loadCalibration(repo, orgId, 90);
    expect(c.total).toBeGreaterThan(100);
    expect(c.enoughData).toBe(true);
    expect(c.criteria.some((s) => s.signal === "strong" && s.reliability === "reliable" && (s.gap ?? 0) >= 20)).toBe(true);
    expect(c.criteria.some((s) => s.signal === "none" && s.reliability !== "insufficient" && Math.abs(s.gap ?? 99) < 5)).toBe(true);
    expect(c.criteria.some((s) => s.reliability === "insufficient")).toBe(true);
  });

  it("garde la conversion croissante avec la tranche de score, sur 30 et 90 jours", async () => {
    for (const days of [30, 90]) {
      const { calibration: c } = await loadCalibration(repo, orgId, days);
      const by = Object.fromEntries(c.byBand.map((b) => [b.key, b]));
      expect(by.mid!.winRate!).toBeGreaterThan(by.low!.winRate!);
      expect(by.high!.winRate!).toBeGreaterThan(by.mid!.winRate!);
    }
  });

  it("propose des poids qui totalisent 100 dans les bornes, avec un aperçu avant/après", async () => {
    const v = await loadCalibration(repo, orgId, 90);
    expect(v.suggestion.blockedReason).toBeNull();
    expect(v.suggestion.changed).toBe(true);
    expect(sum(v.suggestion.weights)).toBe(100);
    for (const ch of v.suggestion.changes) {
      expect(ch.after).toBeGreaterThanOrEqual(Math.max(1, Math.floor(ch.before * (1 - MAX_VARIATION))));
      expect(ch.after).toBeLessThanOrEqual(Math.ceil(ch.before * (1 + MAX_VARIATION)));
    }
    expect(v.preview).not.toBeNull();
    expect(v.preview!.leads).toBe(v.calibration.total);
    expect(v.preview!.bands).toHaveLength(3);
    // Le critère inutile perd du poids, le critère prédictif n'en perd pas.
    const useless = v.suggestion.changes.find((ch) => ch.signal === "none");
    const strong = v.suggestion.changes.find((ch) => ch.signal === "strong" && ch.reliability === "reliable");
    expect(useless && useless.after <= useless.before).toBe(true);
    expect(strong && strong.after >= strong.before).toBe(true);
  });

  it("versionne : appliquer crée la version de départ puis la suggestion ; le retour arrière restaure et s'ajoute à l'historique", async () => {
    const before = (await repo.getIcp(orgId)).criteria;
    expect(await repo.listScoreVersions(orgId)).toHaveLength(0);

    const applied = await applySuggestion(repo, orgId, 90, ADMIN(kind));
    expect(applied).toMatchObject({ ok: true, version: 2 });
    const after = (await repo.getIcp(orgId)).criteria;
    expect(scoringChanged(before, after)).toBe(true);
    expect(sum(normalizeWeights(after))).toBe(100);
    // Les critères désactivés ne sont pas touchés, les libellés non plus.
    expect(after.map((c) => [c.key, c.label, c.enabled])).toEqual(before.map((c) => [c.key, c.label, c.enabled]));

    let versions = await repo.listScoreVersions(orgId);
    expect(versions.map((v) => [v.version, v.source])).toEqual([[2, "suggestion"], [1, "initial"]]);
    expect(currentVersion(versions, after)).toBe(2);

    const initial = versions.find((v) => v.version === 1)!;
    const restored = await restoreVersion(repo, orgId, initial.id, ADMIN(kind));
    expect(restored).toMatchObject({ ok: true, version: 3 });
    expect(scoringChanged(before, (await repo.getIcp(orgId)).criteria)).toBe(false);
    versions = await repo.listScoreVersions(orgId);
    expect(versions[0]).toMatchObject({ version: 3, source: "restore", note: "Retour à la version 1" });
    expect(currentVersion(versions, (await repo.getIcp(orgId)).criteria)).toBe(3);

    // Revenir à ce qui est déjà en vigueur est refusé proprement ; une version inconnue aussi.
    expect(await restoreVersion(repo, orgId, initial.id, ADMIN(kind))).toMatchObject({ ok: false });
    expect(await restoreVersion(repo, orgId, "00000000-0000-4000-8000-00000000dead", ADMIN(kind))).toEqual({ ok: false, error: "Version introuvable." });
  });
});

describe("versions de configuration", () => {
  it("scoringChanged ne regarde que poids et activation", () => {
    const a = [{ key: "sector", label: "A", category: "fit", weight: 10, enabled: true, description: "x" }] as const;
    expect(scoringChanged([...a], [{ ...a[0], label: "B", description: "y" }])).toBe(false);
    expect(scoringChanged([...a], [{ ...a[0], weight: 11 }])).toBe(true);
    expect(scoringChanged([...a], [{ ...a[0], enabled: false }])).toBe(true);
    expect(scoringChanged([...a], [])).toBe(true);
  });

  it("une modification manuelle dans Réglages devient une version, une modification sans effet non", async () => {
    const orgId = DEMO_ORG_ID;
    const icp = await repo.getIcp(orgId);
    const n = (await repo.listScoreVersions(orgId)).length;
    await recordManualChange(repo, orgId, icp.criteria, icp.criteria.map((c) => ({ ...c, label: `${c.label} (renommé)` })), ADMIN("maintia"));
    expect((await repo.listScoreVersions(orgId)).length).toBe(n);
    const heavier = icp.criteria.map((c, i) => (i === 0 ? { ...c, weight: c.weight + 5 } : c));
    await recordManualChange(repo, orgId, icp.criteria, heavier, ADMIN("maintia"));
    const versions = await repo.listScoreVersions(orgId);
    expect(versions[0]).toMatchObject({ source: "manual" });
    expect(versions.length).toBeGreaterThan(n);
  });

  it("ensureInitialVersion est idempotent", async () => {
    const orgId = ORUS_ORG_ID;
    const icp = await repo.getIcp(orgId);
    await ensureInitialVersion(repo, orgId, icp.criteria, null);
    const n = (await repo.listScoreVersions(orgId)).length;
    await ensureInitialVersion(repo, orgId, icp.criteria, null);
    expect((await repo.listScoreVersions(orgId)).length).toBe(n);
  });
});
