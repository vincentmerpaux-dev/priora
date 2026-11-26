/**
 * Configuration unique de la vitrine (page d'accueil, SEO, section « À propos »).
 * Les liens marqués PLACEHOLDER sont à remplir par Vincent avant la mise en ligne : tant qu'ils sont vides,
 * la page affiche « à renseigner » à leur place (aucun faux lien n'est publié).
 */
export const SITE = {
  name: "Priora",
  /** Promesse affichée dans le titre de la page et les aperçus de partage. */
  tagline: "Sachez en 10 secondes quel lead appeler, et quoi lui dire",
  description:
    "Priora note chaque lead entrant sur 100, explique chaque point du score et prépare le script d'appel. Essayez la démo sans compte.",
  locale: "fr_FR",
  author: {
    name: "Vincent Merpaux",
    /** PLACEHOLDER : URL complète de votre profil LinkedIn (https://www.linkedin.com/in/...). */
    linkedin: "https://www.linkedin.com/in/vincent-merpaux/",
    /** PLACEHOLDER : URL complète du dépôt GitHub du projet ou de votre profil (https://github.com/...). */
    github: "https://github.com/vincentmerpaux-dev",
    /** PLACEHOLDER : adresse email de contact (elle sera publique sur la page). */
    email: "vincent.merpaux@hotmail.fr",
  },
  /** Ligne discrète pour les recruteurs techniques. */
  stack: ["Next.js 16", "React 19", "TypeScript", "Tailwind CSS 4", "Supabase (Postgres, RLS)", "Vitest"],
} as const;

export type AuthorLinkKey = "linkedin" | "github" | "email";

/** Lien prêt à afficher, ou null si le champ est encore à renseigner. */
export function authorLink(key: AuthorLinkKey): { href: string; label: string } | null {
  const value = SITE.author[key].trim();
  if (!value) return null;
  return key === "email" ? { href: `mailto:${value}`, label: value } : { href: value, label: value.replace(/^https?:\/\/(www\.)?/, "") };
}
