"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { applySuggestionAction, restoreVersionAction } from "@/app/actions/calibration";
import { ArrowCounterClockwise, Check } from "@/components/icons";
import { Button } from "@/components/ui/button";

/** Appliquer la suggestion : confirmation en deux temps, résultat annoncé. Le serveur recalcule les poids (rien n'est envoyé d'autre que la période). */
export function ApplySuggestion({ days, summary }: { days: number; summary: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function apply() {
    setError(null);
    start(async () => {
      const r = await applySuggestionAction(days);
      if (!r.ok) { setError(r.error); setConfirm(false); return; }
      setDone(`Version ${r.version} enregistrée : ${r.changed} poids modifié${r.changed > 1 ? "s" : ""}.`);
      setConfirm(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      {confirm ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-muted">{summary}</span>
          <Button variant="primary" size="sm" disabled={pending} onClick={apply}><Check />{pending ? "Application" : "Confirmer l'application"}</Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirm(false)}>Annuler</Button>
        </div>
      ) : (
        <div><Button variant="primary" onClick={() => { setDone(null); setConfirm(true); }}>Appliquer ces poids</Button></div>
      )}
      {done ? <p className="text-[13px] text-accent">{done}</p> : null}
      {error ? <p role="alert" className="text-[13px] text-danger">{error}</p> : null}
    </div>
  );
}

export function RestoreVersion({ versionId, version }: { versionId: string; version: number }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function restore() {
    setError(null);
    start(async () => {
      const r = await restoreVersionAction(versionId);
      if (!r.ok) setError(r.error);
      setConfirm(false);
      router.refresh();
    });
  }

  if (!confirm) {
    return (
      <div className="flex flex-col items-start gap-1">
        <Button variant="secondary" size="sm" onClick={() => setConfirm(true)}><ArrowCounterClockwise />Revenir à cette version</Button>
        {error ? <p role="alert" className="text-[12px] text-danger">{error}</p> : null}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[12px] text-muted">Restaurer la version {version} ?</span>
      <Button variant="danger" size="sm" disabled={pending} onClick={restore}>{pending ? "Restauration" : "Confirmer"}</Button>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirm(false)}>Annuler</Button>
    </div>
  );
}
