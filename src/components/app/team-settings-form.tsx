"use client";

import { useState, useTransition } from "react";
import { saveOrgSettingsAction } from "@/app/actions/settings";
import { TagInput } from "@/components/app/icp-fields";
import { Plus, Trash } from "@/components/icons";
import { SOURCE_LABEL } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { SOURCE_TYPES, type AssignmentMode, type AssignmentRule, type OrgSettings } from "@/lib/types";
import { cn } from "@/lib/utils";

const MODES: { value: AssignmentMode; label: string; text: string }[] = [
  { value: "round_robin", label: "Tour de rôle", text: "Chaque nouveau lead va au commercial actif suivant, à tour de rôle." },
  { value: "segments", label: "Par segment", text: "Règles simples (source, produit ou secteur, score minimum). Sans règle correspondante : tour de rôle." },
  { value: "off", label: "Manuelle", text: "Les leads arrivent non attribués : un manager les répartit depuis la file." },
];

export function TeamSettingsForm({
  initial, sales, canEdit,
}: { initial: Omit<OrgSettings, "orgId">; sales: { id: string; name: string; active: boolean }[]; canEdit: boolean }) {
  const [s, setS] = useState(initial);
  const [fb, setFb] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const touch = (next: typeof s) => { setS(next); setFb(null); };
  const rules = s.assignment.rules;
  const setRules = (r: AssignmentRule[]) => touch({ ...s, assignment: { ...s.assignment, rules: r } });
  const patchRule = (id: string, p: Partial<AssignmentRule>) => setRules(rules.map((r) => (r.id === id ? { ...r, ...p } : r)));

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveOrgSettingsAction(s);
          setFb(r.ok ? { ok: true, message: "Réglages d'équipe enregistrés. Ils s'appliquent aux prochains leads." } : { ok: false, message: r.error });
        });
      }}
    >
      <fieldset disabled={!canEdit} className="flex flex-col gap-3">
        <legend className="mb-2 text-[13px] font-semibold">Attribution automatique des nouveaux leads</legend>
        <p className="text-[12px] text-muted">S&apos;applique à toutes les sources : formulaire, webhook, import CSV et saisie manuelle. Les commerciaux désactivés sont toujours exclus.</p>
        <div role="radiogroup" aria-label="Mode d'attribution" className="grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => {
            const on = s.assignment.mode === m.value;
            return (
              <label key={m.value} className={cn("flex cursor-pointer flex-col gap-1 rounded-[var(--radius)] border p-3 transition-colors", on ? "border-accent-line bg-accent-soft" : "border-line hover:bg-surface-2")}>
                <span className="flex items-center gap-2 text-[13px] font-medium">
                  <input type="radio" name="assignment-mode" checked={on} onChange={() => touch({ ...s, assignment: { ...s.assignment, mode: m.value } })} className="accent-[var(--accent)]" />
                  {m.label}
                </span>
                <span className="text-[12px] text-muted">{m.text}</span>
              </label>
            );
          })}
        </div>

        {s.assignment.mode === "segments" ? (
          <div className="flex flex-col gap-3">
            <p className="text-[12px] text-muted">La première règle qui correspond l&apos;emporte. Tous les critères d&apos;une règle doivent être vrais ; un critère laissé vide est ignoré.</p>
            <ul className="flex flex-col gap-3">
              {rules.map((r, i) => (
                <li key={r.id} className="flex flex-col gap-3 rounded-[var(--radius)] border border-line p-3">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_7rem]">
                    <Field label={`Règle ${i + 1}`} htmlFor={`rule-label-${r.id}`}><Input id={`rule-label-${r.id}`} value={r.label} maxLength={80} placeholder="Ex. Gros comptes vers le senior" onChange={(e) => patchRule(r.id, { label: e.target.value })} /></Field>
                    <Field label="Attribuer à" htmlFor={`rule-to-${r.id}`}>
                      <Select id={`rule-to-${r.id}`} value={r.assigneeId} onChange={(e) => patchRule(r.id, { assigneeId: e.target.value })}>
                        <option value="">Choisir...</option>
                        {sales.map((m) => <option key={m.id} value={m.id}>{m.name}{m.active ? "" : " (désactivé)"}</option>)}
                      </Select>
                    </Field>
                    <Field label="Score minimum" htmlFor={`rule-min-${r.id}`}>
                      <Input id={`rule-min-${r.id}`} type="number" min={0} max={100} inputMode="numeric" value={r.minScore ?? ""} onChange={(e) => patchRule(r.id, { minScore: e.target.value === "" ? null : Math.min(100, Math.max(0, Number(e.target.value))) })} />
                    </Field>
                  </div>
                  <Field label="Sources">
                    <div className="flex flex-wrap gap-1.5">
                      {SOURCE_TYPES.map((t) => {
                        const on = r.sources.includes(t);
                        return (
                          <label key={t} className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border px-2 py-1 text-[12px]", on ? "border-accent-line bg-accent-soft" : "border-line-strong text-muted")}>
                            <input type="checkbox" checked={on} className="size-3.5 accent-[var(--accent)]" onChange={() => patchRule(r.id, { sources: on ? r.sources.filter((x) => x !== t) : [...r.sources, t] })} />
                            {SOURCE_LABEL[t]}
                          </label>
                        );
                      })}
                    </div>
                  </Field>
                  <Field label="Produit ou secteur (mots-clés)" hint="Cherchés dans le message, le détail de source et le secteur. Un seul suffit.">
                    <TagInput label={`Mots-clés de la règle ${i + 1}`} value={r.keywords} max={20} onChange={(keywords) => patchRule(r.id, { keywords })} placeholder="Ex. décennale, logistique" />
                  </Field>
                  <div><Button type="button" variant="ghost" size="sm" onClick={() => setRules(rules.filter((x) => x.id !== r.id))}><Trash />Supprimer la règle</Button></div>
                </li>
              ))}
            </ul>
            {rules.length < 20 ? (
              <div><Button type="button" variant="secondary" onClick={() => setRules([...rules, { id: crypto.randomUUID(), label: "", sources: [], keywords: [], minScore: null, assigneeId: "" }])}><Plus />Ajouter une règle</Button></div>
            ) : null}
          </div>
        ) : null}
      </fieldset>

      <fieldset disabled={!canEdit} className="flex flex-col gap-3">
        <legend className="mb-2 text-[13px] font-semibold">Délais cibles de premier contact (speed-to-lead)</legend>
        <p className="text-[12px] text-muted">Premier contact = premier appel ou email enregistré, ou passage au statut Contacté. Le délai court depuis l&apos;arrivée du lead. Alerte visuelle dans l&apos;application, sans email ni notification.</p>
        <div className="grid grid-cols-2 gap-4 sm:max-w-md">
          <Field label="Appeler maintenant (minutes)" htmlFor="st-now">
            <Input id="st-now" type="number" min={1} max={1440} inputMode="numeric" value={s.speedTargets.callNowMinutes} onChange={(e) => touch({ ...s, speedTargets: { ...s.speedTargets, callNowMinutes: Number(e.target.value) } })} />
          </Field>
          <Field label="Nourrir (minutes)" htmlFor="st-nurture">
            <Input id="st-nurture" type="number" min={1} max={10080} inputMode="numeric" value={s.speedTargets.nurtureMinutes} onChange={(e) => touch({ ...s, speedTargets: { ...s.speedTargets, nurtureMinutes: Number(e.target.value) } })} />
          </Field>
        </div>
      </fieldset>

      <fieldset disabled={!canEdit} className="flex flex-col gap-3">
        <legend className="mb-2 text-[13px] font-semibold">Visibilité des commerciaux</legend>
        <label className="flex cursor-pointer items-start gap-2.5 text-[13px]">
          <input type="checkbox" checked={s.commercialsSeeAll} onChange={(e) => touch({ ...s, commercialsSeeAll: e.target.checked })} className="mt-0.5 size-4 accent-[var(--accent)]" />
          <span>
            Les commerciaux peuvent consulter la file commune
            <span className="block text-[12px] text-muted">Par défaut, un commercial voit « Mes leads ». Activé, il peut aussi consulter les leads des autres, en lecture seule. Désactivé, il ne voit que les siens.</span>
          </span>
        </label>
      </fieldset>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={pending}>{pending ? "Enregistrement" : "Enregistrer l'équipe et l'attribution"}</Button>
          {fb ? <p role={fb.ok ? "status" : "alert"} className={`text-[13px] ${fb.ok ? "text-accent" : "text-danger"}`}>{fb.message}</p> : null}
        </div>
      ) : <p className="text-[13px] text-muted">Seuls les administrateurs peuvent modifier ces réglages.</p>}
    </form>
  );
}
