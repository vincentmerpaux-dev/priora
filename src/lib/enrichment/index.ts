import "server-only";
import type { Enrichment } from "@/lib/types";
import { emailDomain, isProEmail } from "@/lib/text";
import { isPublicDemo } from "@/lib/supabase/env";
import { fictiveEnrichment } from "./fictive";
import { lookupCompany } from "./gouv";
import { readWebsite } from "./website";

/** Enrichit un lead : registre officiel (SIREN, effectif, NAF) + lecture du site web. Ne lève jamais d'exception. */
export async function enrichLead(input: { company: string; email: string; website: string | null }): Promise<Enrichment> {
  // Démo publique : aucun appel sortant (registre, site du prospect), données fictives.
  if (isPublicDemo()) return fictiveEnrichment(input);
  const notes: string[] = [];
  const domain = isProEmail(input.email) ? emailDomain(input.email) : null;
  const siteTarget = input.website?.trim() || domain;

  const [gouv, site] = await Promise.all([
    lookupCompany(input.company),
    siteTarget ? readWebsite(siteTarget) : Promise.resolve({ info: undefined, note: "Pas de site web détectable (email personnel et aucun site renseigné)." }),
  ]);
  if (gouv.note) notes.push(gouv.note);
  if (site.note) notes.push(site.note);

  const found = [gouv.company, site.info].filter(Boolean).length;
  return {
    status: found === 2 ? "ok" : found === 1 ? "partial" : "unavailable",
    fetchedAt: new Date().toISOString(),
    company: gouv.company,
    website: site.info,
    notes,
  };
}
