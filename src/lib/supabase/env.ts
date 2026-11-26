/** Les variables Supabase publiques doivent être toutes les deux renseignées pour activer le mode réel. */
export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Démo publique (PRIORA_PUBLIC_DEMO=true) : bac à sable en mémoire par visiteur, aucun appel sortant, aucun secret utilisé.
 * Elle prime sur Supabase : même si des variables Supabase traînent dans l'environnement, aucune donnée réelle n'est exposée.
 */
export function isPublicDemo(): boolean {
  return process.env.PRIORA_PUBLIC_DEMO === "true";
}

/** Le mode démo s'active tout seul quand les variables Supabase publiques sont absentes, ou en démo publique. */
export function isDemoMode(): boolean {
  return isPublicDemo() || !supabaseConfigured();
}

export function adminConfigured(): boolean {
  return !isPublicDemo() && supabaseConfigured() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** URL publique du site : NEXT_PUBLIC_APP_URL, sinon le domaine de production Vercel, sinon localhost. */
export function appUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const url = explicit || (vercel ? `https://${vercel}` : "http://localhost:3000");
  return url.replace(/\/$/, "");
}
