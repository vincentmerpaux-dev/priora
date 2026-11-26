"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { moveLead } from "@/app/actions/leads";
import { OutcomeDialog } from "@/components/app/outcome-dialog";
import { DotsSixVertical } from "@/components/icons";
import { ScoreNumber, STATUS_LABEL, VerdictBadge } from "@/components/ui/badges";
import { Select } from "@/components/ui/field";
import { fullName, timeAgo } from "@/lib/format";
import { LEAD_STATUSES, type LeadStatus, type LeadWithScore } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAX_PER_COLUMN = 40;

export function Kanban({ leads, lockedIds = [], ownerNames = {} }: { leads: LeadWithScore[]; lockedIds?: string[]; ownerNames?: Record<string, string> }) {
  const locked = new Set(lockedIds);
  const [override, setOverride] = useState<Record<string, LeadStatus>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<LeadStatus | null>(null);
  const [ask, setAsk] = useState<{ id: string; target: "won" | "lost" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const statusOf = (l: LeadWithScore) => override[l.id] ?? l.status;
  const byId = new Map(leads.map((l) => [l.id, l]));

  function move(id: string, to: LeadStatus, reason?: string, reasonCode?: string) {
    const lead = byId.get(id);
    if (!lead || statusOf(lead) === to || locked.has(id)) return;
    if (to === "won" || to === "lost") {
      if (reason === undefined) return setAsk({ id, target: to });
    }
    const previous = override[id];
    setOverride((o) => ({ ...o, [id]: to }));
    setError(null);
    start(async () => {
      const res = await moveLead({ leadId: id, status: to, reason, reasonCode });
      if (!res.ok) {
        setError(res.error);
        setOverride((o) => {
          const next = { ...o };
          if (previous) next[id] = previous;
          else delete next[id];
          return next;
        });
      }
    });
  }

  const sorted = [...leads].sort((a, b) => (b.scoreTotal ?? -1) - (a.scoreTotal ?? -1));
  const askedLead = ask ? byId.get(ask.id) : undefined;

  return (
    <>
      {error ? <p role="alert" className="mb-3 rounded-[var(--radius)] border border-danger/40 bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p> : null}
      <div className="scroll-x relative -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0">
        {LEAD_STATUSES.map((col) => {
          const items = sorted.filter((l) => statusOf(l) === col);
          return (
            <section
              key={col}
              aria-label={`Colonne ${STATUS_LABEL[col]}`}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverCol(col); } }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null); }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || dragId;
                setOverCol(null);
                setDragId(null);
                if (id) move(id, col);
              }}
              className={cn(
                "flex min-h-48 w-[82vw] shrink-0 snap-start flex-col rounded-[var(--radius)] border border-line bg-surface p-2 transition-colors sm:w-72 md:w-auto md:min-w-0",
                overCol === col && "drop-active",
              )}
            >
              <header className="flex items-center justify-between px-1.5 pb-2 pt-1">
                <h2 className="text-[13px] font-semibold">{STATUS_LABEL[col]}</h2>
                <span className="num text-[12px] text-muted">{items.length}</span>
              </header>
              <ul className="flex flex-1 flex-col gap-2">
                {items.slice(0, MAX_PER_COLUMN).map((l) => (
                  <li
                    key={l.id}
                    draggable={!locked.has(l.id)}
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", l.id); e.dataTransfer.effectAllowed = "move"; setDragId(l.id); }}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    className={cn("group rounded-[var(--radius)] border border-line-strong bg-surface-2 p-2.5 transition-colors hover:border-faint", dragId === l.id && "dragging")}
                  >
                    <div className="flex items-start gap-2">
                      <DotsSixVertical aria-hidden className="mt-0.5 hidden size-4 shrink-0 cursor-grab text-faint md:block" />
                      <div className="min-w-0 flex-1">
                        <Link href={`/leads/${l.id}`} draggable={false} className="block truncate text-[13px] font-medium hover:underline">{fullName(l)}</Link>
                        <p className="truncate text-[12px] text-muted">{l.company}</p>
                      </div>
                      <ScoreNumber value={l.scoreTotal} size="sm" />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <VerdictBadge verdict={l.verdict} />
                      <span className="truncate text-[11px] text-faint">{ownerNames[l.id] ? `${ownerNames[l.id]} · ` : ""}{timeAgo(l.createdAt)}</span>
                    </div>
                    {/* Alternative tactile et clavier au glisser-déposer */}
                    <div className="mt-2">
                      <label className="sr-only" htmlFor={`mv-${l.id}`}>Déplacer {fullName(l)}</label>
                      <Select id={`mv-${l.id}`} value={statusOf(l)} disabled={locked.has(l.id)} title={locked.has(l.id) ? "Lead d'un autre commercial : lecture seule" : undefined} onChange={(e) => move(l.id, e.target.value as LeadStatus)} className="h-8 text-[12px]">
                        {LEAD_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                      </Select>
                    </div>
                  </li>
                ))}
                {items.length === 0 ? (
                  <li className="flex flex-1 items-center justify-center rounded-[var(--radius)] border border-dashed border-line px-3 py-6 text-center text-[12px] text-faint">
                    Glissez un lead ici
                  </li>
                ) : null}
                {items.length > MAX_PER_COLUMN ? <li className="px-1 text-[12px] text-muted">{items.length - MAX_PER_COLUMN} autres dans la file de leads.</li> : null}
              </ul>
            </section>
          );
        })}
      </div>
      <OutcomeDialog
        target={ask?.target ?? null}
        leadName={askedLead ? fullName(askedLead) : ""}
        onCancel={() => setAsk(null)}
        onConfirm={(reason, code) => {
          if (ask) move(ask.id, ask.target, reason, code);
          setAsk(null);
        }}
      />
    </>
  );
}
