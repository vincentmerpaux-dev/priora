import { applyWeights, computeCalibration, normalizeWeights, previewWeights, reasonStats, suggestWeights, type Calibration, type Preview, type Suggestion } from "@/lib/calibration/compute";
import type { Repository } from "@/lib/repo/types";
import type { Criterion, ScoreConfigVersion } from "@/lib/types";

/**
 * Orchestration de la calibration au-dessus du repository : lecture, suggestion, application et versionnage.
 * Les droits (qui peut appliquer) sont vérifiés par l'appelant : voir src/app/actions/calibration.ts.
 */

const DAY = 86_400_000;
export const CALIBRATION_PERIODS = [30, 90] as const;

export interface CalibrationView {
  calibration: Calibration;
  suggestion: Suggestion;
  preview: Preview | null;
}

export async function loadCalibration(repo: Repository, orgId: string, days: number, now: Date = new Date()): Promise<CalibrationView & { criteria: Criterion[] }> {
  const [samples, icp] = await Promise.all([repo.listClosedSamples(orgId, new Date(now.getTime() - days * DAY).toISOString()), repo.getIcp(orgId)]);
  const calibration = computeCalibration({ samples, criteria: icp.criteria, days });
  const suggestion = suggestWeights(icp.criteria, calibration);
  const preview = suggestion.blockedReason || !suggestion.changed ? null : previewWeights(samples, normalizeWeights(icp.criteria), suggestion.weights);
  return { calibration, suggestion, preview, criteria: icp.criteria };
}

/** Motifs de gain et de perte des résultats de la période. */
export async function loadReasons(repo: Repository, orgId: string, days: number, now: Date = new Date()) {
  return reasonStats(await repo.listOutcomes(orgId, new Date(now.getTime() - days * DAY).toISOString()));
}

/** Deux configurations donnent-elles le même score ? (poids et activation ; libellés et descriptions ne comptent pas). */
export function scoringChanged(a: Criterion[], b: Criterion[]): boolean {
  if (a.length !== b.length) return true;
  const byKey = new Map(b.map((c) => [c.key, c]));
  return a.some((c) => {
    const o = byKey.get(c.key);
    return !o || o.weight !== c.weight || o.enabled !== c.enabled;
  });
}

/** Garantit une version de départ : sans elle, le "retour arrière" n'aurait rien vers quoi revenir. */
export async function ensureInitialVersion(repo: Repository, orgId: string, criteria: Criterion[], actorId: string | null): Promise<void> {
  const versions = await repo.listScoreVersions(orgId);
  if (versions.length === 0) await repo.addScoreVersion(orgId, { criteria, source: "initial", note: "Configuration de départ", createdBy: actorId });
}

/** Enregistre un changement manuel des critères (Réglages) comme nouvelle version, si le score change. */
export async function recordManualChange(repo: Repository, orgId: string, before: Criterion[], after: Criterion[], actorId: string | null): Promise<void> {
  if (!scoringChanged(before, after)) return;
  await ensureInitialVersion(repo, orgId, before, actorId);
  await repo.addScoreVersion(orgId, { criteria: after, source: "manual", note: "Modification dans Réglages", createdBy: actorId });
}

export type ApplyResult = { ok: true; version: number; changed: number } | { ok: false; error: string };

/**
 * Applique la suggestion du moment. Elle est RECALCULÉE ici, côté serveur : le client ne transmet aucun poids,
 * il ne peut donc pas imposer des valeurs arbitraires.
 */
export async function applySuggestion(repo: Repository, orgId: string, days: number, actorId: string | null, now: Date = new Date()): Promise<ApplyResult> {
  const view = await loadCalibration(repo, orgId, days, now);
  if (view.suggestion.blockedReason) return { ok: false, error: view.suggestion.blockedReason };
  if (!view.suggestion.changed) return { ok: false, error: "Aucun changement à proposer : les poids actuels sont déjà cohérents avec les résultats." };
  const icp = await repo.getIcp(orgId);
  await ensureInitialVersion(repo, orgId, icp.criteria, actorId);
  const criteria = applyWeights(icp.criteria, view.suggestion.weights);
  await repo.saveIcp({ ...icp, criteria });
  const changed = view.suggestion.changes.filter((c) => c.after !== c.before).length;
  const v = await repo.addScoreVersion(orgId, {
    criteria, source: "suggestion", createdBy: actorId,
    note: `Suggestion de calibration sur ${days} jours (${view.calibration.total} leads clos, ${changed} poids modifié${changed > 1 ? "s" : ""})`,
  });
  return { ok: true, version: v.version, changed };
}

/** Retour à une version précédente : la configuration est restaurée ET enregistrée comme une nouvelle version (historique linéaire). */
export async function restoreVersion(repo: Repository, orgId: string, versionId: string, actorId: string | null): Promise<ApplyResult> {
  const versions = await repo.listScoreVersions(orgId);
  const target = versions.find((v) => v.id === versionId);
  if (!target) return { ok: false, error: "Version introuvable." };
  const icp = await repo.getIcp(orgId);
  if (!scoringChanged(icp.criteria, target.criteria)) return { ok: false, error: `La version ${target.version} est déjà la configuration en vigueur.` };
  await ensureInitialVersion(repo, orgId, icp.criteria, actorId);
  await repo.saveIcp({ ...icp, criteria: target.criteria.map((c) => ({ ...c })) });
  const v = await repo.addScoreVersion(orgId, { criteria: target.criteria, source: "restore", note: `Retour à la version ${target.version}`, createdBy: actorId });
  return { ok: true, version: v.version, changed: 0 };
}

/** Numéro de la version dont les poids correspondent à la configuration en vigueur (la plus récente à égalité). */
export function currentVersion(versions: ScoreConfigVersion[], criteria: Criterion[]): number | null {
  const sorted = [...versions].sort((a, b) => b.version - a.version);
  return sorted.find((v) => !scoringChanged(v.criteria, criteria))?.version ?? null;
}
