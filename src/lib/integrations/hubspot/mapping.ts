import type { HubSpotObject } from "@/lib/integrations/hubspot/client";
import { guessCompany } from "@/lib/inbound/email";
import { verdictLabel } from "@/lib/scoring/engine";
import type { Lead, LeadStatus } from "@/lib/types";
import type { PushFacts } from "@/lib/integrations/adapter";
import { LeadInputSchema, type LeadInput } from "@/lib/validation";

/** Correspondances Priora <-> HubSpot, en fonctions pures (testables, sans réseau). */

/**
 * Étapes du pipeline de transactions PAR DÉFAUT de HubSpot (identifiants internes). Un pipeline personnalisé
 * a d'autres identifiants : HubSpot répondrait 400 et l'erreur apparaîtrait dans le journal de synchronisation.
 */
export function dealStageFor(status: LeadStatus): string {
  if (status === "won") return "closedwon";
  if (status === "lost") return "closedlost";
  if (status === "qualified") return "qualifiedtobuy";
  return "appointmentscheduled";
}

export function leadToContactProps(lead: Pick<Lead, "firstName" | "lastName" | "phone" | "company" | "jobTitle">, facts: PushFacts, customProps: boolean): Record<string, string | number> {
  const props: Record<string, string | number> = { company: lead.company };
  if (lead.firstName) props.firstname = lead.firstName;
  if (lead.lastName) props.lastname = lead.lastName;
  if (lead.phone) props.phone = lead.phone;
  if (lead.jobTitle) props.jobtitle = lead.jobTitle;
  if (customProps) {
    if (facts.score !== null) props.priora_score = facts.score;
    if (facts.verdict) props.priora_verdict = verdictLabel(facts.verdict);
  }
  return props;
}

export function leadToDealProps(lead: Pick<Lead, "company">, facts: PushFacts, customProps: boolean): Record<string, string | number> {
  const verdict = facts.verdict ? verdictLabel(facts.verdict) : "non analysé";
  const scoreText = facts.score === null ? "score indisponible" : `score ${facts.score}/100`;
  const props: Record<string, string | number> = {
    dealname: `${lead.company} : demande entrante (${scoreText})`.slice(0, 200),
    pipeline: "default",
    dealstage: dealStageFor(facts.status),
    // Repli lisible même sans propriétés personnalisées : le score et le verdict restent visibles dans la transaction.
    description: [`Priora : ${scoreText}, verdict « ${verdict} ».`, facts.summary ?? ""].filter(Boolean).join("\n").slice(0, 2000),
  };
  if (customProps) {
    if (facts.score !== null) props.priora_score = facts.score;
    if (facts.verdict) props.priora_verdict = verdictLabel(facts.verdict);
  }
  return props;
}

/** Contact HubSpot -> entrée de lead Priora, ou null si l'email manque ou est invalide. */
export function contactToLeadInput(c: HubSpotObject): LeadInput | null {
  const p = c.properties;
  const email = (p.email ?? "").trim();
  if (!email) return null;
  const company = (p.company ?? "").trim() || guessCompany("", email.toLowerCase(), `${p.firstname ?? ""} ${p.lastname ?? ""}`.trim(), null);
  const parsed = LeadInputSchema.safeParse({
    firstName: p.firstname ?? "", lastName: p.lastname ?? "", email, phone: p.phone ?? null, company, jobTitle: p.jobtitle ?? null,
    website: null, location: null, message: "Contact importé depuis HubSpot (aucun message : l'intention n'est pas connue).", sourceDetail: "Import HubSpot",
  });
  return parsed.success ? parsed.data : null;
}
