import "server-only";
import { decryptSecret, encryptSecret, EncryptionKeyError, loadEncryptionKey } from "@/lib/integrations/crypto";
import type { IntegrationProvider } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminConfigured } from "@/lib/supabase/env";

/**
 * Stockage des jetons d'intégration (mode Supabase uniquement). Le jeton est chiffré (AES-256-GCM) avant d'être écrit
 * dans `integration_secrets`, table sans aucune policy RLS : seule la clé service role (ce module, côté serveur) y accède.
 * Ni le navigateur, ni un rôle `authenticated` ne peuvent la lire. Le jeton n'est jamais renvoyé par une action serveur.
 */

export type SecretsStatus = { ok: true } | { ok: false; reason: string };

export function secretsStatus(): SecretsStatus {
  if (!adminConfigured()) return { ok: false, reason: "SUPABASE_SERVICE_ROLE_KEY manquante : le stockage des jetons est indisponible." };
  try {
    loadEncryptionKey();
  } catch (e) {
    return { ok: false, reason: e instanceof EncryptionKeyError ? e.message : "INTEGRATIONS_ENCRYPTION_KEY invalide." };
  }
  return { ok: true };
}

const context = (orgId: string, provider: IntegrationProvider) => `${orgId}:${provider}`;

export async function saveToken(orgId: string, provider: IntegrationProvider, token: string): Promise<void> {
  const blob = encryptSecret(token, context(orgId, provider));
  const { error } = await createAdminClient().from("integration_secrets").upsert({ org_id: orgId, provider, token_encrypted: blob, updated_at: new Date().toISOString() });
  if (error) throw new Error("Enregistrement du jeton impossible.");
}

export async function readToken(orgId: string, provider: IntegrationProvider): Promise<string | null> {
  const { data, error } = await createAdminClient().from("integration_secrets").select("token_encrypted").eq("org_id", orgId).eq("provider", provider).maybeSingle();
  if (error) throw new Error("Lecture du jeton impossible.");
  return data ? decryptSecret(data.token_encrypted as string, context(orgId, provider)) : null;
}

export async function deleteToken(orgId: string, provider: IntegrationProvider): Promise<void> {
  const { error } = await createAdminClient().from("integration_secrets").delete().eq("org_id", orgId).eq("provider", provider);
  if (error) throw new Error("Suppression du jeton impossible.");
}
