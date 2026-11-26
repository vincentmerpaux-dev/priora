import type { Enrichment } from "@/lib/types";
import { normalize } from "@/lib/text";
import { EFFECTIFS, nafLabel, REGIONS } from "./naf";

const ENDPOINT = "https://recherche-entreprises.api.gouv.fr/search";
const TIMEOUT_MS = 5000;

interface ApiSiege {
  libelle_commune?: string | null;
  code_postal?: string | null;
  departement?: string | null;
  region?: string | null;
  tranche_effectif_salarie?: string | null;
}
export interface ApiResult {
  siren: string;
  nom_complet?: string;
  nom_raison_sociale?: string | null;
  activite_principale?: string | null;
  date_creation?: string | null;
  categorie_entreprise?: string | null;
  tranche_effectif_salarie?: string | null;
  siege?: ApiSiege;
}

export function similarity(a: string, b: string): number {
  const tok = (s: string) => new Set(normalize(s).split(/[^a-z0-9]+/).filter((t) => t.length > 1));
  const ta = tok(a);
  const tb = tok(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / Math.min(ta.size, tb.size);
}

export type GouvResult = { company?: Enrichment["company"]; note: string | null };

export function mapResult(r: ApiResult): NonNullable<Enrichment["company"]> {
  const effCode = r.tranche_effectif_salarie ?? r.siege?.tranche_effectif_salarie ?? null;
  const naf = r.activite_principale ?? null;
  const regionCode = r.siege?.region ?? null;
  return {
    siren: r.siren,
    legalName: r.nom_complet ?? r.nom_raison_sociale ?? r.siren,
    nafCode: naf,
    sectorLabel: nafLabel(naf),
    employees: effCode && EFFECTIFS[effCode] ? EFFECTIFS[effCode] : null,
    creationDate: r.date_creation ?? null,
    city: r.siege?.libelle_commune ?? null,
    postalCode: r.siege?.code_postal ?? null,
    department: r.siege?.departement ?? null,
    region: regionCode ? (REGIONS[regionCode] ?? null) : null,
    categorie: r.categorie_entreprise ?? null,
  };
}

/** Recherche une entreprise par nom via l'API publique gratuite. Ne lève jamais d'exception. */
export async function lookupCompany(name: string, fetchImpl: typeof fetch = fetch): Promise<GouvResult> {
  if (process.env.PRIORA_PUBLIC_DEMO === "true") return { note: "Démo publique : appel au registre désactivé." };
  const query = name.trim();
  if (query.length < 2) return { note: "Nom d'entreprise trop court pour la recherche." };
  try {
    const url = `${ENDPOINT}?q=${encodeURIComponent(query)}&per_page=5&etat_administratif=A`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" } });
    if (res.status === 429) return { note: "API Recherche d'entreprises : limite de requêtes atteinte, réessayez plus tard." };
    if (!res.ok) return { note: `API Recherche d'entreprises indisponible (HTTP ${res.status}).` };
    const json = (await res.json()) as { results?: ApiResult[] };
    const results = json.results ?? [];
    if (results.length === 0) return { note: "Aucune entreprise trouvée dans le registre pour ce nom." };
    const scored = results
      .map((r) => ({ r, s: similarity(query, `${r.nom_complet ?? ""} ${r.nom_raison_sociale ?? ""}`) }))
      .sort((x, y) => y.s - x.s);
    const best = scored[0];
    if (!best || best.s < 0.5) return { note: "Aucune correspondance fiable dans le registre (nom trop différent)." };
    return { company: mapResult(best.r), note: null };
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { note: timeout ? "API Recherche d'entreprises : délai dépassé." : "API Recherche d'entreprises injoignable." };
  }
}
