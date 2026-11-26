"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { submitPublicLead, type PublicFormState } from "./actions";

export function PublicForm({ slug, orgName }: { slug: string; orgName: string }) {
  const [state, action, pending] = useActionState(submitPublicLead.bind(null, slug), { status: "idle" } as PublicFormState);
  const fe = state.fieldErrors ?? {};
  const v = (state.values ?? {}) as Record<string, string>;

  if (state.status === "sent") {
    return (
      <div role="status" className="rise rounded-[var(--radius)] border border-accent-line bg-accent-soft p-5">
        <p className="text-base font-semibold">Message envoyé</p>
        <p className="mt-1 text-[13px] text-muted">Merci. {orgName} reviendra vers vous rapidement.</p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Prénom" htmlFor="firstName" error={fe.firstName}>
          <Input id="firstName" name="firstName" defaultValue={v.firstName} autoComplete="given-name" maxLength={100} />
        </Field>
        <Field label="Nom" htmlFor="lastName" error={fe.lastName}>
          <Input id="lastName" name="lastName" defaultValue={v.lastName} autoComplete="family-name" maxLength={100} />
        </Field>
      </div>
      <Field label="Email professionnel" htmlFor="email" error={fe.email}>
        <Input id="email" name="email" defaultValue={v.email} type="email" autoComplete="email" required maxLength={254} aria-invalid={Boolean(fe.email)} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Entreprise" htmlFor="company" error={fe.company}>
          <Input id="company" name="company" defaultValue={v.company} autoComplete="organization" required maxLength={200} aria-invalid={Boolean(fe.company)} />
        </Field>
        <Field label="Fonction" htmlFor="jobTitle" error={fe.jobTitle}>
          <Input id="jobTitle" name="jobTitle" defaultValue={v.jobTitle} autoComplete="organization-title" maxLength={150} />
        </Field>
      </div>
      <Field label="Téléphone" htmlFor="phone" hint="Facultatif, pour être rappelé plus vite." error={fe.phone}>
        <Input id="phone" name="phone" defaultValue={v.phone} type="tel" autoComplete="tel" maxLength={40} />
      </Field>
      <Field label="Votre besoin" htmlFor="message" hint="Contexte, échéance, budget si vous en avez un." error={fe.message}>
        <Textarea id="message" name="message" defaultValue={v.message} rows={5} maxLength={5000} />
      </Field>

      {/* Champ piège anti-robot : masqué pour les humains. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="company_fax">Ne pas remplir</label>
        <input id="company_fax" name="company_fax" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="flex items-start gap-2.5 text-[12px] leading-relaxed text-muted">
          <input type="checkbox" name="consent" className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" required />
          <span>
            J&apos;accepte que {orgName} utilise ces informations pour me recontacter, conformément à la{" "}
            <a href="/legal/confidentialite" target="_blank" rel="noopener" className="text-fg underline underline-offset-2">politique de confidentialité</a>.
          </span>
        </label>
        {fe.consent ? <p role="alert" className="text-[12px] text-danger">{fe.consent}</p> : null}
      </div>

      {state.status === "error" && state.error ? <p role="alert" className="rounded-[var(--radius)] border border-danger/40 bg-danger-soft px-3 py-2 text-[13px] text-danger">{state.error}</p> : null}

      <Button type="submit" variant="primary" size="lg" disabled={pending} className="w-full sm:w-auto sm:self-start">
        {pending ? "Envoi en cours" : "Envoyer ma demande"}
      </Button>
    </form>
  );
}
