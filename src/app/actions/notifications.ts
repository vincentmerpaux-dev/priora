"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/session";
import { UuidSchema } from "@/lib/validation";
import type { ActionResult } from "./leads";

/** Marque comme lues les notifications DE L'UTILISATEUR COURANT (jamais celles d'un autre membre). */
export async function markNotificationsReadAction(ids: string[] | "all"): Promise<ActionResult> {
  const { repo, session } = await requireOrg();
  const parsed = z.union([z.literal("all"), z.array(UuidSchema).max(100)]).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    await repo.markNotificationsRead(session.orgId, session.userId, parsed.data);
  } catch (e) {
    console.error("[priora] notifications :", e instanceof Error ? e.message : e);
    return { ok: false, error: "Impossible de mettre à jour les notifications." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
