import { can, type Permission } from "@/lib/team/permissions";
import type { Role } from "@/lib/types";

/**
 * Navigation principale : 4 entrées au plus, selon le rôle. Module pur (testé), sans dépendance React.
 * Les anciennes URL (/dashboard, /calibration, /team, /objections, /settings) restent des pages à part entière :
 * elles sont simplement regroupées sous une entrée de menu et reliées par des onglets.
 */
export interface Tab { href: string; label: string; permission?: Permission }
export type GroupId = "leads" | "pipeline" | "pilotage" | "reglages";
export interface NavGroup { id: GroupId; label: string; short: string; tabs: Tab[] }

const GROUPS: NavGroup[] = [
  { id: "leads", label: "Leads", short: "Leads", tabs: [{ href: "/leads", label: "Leads" }] },
  { id: "pipeline", label: "Pipeline", short: "Pipeline", tabs: [{ href: "/pipeline", label: "Pipeline" }] },
  {
    id: "pilotage", label: "Pilotage", short: "Pilotage",
    tabs: [
      { href: "/dashboard", label: "Tableau de bord", permission: "dashboard.view" },
      { href: "/calibration", label: "Calibration", permission: "calibration.view" },
    ],
  },
  {
    id: "reglages", label: "Réglages", short: "Réglages",
    tabs: [
      { href: "/settings", label: "Réglages", permission: "settings.view" },
      { href: "/team", label: "Équipe", permission: "team.view" },
      { href: "/objections", label: "Objections" },
    ],
  },
];

/** Groupes visibles pour un rôle, onglets filtrés par droit. Un groupe sans onglet disponible disparaît. */
export function navFor(role: Role | null | undefined): NavGroup[] {
  return GROUPS
    .map((g) => ({ ...g, tabs: g.tabs.filter((t) => !t.permission || can(role, t.permission)) }))
    .filter((g) => g.tabs.length > 0)
    // Un commercial n'a que l'onglet Objections : l'entrée porte alors son vrai nom.
    .map((g) => (g.id === "reglages" && g.tabs.length === 1 && g.tabs[0]!.href === "/objections" ? { ...g, label: "Objections", short: "Objections" } : g));
}

const matches = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Groupe actif pour un chemin (les sous-pages, par ex. /leads/import, restent dans leur groupe). */
export function activeGroup(groups: NavGroup[], pathname: string): NavGroup | undefined {
  return groups.find((g) => g.tabs.some((t) => matches(pathname, t.href)));
}

export const tabActive = matches;
