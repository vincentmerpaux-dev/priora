import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminConfigured, appUrl, isDemoMode } from "@/lib/supabase/env";

export type InviteOutcome = { ok: true; userId: string; simulated: boolean } | { ok: false; error: string };

/**
 * Crée le compte invité et envoie le courriel d'invitation (Supabase Auth, clé service role, serveur uniquement).
 * Mode démo : invitation SIMULEE, aucun courriel n'est envoyé.
 */
export async function inviteByEmail(email: string): Promise<InviteOutcome> {
  if (isDemoMode()) return { ok: true, userId: crypto.randomUUID(), simulated: true };
  if (!adminConfigured()) return { ok: false, error: "L'invitation nécessite la clé SUPABASE_SERVICE_ROLE_KEY côté serveur." };
  const { data, error } = await createAdminClient().auth.admin.inviteUserByEmail(email, { redirectTo: `${appUrl()}/auth/callback` });
  if (error || !data.user) {
    const m = (error?.message ?? "").toLowerCase();
    if (m.includes("already") || m.includes("registered")) return { ok: false, error: "Un compte existe déjà avec cet email." };
    if (m.includes("rate")) return { ok: false, error: "Trop d'invitations envoyées. Réessayez dans quelques minutes." };
    console.error("[priora] invitation :", error?.message);
    return { ok: false, error: "Invitation impossible pour le moment." };
  }
  return { ok: true, userId: data.user.id, simulated: false };
}
