import { dropFakeHubSpotFor } from "@/lib/integrations/hubspot/fake";
import { buildDemoData, DEMO_ORG_ID, type DemoStoreData } from "./data";
import { buildOrusData, ORUS_ORG_ID } from "./orus";

/**
 * Bacs à sable de la démo publique : un jeu de données en mémoire par visiteur (cookie de session démo).
 * Les actions d'un visiteur n'affectent jamais celles d'un autre. Module pur (sans Next.js), donc testable.
 *
 * Limites, assumées : sur Vercel (serverless), la mémoire n'est pas partagée entre instances et peut être recyclée
 * à tout moment. Un bac à sable absent est simplement reconstruit à l'identique (données de départ) : au pire,
 * le visiteur retrouve la démo dans son état initial, jamais une erreur.
 */

/** Une base par organisation de démo (Maintia et Cas Orus), construite à la demande. */
export const STORE_BUILDERS: Record<string, () => DemoStoreData> = {
  [DEMO_ORG_ID]: buildDemoData,
  [ORUS_ORG_ID]: buildOrusData,
};

export const DEFAULT_SANDBOX_TTL_MS = 2 * 60 * 60 * 1000;
export const DEFAULT_SANDBOX_MAX = 40;
/** Plafond de leads par organisation et par bac à sable (anti-abus). */
export const SANDBOX_MAX_LEADS = 260;

interface Sandbox {
  lastSeen: number;
  stores: Map<string, DemoStoreData>;
}

export interface SandboxOptions {
  ttlMs?: number;
  maxSessions?: number;
  build?: (orgId: string) => DemoStoreData | null;
  /** Appelé quand un bac à sable disparaît (expiration, plafond, réinitialisation) : nettoyage des états annexes. */
  onDrop?: (sid: string) => void;
}

export class SandboxRegistry {
  private readonly sessions = new Map<string, Sandbox>();
  private readonly ttlMs: number;
  private readonly maxSessions: number;
  private readonly build: (orgId: string) => DemoStoreData | null;
  private readonly onDrop?: (sid: string) => void;

  constructor(opts: SandboxOptions = {}) {
    this.ttlMs = opts.ttlMs ?? DEFAULT_SANDBOX_TTL_MS;
    this.maxSessions = Math.max(1, opts.maxSessions ?? DEFAULT_SANDBOX_MAX);
    this.build = opts.build ?? ((orgId) => STORE_BUILDERS[orgId]?.() ?? null);
    this.onDrop = opts.onDrop;
  }

  /** Données d'une organisation pour ce visiteur (créées à la première demande, prolongées à chaque accès). */
  store(sid: string, orgId: string, now: number = Date.now()): DemoStoreData {
    let box = this.sessions.get(sid);
    if (box && now - box.lastSeen >= this.ttlMs) {
      this.drop(sid);
      box = undefined;
    }
    if (!box) {
      this.sweep(now);
      // Plafond atteint : le visiteur le moins récemment actif est écarté (sa démo se reconstruira à l'identique).
      while (this.sessions.size >= this.maxSessions) {
        const oldest = this.sessions.keys().next().value;
        if (oldest === undefined) break;
        this.drop(oldest);
      }
      box = { lastSeen: now, stores: new Map() };
      this.sessions.set(sid, box);
    } else {
      // Réinsertion : l'ordre d'itération de la Map reste du moins récent au plus récent.
      box.lastSeen = now;
      this.sessions.delete(sid);
      this.sessions.set(sid, box);
    }
    let data = box.stores.get(orgId);
    if (!data) {
      const built = this.build(orgId);
      if (!built) throw new Error("Organisation inconnue en mode démo.");
      data = built;
      box.stores.set(orgId, data);
    }
    return data;
  }

  /** Bouton "Réinitialiser la démo" : le bac à sable du visiteur repart des données de départ. */
  reset(sid: string): void {
    this.drop(sid);
  }

  has(sid: string, now: number = Date.now()): boolean {
    const box = this.sessions.get(sid);
    return Boolean(box && now - box.lastSeen < this.ttlMs);
  }

  size(): number {
    return this.sessions.size;
  }

  /** Supprime les bacs à sable expirés. */
  sweep(now: number = Date.now()): void {
    for (const [sid, box] of this.sessions) if (now - box.lastSeen >= this.ttlMs) this.drop(sid);
  }

  private drop(sid: string): void {
    this.sessions.delete(sid);
    this.onDrop?.(sid);
  }
}

const g = globalThis as unknown as { __prioraSandboxes?: SandboxRegistry };

function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Registre unique du processus (survit au rechargement à chaud en développement). */
export function sandboxes(): SandboxRegistry {
  return (g.__prioraSandboxes ??= new SandboxRegistry({
    ttlMs: envInt("PRIORA_DEMO_TTL_MINUTES", DEFAULT_SANDBOX_TTL_MS / 60_000) * 60_000,
    maxSessions: envInt("PRIORA_DEMO_MAX_SESSIONS", DEFAULT_SANDBOX_MAX),
    onDrop: (sid) => dropFakeHubSpotFor(sid),
  }));
}

export { DEMO_SID_COOKIE, isValidSid, SID_PATTERN } from "./sandbox-id";
