import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Client service role : contourne le RLS. RÉSERVÉ au serveur (formulaire public, webhook).
 * Ne jamais l'importer depuis un composant client. La clé n'a pas le préfixe NEXT_PUBLIC_.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
