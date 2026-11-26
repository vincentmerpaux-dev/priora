import "server-only";
import { appUrl } from "@/lib/supabase/env";

/**
 * Envoi d'email optionnel via Resend (offre gratuite : 100 emails par jour, 3 000 par mois).
 * Sans RESEND_API_KEY, rien n'est envoyé : les notifications restent dans l'application.
 */
export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY) && process.env.PRIORA_PUBLIC_DEMO !== "true";
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export async function sendEmail(msg: EmailMessage, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (process.env.PRIORA_PUBLIC_DEMO === "true") return { ok: false, error: "Envoi d'emails désactivé dans la démo publique" };
  if (!key) return { ok: false, error: "RESEND_API_KEY absente" };
  // Adresse d'expédition : le domaine de test de Resend n'envoie qu'au propriétaire du compte ; vérifier un domaine pour la production.
  const from = process.env.RESEND_FROM || "Priora <onboarding@resend.dev>";
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [msg.to], subject: msg.subject.slice(0, 200), text: msg.text.slice(0, 4000) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, error: `Resend a répondu ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur réseau" };
  }
}

export const leadLink = (leadId: string | null): string => `${appUrl()}${leadId ? `/leads/${leadId}` : "/leads"}`;
