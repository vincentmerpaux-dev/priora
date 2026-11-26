import { DEMO_ORG_ID } from "./data";
import { ORUS_BANNER, ORUS_ORG_ID } from "./orus";

/** Organisations disponibles en mode démo. Le choix courant est mémorisé dans un cookie (voir /demo/[org]). */
export const DEMO_COOKIE = "priora_demo_org";

export interface DemoOrgMeta {
  key: "maintia" | "orus";
  id: string;
  /** Libellé court du sélecteur. */
  label: string;
  hint: string;
  /** Bandeau permanent propre à l'organisation (cas d'étude). */
  banner: string | null;
}

export const DEMO_ORGS: DemoOrgMeta[] = [
  { key: "maintia", id: DEMO_ORG_ID, label: "Maintia", hint: "GMAO, B2B industrie", banner: null },
  { key: "orus", id: ORUS_ORG_ID, label: "Cas Orus", hint: "Assurance pro, TPE", banner: ORUS_BANNER },
];

export function demoOrgByKey(key: string | undefined | null): DemoOrgMeta {
  return DEMO_ORGS.find((o) => o.key === key) ?? DEMO_ORGS[0]!;
}

export function demoOrgById(id: string | null | undefined): DemoOrgMeta | null {
  return DEMO_ORGS.find((o) => o.id === id) ?? null;
}

/** Membre "Voir en tant que" (mode démo) : identifiant du membre, validé contre la liste de l'organisation courante. */
export const DEMO_USER_COOKIE = "priora_demo_user";
