"use client";

import { useSyncExternalStore } from "react";
import { Clock } from "@/components/icons";
import { Tag } from "@/components/ui/badges";
import { speedHint, speedLabel, speedStatus, type SpeedStatus } from "@/lib/team/speed";
import type { Lead, OrgSettings, Verdict } from "@/lib/types";
import { cn } from "@/lib/utils";

export type SpeedLeadInput = Pick<Lead, "createdAt" | "firstContactedAt" | "status"> & { verdict: Verdict | null };
export type SpeedTargets = OrgSettings["speedTargets"];

const TICK = 15_000;
// Instant partagé, rafraîchi toutes les 15 s. Valeur stable entre deux rafraîchissements (exigé par useSyncExternalStore).
let current = 0;
const subscribe = (cb: () => void) => {
  current = Date.now();
  const t = setInterval(() => {
    current = Date.now();
    cb();
  }, TICK);
  return () => clearInterval(t);
};
const clientNow = () => (current ||= Date.now());

/** Horloge partagée : le rendu serveur utilise l'heure du serveur (pas de décalage à l'hydratation), puis le compte à rebours avance seul. */
export function useNow(serverNowIso: string): Date {
  const serverMs = new Date(serverNowIso).getTime();
  const ms = useSyncExternalStore(subscribe, clientNow, () => serverMs);
  return new Date(ms);
}

export function speedTone(s: SpeedStatus): "neutral" | "accent" | "warn" | "danger" {
  switch (s.state) {
    case "overdue": return "danger";
    case "late": return "warn";
    case "met": return "accent";
    case "pending": return s.targetMinutes && (s.minutes ?? 0) <= s.targetMinutes * 0.5 ? "warn" : "neutral";
    default: return "neutral";
  }
}

/** Badge de délai de premier contact : compte à rebours, retard, ou délai réalisé. */
export function SpeedBadge({ lead, targets, nowIso, className }: { lead: SpeedLeadInput; targets: SpeedTargets; nowIso: string; className?: string }) {
  const now = useNow(nowIso);
  const s = speedStatus(lead, { speedTargets: targets }, now);
  const label = speedLabel(s);
  if (!label) return <span className={cn("text-[12px] text-faint", className)}>Pas de délai cible</span>;
  const live = s.state === "pending" || s.state === "overdue";
  return (
    <Tag tone={speedTone(s)} className={cn("num whitespace-nowrap", className)} title={speedHint(s)}>
      {live ? <Clock className="size-3" aria-hidden /> : null}
      <span>{label}</span>
    </Tag>
  );
}
