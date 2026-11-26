"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { LOSS_REASONS, WIN_REASONS } from "@/lib/types";

/**
 * Demande le motif quand un lead passe en Gagné ou Perdu.
 * Perdu : un motif (liste ou texte) est obligatoire. Gagné : facultatif. Les motifs alimentent la page Calibration.
 */
export function OutcomeDialog({
  target, leadName, onConfirm, onCancel,
}: { target: "won" | "lost" | null; leadName: string; onConfirm: (reason: string, reasonCode: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (target && !d.open) {
      setReason("");
      setCode("");
      setError(null);
      d.showModal();
    }
    if (!target && d.open) d.close();
  }, [target]);

  const lost = target === "lost";
  const options = lost ? LOSS_REASONS : WIN_REASONS;
  return (
    <dialog
      ref={ref}
      onCancel={(e) => { e.preventDefault(); onCancel(); }}
      onClose={() => undefined}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-[var(--radius)] border border-line-strong bg-surface p-5 text-fg shadow-[var(--shadow)]"
      aria-labelledby="outcome-title"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (lost && reason.trim().length < 2 && !code) return setError("Indiquez un motif de perte.");
          onConfirm(reason.trim(), code);
        }}
        className="flex flex-col gap-4"
      >
        <div>
          <h2 id="outcome-title" className="text-base font-semibold">{lost ? "Marquer comme perdu" : "Marquer comme gagné"}</h2>
          <p className="mt-1 text-[13px] text-muted">{leadName}</p>
        </div>
        <Field label={lost ? "Motif de perte" : "Motif de gain (facultatif)"} htmlFor="outcome-code" error={error}>
          <Select id="outcome-code" value={code} onChange={(e) => { setCode(e.target.value); setError(null); }} autoFocus>
            <option value="">{lost ? "Choisir un motif" : "Aucun motif précis"}</option>
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </Select>
        </Field>
        <Field label="Précision (facultatif)" htmlFor="outcome-reason" hint={lost ? "Ex. budget inférieur à l'offre minimale, projet reporté." : "Ce qui a fait la différence."}>
          <Input id="outcome-reason" value={reason} maxLength={500} onChange={(e) => { setReason(e.target.value); setError(null); }} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>Annuler</Button>
          <Button type="submit" variant={lost ? "danger" : "primary"}>{lost ? "Confirmer la perte" : "Confirmer"}</Button>
        </div>
      </form>
    </dialog>
  );
}
