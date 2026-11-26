import { normalize } from "@/lib/text";
import type { Lead, Persona } from "@/lib/types";

/** Accepte l'ancien format {title, description} (S1) et le format actuel. */
export function normalizePersonas(raw: unknown): Persona[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((p): Persona[] => {
    if (!p || typeof p !== "object") return [];
    const o = p as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const name = str(o.name) || str(o.title);
    if (!name) return [];
    return [{
      name,
      role: str(o.role) || str(o.title),
      challenges: str(o.challenges) || str(o.description),
      objections: Array.isArray(o.objections) ? o.objections.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [],
    }];
  });
}

const STOP = new Set([
  "de", "du", "des", "la", "le", "les", "un", "une", "et", "en", "au", "aux", "pour", "sur", "dans", "avec", "que", "qui", "est", "son", "ses", "par", "ou", "ne", "pas",
  "plus", "mais", "nous", "vous", "ils", "elle", "cette", "tres", "chez", "afin", "leur", "leurs",
]);

function tokens(text: string, minLen = 4): string[] {
  return normalize(text).split(/[^a-z0-9]+/).filter((w) => w.length >= minLen && !STOP.has(w));
}

export interface PersonaMatch {
  persona: Persona;
  score: number;
  reason: string;
}

/**
 * Rattache un lead au persona le plus proche, par règles : fonction du contact (poids fort),
 * puis vocabulaire commun entre le message du lead et les enjeux ou objections du persona (poids faible).
 * Retourne null si rien ne correspond : mieux vaut aucun persona qu'un persona arbitraire.
 */
export function matchPersona(
  lead: Pick<Lead, "jobTitle" | "message" | "company">,
  personas: Persona[],
): PersonaMatch | null {
  if (personas.length === 0) return null;
  const job = normalize(lead.jobTitle);
  const message = normalize([lead.message, lead.company, lead.jobTitle].filter(Boolean).join(" "));
  let best: PersonaMatch | null = null;

  for (const p of personas) {
    let score = 0;
    const why: string[] = [];

    const roleTokens = [...new Set([...tokens(p.role), ...tokens(p.name)])];
    const roleHits = roleTokens.filter((t) => job.includes(t));
    if (roleHits.length > 0) {
      score += 3 * roleHits.length;
      why.push(`fonction « ${lead.jobTitle} » proche de « ${p.role || p.name} »`);
    }

    const topicTokens = [...new Set([...tokens(p.challenges, 5), ...p.objections.flatMap((o) => tokens(o, 5))])];
    const topicHits = topicTokens.filter((t) => message.includes(t));
    // Un seul mot en commun est trop fragile ("outil", "projet") : il en faut au moins deux.
    if (topicHits.length >= 2) {
      score += Math.min(topicHits.length, 4);
      why.push(`vocabulaire commun (${topicHits.slice(0, 3).join(", ")})`);
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { persona: p, score, reason: `Rattaché par règles : ${why.join(" ; ")}.` };
    }
  }
  return best;
}
