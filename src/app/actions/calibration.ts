"use server";

import { revalidatePath } from "next/cache";
import { applySuggestion, CALIBRATION_PERIODS, restoreVersion } from "@/lib/calibration/service";
import { orgWithPermission } from "@/lib/session";
import { DENIED_MESSAGE } from "@/lib/team/permissions";
import { UuidSchema } from "@/lib/validation";
import type { ActionResult } from "./leads";

const DENIED = { ok: false, error: DENIED_MESSAGE } as const;

/**
 * Applique la suggestion de poids du moment (administrateurs seulement). Le client n'envoie que la période :
 * les poids sont recalculés côté serveur, jamais lus depuis la requête.
 */
export async function applySuggestionAction(days: number): Promise<ActionResult<{ version: number; changed: number }>> {
  const ctx = await orgWithPermission("calibration.apply");
  if (!ctx) return DENIED;
  if (!(CALIBRATION_PERIODS as readonly number[]).includes(days)) return { ok: false, error: "Période invalide." };
  try {
    const r = await applySuggestion(ctx.repo, ctx.session.orgId, days, ctx.session.userId);
    if (!r.ok) return r;
    revalidatePath("/calibration");
    revalidatePath("/settings");
    return { ok: true, version: r.version, changed: r.changed };
  } catch (e) {
    console.error("[priora] application de la suggestion :", e instanceof Error ? e.message : e);
    return { ok: false, error: "Impossible d'appliquer la suggestion." };
  }
}

/** Retour à une version précédente de la configuration de score (administrateurs seulement). */
export async function restoreVersionAction(versionId: string): Promise<ActionResult<{ version: number }>> {
  const ctx = await orgWithPermission("calibration.apply");
  if (!ctx) return DENIED;
  const id = UuidSchema.safeParse(versionId);
  if (!id.success) return { ok: false, error: "Version introuvable." };
  try {
    const r = await restoreVersion(ctx.repo, ctx.session.orgId, id.data, ctx.session.userId);
    if (!r.ok) return r;
    revalidatePath("/calibration");
    revalidatePath("/settings");
    return { ok: true, version: r.version };
  } catch (e) {
    console.error("[priora] retour à une version :", e instanceof Error ? e.message : e);
    return { ok: false, error: "Impossible de revenir à cette version." };
  }
}
