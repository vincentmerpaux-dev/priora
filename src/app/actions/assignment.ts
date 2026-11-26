"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { orgWithPermission } from "@/lib/session";
import { DENIED_MESSAGE } from "@/lib/team/permissions";
import { reassignLeads } from "@/lib/team/service";
import { UuidSchema } from "@/lib/validation";
import type { ActionResult } from "./leads";

const MAX_BULK = 100;
const OwnerSchema = UuidSchema.nullable();

/** Réattribution d'un lead (fiche) : managers et administrateurs. */
export async function reassignLeadAction(leadId: string, ownerId: string | null): Promise<ActionResult> {
  const ctx = await orgWithPermission("leads.assign");
  if (!ctx) return { ok: false, error: DENIED_MESSAGE };
  const id = UuidSchema.safeParse(leadId);
  const owner = OwnerSchema.safeParse(ownerId);
  if (!id.success || !owner.success) return { ok: false, error: "Demande invalide." };
  const res = await reassignLeads(ctx.repo, ctx.session.orgId, [id.data], owner.data, { userId: ctx.session.userId, name: ctx.session.name });
  if (!res.ok) return res;
  revalidatePath("/leads");
  revalidatePath("/pipeline");
  revalidatePath(`/leads/${id.data}`);
  return { ok: true };
}

/** Réattribution en masse depuis la file : managers et administrateurs. */
export async function bulkReassignAction(leadIds: string[], ownerId: string | null): Promise<ActionResult<{ changed: number }>> {
  const ctx = await orgWithPermission("leads.assign");
  if (!ctx) return { ok: false, error: DENIED_MESSAGE };
  const ids = z.array(UuidSchema).min(1, "Sélectionnez au moins un lead").max(MAX_BULK, `${MAX_BULK} leads maximum à la fois`).safeParse(leadIds);
  const owner = OwnerSchema.safeParse(ownerId);
  if (!ids.success) return { ok: false, error: ids.error.issues[0]?.message ?? "Demande invalide." };
  if (!owner.success) return { ok: false, error: "Demande invalide." };
  const res = await reassignLeads(ctx.repo, ctx.session.orgId, ids.data, owner.data, { userId: ctx.session.userId, name: ctx.session.name });
  if (!res.ok) return res;
  revalidatePath("/leads");
  revalidatePath("/pipeline");
  return { ok: true, changed: res.changed };
}
