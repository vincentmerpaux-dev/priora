"use client";

import { useActionState } from "react";
import { createManualLead, type ManualState } from "@/app/actions/leads";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";

export function ManualLeadForm() {
  const [state, action, pending] = useActionState(createManualLead, {} as ManualState);
  const fe = state.fieldErrors ?? {};
  const v = (state.values ?? {}) as Record<string, string>;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Prénom" htmlFor="firstName" error={fe.firstName}><Input id="firstName" name="firstName" defaultValue={v.firstName} maxLength={100} autoFocus /></Field>
        <Field label="Nom" htmlFor="lastName" error={fe.lastName}><Input id="lastName" name="lastName" defaultValue={v.lastName} maxLength={100} /></Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Email" htmlFor="email" error={fe.email}><Input id="email" name="email" defaultValue={v.email} type="email" required maxLength={254} aria-invalid={Boolean(fe.email)} /></Field>
        <Field label="Téléphone" htmlFor="phone" error={fe.phone}><Input id="phone" name="phone" defaultValue={v.phone} type="tel" maxLength={40} /></Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Entreprise" htmlFor="company" error={fe.company} hint="Sert à retrouver le SIREN, l'effectif et le secteur."><Input id="company" name="company" defaultValue={v.company} required maxLength={200} aria-invalid={Boolean(fe.company)} /></Field>
        <Field label="Fonction" htmlFor="jobTitle" error={fe.jobTitle}><Input id="jobTitle" name="jobTitle" defaultValue={v.jobTitle} maxLength={150} /></Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Site web" htmlFor="website" error={fe.website} hint="Facultatif. Sinon déduit de l'email professionnel."><Input id="website" name="website" defaultValue={v.website} maxLength={300} placeholder="exemple.fr" /></Field>
        <Field label="Localisation" htmlFor="location" error={fe.location}><Input id="location" name="location" defaultValue={v.location} maxLength={200} placeholder="Ville ou département" /></Field>
      </div>
      <Field label="Message ou contexte" htmlFor="message" error={fe.message} hint="Plus il est précis (besoin, budget, échéance), meilleur est le score.">
        <Textarea id="message" name="message" defaultValue={v.message} rows={5} maxLength={5000} />
      </Field>
      <Field label="Détail de la source" htmlFor="sourceDetail" hint="Ex. salon, recommandation, demande de démo." error={fe.sourceDetail}>
        <Input id="sourceDetail" name="sourceDetail" defaultValue={v.sourceDetail} maxLength={200} />
      </Field>

      {state.error ? <p role="alert" className="rounded-[var(--radius)] border border-danger/40 bg-danger-soft px-3 py-2 text-[13px] text-danger">{state.error}</p> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>{pending ? "Enrichissement et analyse en cours" : "Créer le lead"}</Button>
        {pending ? <span className="text-[12px] text-muted">Quelques secondes (registre des entreprises, site web, analyse).</span> : null}
      </div>
    </form>
  );
}
