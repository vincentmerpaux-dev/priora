import type { Lead, LeadStatus, Verdict } from "@/lib/types";

/**
 * Interface d'adaptateur CRM. HubSpot l'implémente (voir hubspot/sync.ts).
 * Pipedrive est PRÉVU EN V2 : aucune implémentation dans cette version, seulement ce contrat pour que
 * l'ajout d'un CRM ne touche ni la fiche lead, ni le journal, ni les notifications.
 */
export interface PushFacts {
  score: number | null;
  verdict: Verdict | null;
  summary: string | null;
  status: LeadStatus;
}

export interface PushResult {
  contactId: string;
  dealId: string | null;
  contactCreated: boolean;
  dealCreated: boolean;
  /** Vrai si le score a pu être écrit dans des propriétés personnalisées (sinon : dans la description de la transaction). */
  customProperties: boolean;
}

export interface CrmContact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  phone: string | null;
  jobTitle: string | null;
}

export interface CrmAdapter {
  readonly provider: "hubspot" | "pipedrive";
  /** Teste les identifiants (lecture minimale). Lève une erreur lisible si le jeton est refusé. */
  ping(): Promise<void>;
  /** Crée ou met à jour le contact (par email) et la transaction, avec le score et le verdict Priora. */
  pushLead(lead: Lead, facts: PushFacts, existing: { contactId: string | null; dealId: string | null } | null): Promise<PushResult>;
  /** Contacts créés depuis `sinceMs`, au format neutre. */
  listRecentContacts(sinceMs: number, limit: number): Promise<CrmContact[]>;
}
