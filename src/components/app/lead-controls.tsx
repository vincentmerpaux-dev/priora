"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reassignLeadAction } from "@/app/actions/assignment";
import { pushLeadToHubSpotAction } from "@/app/actions/integrations";
import { addActivityAction, deleteLeadAction, moveLead, reanalyzeLead, reenrichLead } from "@/app/actions/leads";
import { OutcomeDialog } from "@/components/app/outcome-dialog";
import { ArrowClockwise, Check, Copy, PaperPlaneTilt, Sparkle, Trash } from "@/components/icons";
import { STATUS_LABEL } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StatusControl({ leadId, leadName, status }: { leadId: string; leadName: string; status: LeadStatus }) {
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<"won" | "lost" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function apply(next: LeadStatus, reason?: string, reasonCode?: string) {
    setError(null);
    start(async () => {
      const res = await moveLead({ leadId, status: next, reason, reasonCode });
      if (!res.ok) setError(res.error);
      setTarget(null);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="status-select" className="sr-only">Statut du lead</label>
      <Select
        id="status-select"
        value={status}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as LeadStatus;
          if (next === "won" || next === "lost") setTarget(next);
          else apply(next);
        }}
        className="w-40"
      >
        {LEAD_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
      </Select>
      {error ? <p role="alert" className="text-[12px] text-danger">{error}</p> : null}
      <OutcomeDialog target={target} leadName={leadName} onCancel={() => setTarget(null)} onConfirm={(reason, code) => target && apply(target, reason, code)} />
    </div>
  );
}

export function ReanalyzeButton({ leadId, aiAvailable }: { leadId: string; aiAvailable: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        title={aiAvailable ? "Relance l'analyse IA (un appel au modèle)" : "Relance l'analyse par règles (clé Anthropic absente)"}
        onClick={() => start(async () => { const r = await reanalyzeLead(leadId); setError(r.ok ? null : r.error); })}
      >
        <Sparkle />{pending ? "Analyse en cours" : "Relancer l'analyse"}
      </Button>
      {error ? <p role="alert" className="text-[12px] text-danger">{error}</p> : null}
    </div>
  );
}

/** "Envoyer vers HubSpot" : crée ou met à jour le contact et la transaction. Le résultat (ou l'erreur) s'affiche ici et dans le journal. */
export function HubSpotPushButton({ leadId, simulated, sentAt }: { leadId: string; simulated: boolean; sentAt: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        title={simulated ? "Démonstration : envoi vers un faux HubSpot, aucun appel réel" : "Crée ou met à jour le contact et la transaction dans HubSpot"}
        onClick={() => start(async () => {
          const r = await pushLeadToHubSpotAction(leadId);
          setFeedback(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
          router.refresh();
        })}
      >
        <PaperPlaneTilt />{pending ? "Envoi en cours" : sentAt ? "Renvoyer vers HubSpot" : "Envoyer vers HubSpot"}{simulated ? " (simulation)" : ""}
      </Button>
      {feedback ? <p role={feedback.ok ? "status" : "alert"} className={cn("max-w-xs text-[12px] sm:text-right", feedback.ok ? "text-accent" : "text-danger")}>{feedback.text}</p> : null}
    </div>
  );
}

export function ReenrichButton({ leadId }: { leadId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { await reenrichLead(leadId); })} title="Interroge à nouveau le registre des entreprises et le site web, puis recalcule le score">
      <ArrowClockwise className={cn(pending && "animate-spin")} />{pending ? "Enrichissement" : "Réenrichir et recalculer"}
    </Button>
  );
}

export function CopyButton({ text, label = "Copier" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? <Check /> : <Copy />}{done ? "Copié" : label}
    </Button>
  );
}

export function DeleteLeadButton({ leadId }: { leadId: string }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  if (!confirm) return <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}><Trash />Supprimer</Button>;
  return (
    <span className="inline-flex items-center gap-1">
      <Button variant="danger" size="sm" disabled={pending} onClick={() => start(async () => { await deleteLeadAction(leadId); })}>Confirmer la suppression</Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>Annuler</Button>
    </span>
  );
}

export function ActivityForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [type, setType] = useState<"call" | "email" | "note">("call");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await addActivityAction({ leadId, type, content });
          if (!res.ok) return setError(res.error);
          setContent("");
          setError(null);
          router.refresh();
        });
      }}
    >
      <div className="flex gap-2">
        <label htmlFor="activity-type" className="sr-only">Type d&apos;activité</label>
        <Select id="activity-type" value={type} onChange={(e) => setType(e.target.value as typeof type)} className="w-28">
          <option value="call">Appel</option>
          <option value="email">Email</option>
          <option value="note">Note</option>
        </Select>
      </div>
      <label htmlFor="activity-content" className="sr-only">Contenu</label>
      <Textarea id="activity-content" rows={2} value={content} maxLength={4000} placeholder="Compte rendu d'appel, email envoyé, note..." onChange={(e) => setContent(e.target.value)} />
      {error ? <p role="alert" className="text-[12px] text-danger">{error}</p> : null}
      <div><Button type="submit" size="sm" variant="secondary" disabled={pending || content.trim() === ""}>Ajouter</Button></div>
    </form>
  );
}

/** Réattribution manuelle depuis la fiche (managers et administrateurs ; contrôle refait côté serveur). */
export function AssignControl({ leadId, ownerId, assignees }: { leadId: string; ownerId: string | null; assignees: { id: string; name: string }[] }) {
  const router = useRouter();
  const [value, setValue] = useState(ownerId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor="assign-select" className="text-[12px] text-muted">Réattribuer</label>
        <Select
          id="assign-select"
          value={value}
          disabled={pending}
          className="h-8 w-48"
          onChange={(e) => {
            const next = e.target.value;
            setValue(next);
            setError(null);
            start(async () => {
              const r = await reassignLeadAction(leadId, next === "" ? null : next);
              if (!r.ok) { setError(r.error); setValue(ownerId ?? ""); return; }
              router.refresh();
            });
          }}
        >
          <option value="">Non attribué</option>
          {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </div>
      {error ? <p role="alert" className="text-[12px] text-danger">{error}</p> : null}
    </div>
  );
}
