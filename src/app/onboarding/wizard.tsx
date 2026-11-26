"use client";

import { useState, useTransition } from "react";
import { completeOnboarding } from "@/app/actions/onboarding";
import { CriteriaEditor, PersonasEditor, TagInput } from "@/components/app/icp-fields";
import { ArrowLeft, ArrowRight, Plus, Trash } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import type { IcpConfig } from "@/lib/types";
import { slugify } from "@/lib/text";
import { cn } from "@/lib/utils";

interface Props {
  hasOrg: boolean;
  initialName: string;
  initialSlug: string;
  initialIcp: Omit<IcpConfig, "orgId">;
  initialObjections: { objection: string; response: string; category: string }[];
}

const STEPS = ["Entreprise", "Offre", "Cible idéale", "Personas", "Critères", "Objections"] as const;

export function OnboardingWizard({ hasOrg, initialName, initialSlug, initialIcp, initialObjections }: Props) {
  const [step, setStep] = useState(0);
  const [orgName, setOrgName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const [slugTouched, setSlugTouched] = useState(Boolean(initialSlug));
  const [icp, setIcp] = useState(initialIcp);
  const [objections, setObjections] = useState(initialObjections);
  const [error, setError] = useState<{ message: string; step?: number } | null>(null);
  const [pending, start] = useTransition();

  const patch = (p: Partial<typeof icp>) => setIcp((cur) => ({ ...cur, ...p }));

  function validateStep(s: number): string | null {
    if (s === 0) {
      if (orgName.trim().length < 2) return "Indiquez le nom de votre entreprise.";
      if (!hasOrg && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return "L'identifiant doit contenir au moins 3 caractères : minuscules, chiffres et tirets.";
      if (!hasOrg && slug.length < 3) return "L'identifiant doit contenir au moins 3 caractères.";
    }
    if (s === 1 && icp.offer.trim().length < 10) return "Décrivez votre offre en une ou deux phrases (10 caractères minimum).";
    if (s === 2 && icp.sizeMin !== null && icp.sizeMax !== null && icp.sizeMin > icp.sizeMax) return "L'effectif minimum doit être inférieur au maximum.";
    if (s === 3 && icp.personas.some((p) => p.name.trim() === "")) return "Donnez un nom à chaque persona, ou supprimez-le.";
    if (s === 4 && !icp.criteria.some((c) => c.enabled && c.weight > 0)) return "Activez au moins un critère.";
    return null;
  }

  function next() {
    const msg = validateStep(step);
    if (msg) return setError({ message: msg, step });
    setError(null);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  function submit() {
    for (let s = 0; s < STEPS.length; s++) {
      const msg = validateStep(s);
      if (msg) {
        setStep(s);
        return setError({ message: msg, step: s });
      }
    }
    setError(null);
    start(async () => {
      const res = await completeOnboarding({
        orgName, slug: slug || slugify(orgName), icp,
        objections: objections.filter((o) => o.objection.trim() && o.response.trim()),
      });
      if (res && !res.ok) {
        setError({ message: res.error });
        if (res.field) setStep(0);
      }
    });
  }

  const last = step === STEPS.length - 1;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <ol className="mb-8 grid grid-cols-6 gap-1.5" aria-label="Étapes">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined}>
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              className="group w-full text-left disabled:cursor-default"
            >
              <span className={cn("block h-1 rounded-full transition-colors", i <= step ? "bg-accent" : "bg-surface-3")} />
              <span className={cn("num mt-1.5 hidden text-[11px] sm:block", i === step ? "text-fg" : "text-faint")}>{String(i + 1).padStart(2, "0")} {label}</span>
              <span className={cn("num mt-1.5 block text-[11px] sm:hidden", i === step ? "text-fg" : "text-faint")}>{String(i + 1).padStart(2, "0")}</span>
            </button>
          </li>
        ))}
      </ol>

      <div key={step} className="rise flex flex-col gap-5">
        {step === 0 && (
          <>
            <Heading title="Votre entreprise" text="Ces informations identifient votre espace et votre formulaire public." />
            <Field label="Nom de l'entreprise" htmlFor="orgName">
              <Input
                id="orgName" value={orgName} maxLength={120} autoFocus
                onChange={(e) => {
                  setOrgName(e.target.value);
                  if (!slugTouched && !hasOrg) setSlug(slugify(e.target.value));
                }}
              />
            </Field>
            <Field label="Identifiant du formulaire public" htmlFor="slug" hint={hasOrg ? "L'identifiant ne peut plus être modifié." : `Votre formulaire sera disponible sur /f/${slug || "votre-identifiant"}`}>
              <Input
                id="slug" value={slug} maxLength={48} disabled={hasOrg} spellCheck={false}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
              />
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <Heading title="Votre offre" text="L'IA s'appuie sur ces textes pour écrire la fiche d'appel et le script d'ouverture." />
            <Field label="Que vendez-vous ?" htmlFor="offer" hint="Une à trois phrases : produit ou service, problème résolu.">
              <Textarea id="offer" rows={4} value={icp.offer} maxLength={1500} onChange={(e) => patch({ offer: e.target.value })} />
            </Field>
            <Field label="Décrivez votre client idéal" htmlFor="ideal" hint="Facultatif mais utile : taille, contexte, déclencheur d'achat.">
              <Textarea id="ideal" rows={3} value={icp.idealCustomer} maxLength={1500} onChange={(e) => patch({ idealCustomer: e.target.value })} />
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <Heading title="Votre cible idéale" text="Le score d'adéquation compare chaque lead à ces critères. Laissez vide ce qui ne compte pas pour vous." />
            <Field label="Secteurs" hint="Mots-clés d'activité, comparés au secteur officiel (NAF) et au site web. Entrée pour ajouter.">
              <TagInput label="Secteurs" value={icp.sectors} onChange={(sectors) => patch({ sectors })} placeholder="Ex. logistique, industrie, conseil" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Effectif minimum" htmlFor="sizeMin">
                <Input id="sizeMin" type="number" min={0} inputMode="numeric" value={icp.sizeMin ?? ""} onChange={(e) => patch({ sizeMin: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })} />
              </Field>
              <Field label="Effectif maximum" htmlFor="sizeMax">
                <Input id="sizeMax" type="number" min={0} inputMode="numeric" value={icp.sizeMax ?? ""} onChange={(e) => patch({ sizeMax: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })} />
              </Field>
            </div>
            <Field label="Zones géographiques" hint="Région, ville ou numéro de département. « France » couvre tout le pays.">
              <TagInput label="Zones" value={icp.zones} onChange={(zones) => patch({ zones })} placeholder="Ex. Occitanie, 69, Paris" />
            </Field>
            <Field label="Rôles décideurs" hint="Fonctions des personnes qui décident ou prescrivent l'achat.">
              <TagInput label="Rôles décideurs" value={icp.decisionRoles} onChange={(decisionRoles) => patch({ decisionRoles })} placeholder="Ex. Directeur des opérations" />
            </Field>
          </>
        )}

        {step === 3 && (
          <>
            <Heading title="Vos personas" text="Les profils types de vos acheteurs. Chaque lead est rattaché au plus proche, et la fiche d'appel reprend ses enjeux et objections. Facultatif, 2 à 4 suffisent." />
            <PersonasEditor value={icp.personas} onChange={(personas) => patch({ personas })} />
          </>
        )}

        {step === 4 && (
          <>
            <Heading title="Critères de scoring" text="Préremplis à partir des méthodes BANT et MEDDIC. Ajustez les poids selon ce qui compte pour vous." />
            <CriteriaEditor value={icp.criteria} onChange={(criteria) => patch({ criteria })} />
          </>
        )}

        {step === 5 && (
          <>
            <Heading title="Objections connues" text="Ce que vos prospects répondent souvent, et ce qui fonctionne pour y répondre. La fiche d'appel les réutilise en priorité." />
            <ul className="flex flex-col gap-3">
              {objections.map((o, i) => (
                <li key={i} className="flex flex-col gap-2 rounded-[var(--radius)] border border-line p-3">
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Input aria-label="Objection" value={o.objection} placeholder="Objection du prospect" maxLength={400} onChange={(e) => setObjections((l) => l.map((x, j) => (j === i ? { ...x, objection: e.target.value } : x)))} />
                    <Button variant="ghost" size="icon" aria-label="Supprimer l'objection" onClick={() => setObjections((l) => l.filter((_, j) => j !== i))}><Trash /></Button>
                  </div>
                  <Textarea aria-label="Réponse recommandée" rows={2} value={o.response} placeholder="Réponse recommandée" maxLength={1500} onChange={(e) => setObjections((l) => l.map((x, j) => (j === i ? { ...x, response: e.target.value } : x)))} />
                </li>
              ))}
            </ul>
            <div>
              <Button variant="secondary" onClick={() => setObjections((l) => [...l, { objection: "", response: "", category: "Autre" }])}><Plus />Ajouter une objection</Button>
            </div>
          </>
        )}
      </div>

      {error ? <p role="alert" className="mt-5 rounded-[var(--radius)] border border-danger/40 bg-danger-soft px-3 py-2 text-[13px] text-danger">{error.message}</p> : null}

      <div className="mt-8 flex items-center justify-between border-t border-line pt-5">
        <Button variant="ghost" onClick={() => { setError(null); setStep((s) => Math.max(0, s - 1)); }} disabled={step === 0 || pending}><ArrowLeft />Retour</Button>
        {last ? (
          <Button variant="primary" onClick={submit} disabled={pending}>{pending ? "Enregistrement" : "Terminer et ouvrir Priora"}</Button>
        ) : (
          <Button variant="primary" onClick={next}>Continuer<ArrowRight /></Button>
        )}
      </div>
    </div>
  );
}

function Heading({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 max-w-[60ch] text-[13px] text-muted">{text}</p>
    </div>
  );
}
