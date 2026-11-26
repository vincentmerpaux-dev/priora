"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { bulkReassignAction } from "@/app/actions/assignment";
import { MemberChip } from "@/components/app/member-chip";
import { SpeedBadge, type SpeedTargets, type SpeedLeadInput } from "@/components/app/speed";
import { ScoreNumber, StatusTag, VerdictBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { timeAgo } from "@/lib/format";
import type { LeadStatus, Verdict } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface LeadRow {
  id: string;
  name: string;
  sub: string;
  score: number | null;
  verdict: Verdict | null;
  sourceLabel: string;
  createdAt: string;
  status: LeadStatus;
  ownerName: string | null;
  ownerInactive: boolean;
  speed: SpeedLeadInput;
}

const GRID = "md:grid-cols-[3.25rem_minmax(0,1.6fr)_8.5rem_10.5rem_9rem_5.5rem]";

export function LeadList({
  rows, targets, nowIso, assignees, canAssign,
}: { rows: LeadRow[]; targets: SpeedTargets; nowIso: string; assignees: { id: string; name: string }[]; canAssign: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const now = new Date(nowIso);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  function apply() {
    if (selected.size === 0 || !target) return;
    start(async () => {
      const res = await bulkReassignAction([...selected], target === "none" ? null : target);
      if (!res.ok) return setMsg({ ok: false, text: res.error });
      setMsg({ ok: true, text: `${res.changed} lead${res.changed > 1 ? "s" : ""} réattribué${res.changed > 1 ? "s" : ""}.` });
      setSelected(new Set());
      setTarget("");
      router.refresh();
    });
  }

  return (
    <div data-tour="queue">
      {canAssign && selected.size > 0 ? (
        <div role="region" aria-label="Réattribution en masse" className="sticky top-12 z-20 mb-2 flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-accent-line bg-surface px-3 py-2 lg:top-2">
          <span className="num text-[13px]">{selected.size} sélectionné{selected.size > 1 ? "s" : ""}</span>
          <label htmlFor="bulk-owner" className="sr-only">Attribuer à</label>
          <Select id="bulk-owner" value={target} onChange={(e) => setTarget(e.target.value)} className="h-8 w-52">
            <option value="">Attribuer à...</option>
            {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            <option value="none">Retirer l&apos;attribution</option>
          </Select>
          <Button size="sm" variant="primary" disabled={!target || pending} onClick={apply}>{pending ? "Réattribution" : "Réattribuer"}</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Annuler</Button>
        </div>
      ) : null}
      {msg ? <p role={msg.ok ? "status" : "alert"} className={cn("mb-2 text-[13px]", msg.ok ? "text-accent" : "text-danger")}>{msg.text}</p> : null}

      <div className="overflow-hidden rounded-[var(--radius)] border border-line bg-surface">
        <div className="hidden items-center border-b border-line bg-surface-2 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted md:flex">
          {canAssign ? (
            <input type="checkbox" aria-label="Tout sélectionner" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} className="mr-3 size-4 accent-[var(--accent)]" />
          ) : null}
          <div className={cn("grid flex-1 gap-4", GRID)}>
            <span>Score</span><span>Lead</span><span>Verdict</span><span>Premier contact</span><span>Attribué à</span><span>Statut</span>
          </div>
        </div>
        <ul className="divide-y divide-line">
          {rows.map((l) => (
            <li key={l.id} className="flex items-stretch transition-colors hover:bg-surface-2">
              {canAssign ? (
                <label className="flex w-10 shrink-0 items-center justify-center pl-2 md:w-auto md:pl-4 md:pr-3">
                  <span className="sr-only">Sélectionner {l.name}</span>
                  <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} className="size-4 accent-[var(--accent)]" />
                </label>
              ) : null}
              <Link
                href={`/leads/${l.id}`}
                className={cn("grid min-w-0 flex-1 grid-cols-[3rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 py-3 pr-4 md:gap-4", canAssign ? "pl-1 md:pl-0" : "pl-4", GRID)}
              >
                <ScoreNumber value={l.score} />
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium">{l.name}</p>
                  <p className="truncate text-[12px] text-muted">{l.sub}</p>
                  <p className="truncate text-[11px] text-faint">{l.sourceLabel} · {timeAgo(l.createdAt, now)}</p>
                </div>
                <div className="col-start-2 flex flex-wrap items-center gap-1.5 md:col-start-auto md:contents">
                  <span className="md:block"><VerdictBadge verdict={l.verdict} /></span>
                  <span className="md:block"><SpeedBadge lead={l.speed} targets={targets} nowIso={nowIso} /></span>
                  <span className="min-w-0 md:block"><MemberChip name={l.ownerName} inactive={l.ownerInactive} /></span>
                  <span className="md:block"><StatusTag status={l.status} /></span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
