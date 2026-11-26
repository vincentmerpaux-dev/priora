import type { Lead, OrgSettings, Role } from "@/lib/types";

/**
 * Droits par rôle. Module pur, sans dépendance serveur : il sert aux pages, aux actions serveur
 * et aux tests. Le RLS Supabase (migration S2) reproduit exactement ces règles.
 */
export type Permission =
  | "dashboard.view" // tableau de bord manager
  | "leads.view_all" // voir tous les leads de l'organisation
  | "leads.assign" // (ré)attribuer un lead, y compris en masse
  | "leads.delete"
  | "objections.manage"
  | "team.view" // liste de l'équipe (lecture)
  | "team.manage" // inviter, changer un rôle, désactiver
  | "settings.view" // réglages (lecture)
  | "settings.manage" // critères, personas, sources, attribution, délais, clé webhook, nom
  | "calibration.view" // page Calibration (S3) : lecture des statistiques et des suggestions
  | "calibration.apply" // appliquer une suggestion de poids, revenir à une version (S3)
  | "integrations.manage"; // jeton HubSpot, synchronisation, journal (S3)

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  admin: new Set<Permission>([
    "dashboard.view", "leads.view_all", "leads.assign", "leads.delete", "objections.manage",
    "team.view", "team.manage", "settings.view", "settings.manage", "calibration.view", "calibration.apply", "integrations.manage",
  ]),
  manager: new Set<Permission>([
    "dashboard.view", "leads.view_all", "leads.assign", "leads.delete", "objections.manage", "team.view", "settings.view", "calibration.view",
  ]),
  commercial: new Set<Permission>([]),
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return role ? MATRIX[role].has(permission) : false;
}

export const isStaff = (role: Role): boolean => role === "admin" || role === "manager";

type LeadAccess = Pick<Lead, "ownerId">;

/** Lecture d'un lead : staff, propriétaire, ou file commune ouverte aux commerciaux par le réglage d'organisation. */
export function canReadLead(role: Role, userId: string, lead: LeadAccess, settings: Pick<OrgSettings, "commercialsSeeAll">): boolean {
  if (can(role, "leads.view_all")) return true;
  return lead.ownerId === userId || settings.commercialsSeeAll;
}

/** Écriture (statut, activité, relance d'analyse) : staff ou propriétaire du lead. */
export function canWriteLead(role: Role, userId: string, lead: LeadAccess): boolean {
  if (can(role, "leads.view_all")) return true;
  return lead.ownerId === userId;
}

export function visibleLeads<T extends LeadAccess>(
  leads: T[], role: Role, userId: string, settings: Pick<OrgSettings, "commercialsSeeAll">,
): T[] {
  return leads.filter((l) => canReadLead(role, userId, l, settings));
}

export const DENIED_MESSAGE = "Vous n'avez pas les droits pour cette action.";
