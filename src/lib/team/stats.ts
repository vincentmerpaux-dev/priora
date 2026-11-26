import { speedStatus } from "@/lib/team/speed";
import type { Lead, LeadSourceType, LeadStatus, Member, OrgSettings, Verdict } from "@/lib/types";
import { LEAD_STATUSES, SOURCE_TYPES } from "@/lib/types";

/** Agrégats du tableau de bord manager. Fonctions pures : mêmes entrées, mêmes sorties. */

export type StatLead = Pick<Lead, "id" | "createdAt" | "firstContactedAt" | "status" | "ownerId" | "source"> & {
  scoreTotal: number | null;
  verdict: Verdict | null;
};

export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];

export const SCORE_BANDS = [
  { key: "low", label: "0 à 39", min: 0, max: 39 },
  { key: "mid", label: "40 à 69", min: 40, max: 69 },
  { key: "high", label: "70 à 100", min: 70, max: 100 },
] as const;

const DAY = 86_400_000;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

const rate = (num: number, den: number): number | null => (den > 0 ? num / den : null);

export interface SalesRow {
  userId: string;
  name: string;
  active: boolean;
  assigned: number;
  handled: number;
  medianMinutes: number | null;
  withinPct: number | null;
  won: number;
  lost: number;
  winRate: number | null;
}

export interface Dashboard {
  days: number;
  from: string;
  total: number;
  open: number;
  won: number;
  lost: number;
  winRate: number | null;
  volume: { buckets: { start: string; count: number }[]; bucketDays: number; bySource: { source: LeadSourceType; count: number }[] };
  firstContact: { medianMinutes: number | null; withinPct: number | null; measured: number; within: number; overdueNow: number; neverContacted: number };
  byScoreBand: { key: string; label: string; leads: number; won: number; lost: number; open: number; winRate: number | null }[];
  bySales: SalesRow[];
  pipeline: { status: LeadStatus; count: number }[];
}

export function computeDashboard(input: {
  leads: StatLead[];
  members: Pick<Member, "userId" | "name" | "role" | "active">[];
  settings: Pick<OrgSettings, "speedTargets">;
  days: number;
  now?: Date;
}): Dashboard {
  const now = input.now ?? new Date();
  const { settings, days } = input;
  const fromMs = now.getTime() - days * DAY;
  const leads = input.leads.filter((l) => {
    const t = new Date(l.createdAt).getTime();
    return t >= fromMs && t <= now.getTime();
  });

  // Volume par tranche : 1 jour (7 et 30 j), 3 jours (90 j) pour garder 30 barres au plus.
  const bucketDays = days > 30 ? 3 : 1;
  const count = Math.ceil(days / bucketDays);
  const buckets = Array.from({ length: count }, (_, i) => ({ start: new Date(fromMs + i * bucketDays * DAY).toISOString(), count: 0 }));
  for (const l of leads) {
    const i = Math.min(count - 1, Math.floor((new Date(l.createdAt).getTime() - fromMs) / (bucketDays * DAY)));
    buckets[i]!.count++;
  }
  const bySource = SOURCE_TYPES.map((source) => ({ source, count: leads.filter((l) => l.source === source).length }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);

  // Premier contact
  const statusOf = (l: StatLead) => speedStatus(l, settings, now);
  const contactMinutes = leads.filter((l) => l.firstContactedAt).map((l) => Math.max(0, Math.round((new Date(l.firstContactedAt!).getTime() - new Date(l.createdAt).getTime()) / 60_000)));
  const states = leads.map(statusOf);
  const within = states.filter((s) => s.state === "met").length;
  const measured = states.filter((s) => s.state === "met" || s.state === "late" || s.state === "overdue").length;

  const closed = (l: StatLead) => l.status === "won" || l.status === "lost";
  const won = leads.filter((l) => l.status === "won").length;
  const lost = leads.filter((l) => l.status === "lost").length;

  const byScoreBand = SCORE_BANDS.map((b) => {
    const inBand = leads.filter((l) => l.scoreTotal !== null && l.scoreTotal >= b.min && l.scoreTotal <= b.max);
    const w = inBand.filter((l) => l.status === "won").length;
    const lo = inBand.filter((l) => l.status === "lost").length;
    return { key: b.key, label: b.label, leads: inBand.length, won: w, lost: lo, open: inBand.length - w - lo, winRate: rate(w, w + lo) };
  });

  const salesMembers = input.members.filter((m) => m.role === "commercial");
  const bySales: SalesRow[] = salesMembers
    .map((m) => {
      const mine = leads.filter((l) => l.ownerId === m.userId);
      const handled = mine.filter((l) => l.firstContactedAt);
      const mineStates = mine.map(statusOf);
      const mMeasured = mineStates.filter((s) => s.state === "met" || s.state === "late" || s.state === "overdue").length;
      const mWithin = mineStates.filter((s) => s.state === "met").length;
      const w = mine.filter((l) => l.status === "won").length;
      const lo = mine.filter((l) => l.status === "lost").length;
      return {
        userId: m.userId, name: m.name, active: m.active, assigned: mine.length, handled: handled.length,
        medianMinutes: median(handled.map((l) => Math.max(0, Math.round((new Date(l.firstContactedAt!).getTime() - new Date(l.createdAt).getTime()) / 60_000)))),
        withinPct: rate(mWithin, mMeasured), won: w, lost: lo, winRate: rate(w, w + lo),
      };
    })
    .filter((r) => r.assigned > 0 || r.active)
    .sort((a, b) => b.won - a.won || (b.winRate ?? -1) - (a.winRate ?? -1) || (a.medianMinutes ?? Infinity) - (b.medianMinutes ?? Infinity));

  return {
    days,
    from: new Date(fromMs).toISOString(),
    total: leads.length,
    open: leads.filter((l) => !closed(l)).length,
    won,
    lost,
    winRate: rate(won, won + lost),
    volume: { buckets, bucketDays, bySource },
    firstContact: {
      medianMinutes: median(contactMinutes),
      withinPct: rate(within, measured),
      measured,
      within,
      overdueNow: states.filter((s) => s.state === "overdue").length,
      neverContacted: leads.filter((l) => !l.firstContactedAt && !closed(l)).length,
    },
    byScoreBand,
    bySales,
    pipeline: LEAD_STATUSES.map((status) => ({ status, count: leads.filter((l) => l.status === status).length })),
  };
}
