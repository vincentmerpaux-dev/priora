/** Normalise un texte pour les comparaisons : minuscules, sans accents ni ponctuation superflue. */
export function normalize(input: string | null | undefined): string {
  return (input ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.fr", "hotmail.com", "hotmail.fr", "outlook.com",
  "outlook.fr", "live.com", "live.fr", "msn.com", "icloud.com", "me.com", "free.fr", "orange.fr",
  "wanadoo.fr", "sfr.fr", "laposte.net", "neuf.fr", "bbox.fr", "proton.me", "protonmail.com", "gmx.com",
  "gmx.fr", "aol.com", "yandex.com", "mail.com", "zoho.com",
]);

export function emailDomain(email: string | null | undefined): string | null {
  const at = (email ?? "").lastIndexOf("@");
  if (at < 0) return null;
  const domain = (email ?? "").slice(at + 1).trim().toLowerCase();
  return domain.includes(".") ? domain : null;
}

export function isProEmail(email: string | null | undefined): boolean {
  const d = emailDomain(email);
  return d !== null && !FREE_EMAIL_DOMAINS.has(d);
}

export function slugify(input: string): string {
  return normalize(input)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
