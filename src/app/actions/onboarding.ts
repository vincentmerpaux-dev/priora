"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRepo } from "@/lib/repo";
import { requireSession } from "@/lib/session";
import { isDemoMode } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { IcpSchema, ObjectionSchema, OrgNameSchema, SlugSchema } from "@/lib/validation";

const PayloadSchema = z.object({
  orgName: OrgNameSchema,
  slug: SlugSchema,
  icp: IcpSchema,
  objections: z.array(ObjectionSchema.omit({ id: true })).max(50),
});

export type OnboardingResult = { ok: false; error: string; field?: "orgName" | "slug" } | { ok: true };

const RESERVED_SLUGS = new Set(["admin", "api", "app", "login", "auth", "demo", "f", "legal", "www"]);

export async function completeOnboarding(raw: unknown): Promise<OnboardingResult> {
  const session = await requireSession();
  // Reconfigurer une organisation existante est réservé aux administrateurs.
  if (session.orgId && session.role !== "admin") return { ok: false, error: "Action réservée aux administrateurs." };
  const parsed = PayloadSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "Données invalides." };
  }
  const { orgName, slug, icp, objections } = parsed.data;
  if (RESERVED_SLUGS.has(slug)) return { ok: false, field: "slug", error: "Cet identifiant est réservé." };

  let orgId = session.orgId;
  if (!orgId) {
    if (isDemoMode()) return { ok: false, error: "Organisation de démonstration introuvable." };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_organization", { p_name: orgName, p_slug: slug });
    if (error) {
      if (error.code === "23505") return { ok: false, field: "slug", error: "Cet identifiant est déjà pris, choisissez-en un autre." };
      return { ok: false, error: "Création de l'organisation impossible. Réessayez." };
    }
    orgId = data as string;
  }

  const repo = await getRepo();
  try {
    await repo.updateOrganization(orgId, { name: orgName, onboardedAt: new Date().toISOString() });
    await repo.saveIcp({ ...icp, orgId });
    await repo.replaceObjections(orgId, objections);
  } catch (e) {
    console.error("[priora] onboarding :", e instanceof Error ? e.message : e);
    return { ok: false, error: "Enregistrement impossible. Réessayez." };
  }
  revalidatePath("/", "layout");
  redirect("/leads");
}
