import { EFFECTIFS } from "@/lib/enrichment/naf";
import { PUBLIC_DEMO_ENRICHMENT_NOTE } from "@/lib/demo/public";
import type { Enrichment } from "@/lib/types";

/**
 * Enrichissement FICTIF de la démo publique : aucun appel réseau. Déterministe (même entreprise, même résultat),
 * SIREN en 999... (jamais attribués), explicitement annoncé comme fictif dans les notes du lead.
 */
export function fictiveEnrichment(input: { company: string }, now: Date = new Date()): Enrichment {
  const name = input.company.trim();
  let h = 2166136261;
  for (const ch of name.toLowerCase()) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const sizes = ["12", "21", "22", "31"] as const;
  const eff = EFFECTIFS[sizes[h % sizes.length]!] ?? null;
  return {
    status: "partial",
    fetchedAt: now.toISOString(),
    company: {
      siren: `999${String(h % 1_000_000).padStart(6, "0")}`,
      legalName: name.toUpperCase(),
      nafCode: null, sectorLabel: null, employees: eff, creationDate: null,
      city: null, postalCode: null, department: null, region: null, categorie: null,
    },
    notes: [PUBLIC_DEMO_ENRICHMENT_NOTE],
  };
}
