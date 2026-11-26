import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { DEMO_COOKIE, DEMO_USER_COOKIE, demoOrgByKey } from "@/lib/demo/orgs";
import { getRepo } from "@/lib/repo";
import { demoMembers } from "@/lib/repo/demo";
import type { Repository, Session } from "@/lib/repo/types";
import { getDemoSid, enforceDemoActionLimit } from "@/lib/demo/visitor";
import { isDemoMode } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { can, type Permission } from "@/lib/team/permissions";
import type { Role } from "@/lib/types";

/**
 * Session courante : utilisateur vérifié côté serveur (getUser) + organisation + rôle.
 * Mode démo : l'utilisateur est le membre choisi dans "Voir en tant que" (cookie validé contre la liste des membres).
 */
export const getSession = cache(async (): Promise<Session | null> => {
  if (isDemoMode()) {
    const jar = await cookies();
    const demoOrg = demoOrgByKey(jar.get(DEMO_COOKIE)?.value);
    const members = demoMembers(demoOrg.id, await getDemoSid()).filter((m) => m.active);
    const chosen = members.find((m) => m.userId === jar.get(DEMO_USER_COOKIE)?.value) ?? members.find((m) => m.role === "admin") ?? members[0]!;
    return { mode: "demo", userId: chosen.userId, email: chosen.email, name: chosen.name, orgId: demoOrg.id, role: chosen.role };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const { data: member } = await supabase
    .from("members")
    .select("org_id, role, active, full_name")
    .eq("user_id", data.user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const email = data.user.email ?? "";
  return {
    mode: "supabase",
    userId: data.user.id,
    email,
    name: member?.full_name || email.split("@")[0] || "Moi",
    orgId: member?.org_id ?? null,
    role: (member?.role as Role | undefined) ?? null,
    disabled: member ? member.active === false : false,
  };
});

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export interface OrgContext {
  session: Session & { orgId: string; role: Role };
  repo: Repository;
}

/** Garantit une session connectée ET rattachée à une organisation (sinon onboarding). Compte désactivé : page dédiée. */
export async function requireOrg(): Promise<OrgContext> {
  await enforceDemoActionLimit();
  const session = await requireSession();
  if (session.disabled) redirect("/account-disabled");
  if (!session.orgId || !session.role) redirect("/onboarding");
  return { session: session as OrgContext["session"], repo: await getRepo() };
}

/** Garde de page : 403 si le rôle n'a pas la permission. À appeler dans le rendu de la page, avant toute lecture de données. */
export async function requirePermission(permission: Permission): Promise<OrgContext> {
  const ctx = await requireOrg();
  if (!can(ctx.session.role, permission)) forbidden();
  return ctx;
}

/** Réservé aux actions serveur : retourne null si le rôle n'a pas la permission (l'action renvoie alors un refus). */
export async function orgWithPermission(permission: Permission): Promise<OrgContext | null> {
  const ctx = await requireOrg();
  return can(ctx.session.role, permission) ? ctx : null;
}
