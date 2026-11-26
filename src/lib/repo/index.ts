import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminConfigured, isDemoMode, isPublicDemo } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getDemoSid } from "@/lib/demo/visitor";
import { createDemoRepository, demoPublicRepository, demoRepository } from "./demo";
import { createSupabaseRepository } from "./supabase";
import type { PublicRepository, Repository } from "./types";
import type { Organization } from "@/lib/types";

/** Repository de l'utilisateur connecté (RLS actif en mode Supabase). */
export async function getRepo(): Promise<Repository> {
  if (isPublicDemo()) return createDemoRepository(await getDemoSid());
  if (isDemoMode()) return demoRepository;
  return createSupabaseRepository(await createClient());
}

/** Accès serveur sans session (formulaire public, webhook). Null si la clé service role n'est pas configurée. */
export function getPublicRepo(): PublicRepository | null {
  // Démo publique : ni formulaire, ni webhook, ni email entrant réels (aucune donnée de visiteur n'est acceptée de l'extérieur).
  if (isPublicDemo()) return null;
  if (isDemoMode()) return demoPublicRepository;
  if (!adminConfigured()) return null;
  const db = createAdminClient();
  const repo = createSupabaseRepository(db);
  const toOrg = (r: Record<string, string | null>): Organization => ({
    id: r.id as string, name: r.name as string, slug: r.slug as string, onboardedAt: r.onboarded_at, createdAt: r.created_at as string,
  });
  return {
    async getOrganizationBySlug(slug) {
      const { data } = await db.from("organizations").select("*").eq("slug", slug).maybeSingle();
      return data ? toOrg(data) : null;
    },
    async findOrganizationByWebhookKeyHash(hash) {
      const { data } = await db.from("webhook_keys").select("org_id").eq("key_hash", hash).maybeSingle();
      if (!data) return null;
      const { data: org } = await db.from("organizations").select("*").eq("id", data.org_id).maybeSingle();
      return org ? toOrg(org) : null;
    },
    async findOrganizationByInboundKeyHash(hash) {
      const { data } = await db.from("inbound_email_keys").select("org_id").eq("key_hash", hash).maybeSingle();
      if (!data) return null;
      const { data: org } = await db.from("organizations").select("*").eq("id", data.org_id).maybeSingle();
      return org ? toOrg(org) : null;
    },
    async listOrganizations() {
      const { data } = await db.from("organizations").select("*").order("created_at", { ascending: true }).limit(500);
      return (data ?? []).map(toOrg);
    },
    repoForOrg: () => repo,
  };
}
