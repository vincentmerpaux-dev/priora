"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { markNotificationsReadAction } from "@/app/actions/notifications";
import { Bell, Check, Clock, EnvelopeSimple, Lightning, Warning } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/format";
import type { NotificationKind } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface BellItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  leadId: string | null;
  readAt: string | null;
  createdAt: string;
}

const ICON: Record<NotificationKind, typeof Bell> = {
  lead_assigned: Lightning, lead_overdue: Clock, overdue_digest: Clock, sync_failed: Warning, lead_message: EnvelopeSimple,
};
const TONE: Record<NotificationKind, string> = {
  lead_assigned: "text-accent", lead_overdue: "text-danger", overdue_digest: "text-warn", sync_failed: "text-danger", lead_message: "text-accent",
};

function hrefFor(n: BellItem): string {
  if (n.leadId) return `/leads/${n.leadId}`;
  return n.kind === "sync_failed" ? "/settings#integrations" : "/leads?late=1";
}

/** Cloche de notifications : compteur de non lues, liste, marquage comme lu. Les données viennent du serveur (layout). */
export function NotificationBell({ items, unread, panelId }: { items: BellItem[]; unread: number; panelId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); button.current?.focus(); }
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [open]);

  function mark(ids: string[] | "all", then?: () => void) {
    start(async () => {
      const r = await markNotificationsReadAction(ids);
      if (!r.ok) { setError(r.error); return; }
      setError(null);
      router.refresh();
      then?.();
    });
  }

  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={unread > 0 ? `Notifications, ${unread} non lue${unread > 1 ? "s" : ""}` : "Notifications"}
        className="relative inline-flex size-9 items-center justify-center rounded-[var(--radius)] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <Bell className="size-[18px]" />
        {unread > 0 ? (
          <span className="num absolute right-0.5 top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">{unread > 9 ? "9+" : unread}</span>
        ) : null}
      </button>

      {open ? (
        <div
          ref={panel}
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-x-2 top-14 z-50 flex max-h-[min(34rem,calc(100dvh-5rem))] flex-col overflow-hidden rounded-[var(--radius)] border border-line-strong bg-surface text-fg shadow-[var(--shadow)] lg:inset-x-auto lg:left-[14rem] lg:top-3 lg:w-[24rem]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Notifications</h2>
            <Button variant="ghost" size="sm" disabled={pending || unread === 0} onClick={() => mark("all")}><Check />Tout marquer lu</Button>
          </div>
          {error ? <p role="alert" className="px-4 py-2 text-[12px] text-danger">{error}</p> : null}
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-muted">Aucune notification pour le moment. Vous serez prévenu des leads attribués, des retards et des échecs de synchronisation.</p>
          ) : (
            <ul className="scroll-x divide-y divide-line overflow-y-auto">
              {items.map((n) => {
                const Icon = ICON[n.kind];
                const body = (
                  <>
                    <Icon className={cn("mt-0.5 size-4 shrink-0", TONE[n.kind])} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-[13px] leading-snug", n.readAt ? "text-muted" : "font-medium text-fg")}>{n.title}</span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-muted">{n.body}</span>
                      <span className="mt-1 block text-[11px] text-faint">{timeAgo(n.createdAt)}</span>
                    </span>
                    {n.readAt ? null : <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" aria-label="Non lue" />}
                  </>
                );
                const cls = "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2";
                return (
                  <li key={n.id}>
                    <Link href={hrefFor(n)} className={cls} onClick={() => { setOpen(false); if (!n.readAt) mark([n.id]); }}>{body}</Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
