"use client";

import { useId, useState } from "react";
import { Plus, X } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import type { Criterion, CriterionCategory, Persona } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TagInput({
  value, onChange, placeholder, label, max = 30,
}: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; label: string; max?: number }) {
  const [draft, setDraft] = useState("");
  const id = useId();

  function commit(raw: string) {
    const items = raw.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    if (items.length === 0) return;
    const next = [...value];
    for (const i of items) if (!next.some((v) => v.toLowerCase() === i.toLowerCase()) && next.length < max) next.push(i.slice(0, 80));
    onChange(next);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          id={id}
          aria-label={label}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit(draft);
            } else if (e.key === "Backspace" && draft === "" && value.length > 0) onChange(value.slice(0, -1));
          }}
          onBlur={() => commit(draft)}
        />
        <button type="button" onClick={() => commit(draft)} aria-label={`Ajouter à ${label}`} className="inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--radius)] border border-line-strong bg-surface text-muted hover:bg-surface-2 hover:text-fg">
          <Plus className="size-4" />
        </button>
      </div>
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <li key={v} className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-line-strong bg-surface-2 py-0.5 pl-2 pr-1 text-[12px]">
              {v}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Retirer ${v}`} className="rounded-[2px] p-0.5 text-muted hover:bg-surface-3 hover:text-fg">
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Personas de la cible idéale : nom, rôle, enjeux, objections typiques.
 * L'analyse rattache chaque lead au persona le plus proche (règles ou IA) et l'affiche sur la fiche.
 */
export function PersonasEditor({ value, onChange, max = 10 }: { value: Persona[]; onChange: (v: Persona[]) => void; max?: number }) {
  const patch = (i: number, p: Partial<Persona>) => onChange(value.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <div className="flex flex-col gap-3">
      {value.length === 0 ? <p className="rounded-[var(--radius)] border border-dashed border-line-strong px-3 py-3 text-[12px] text-muted">Aucun persona. Décrivez 2 à 4 profils types : la fiche d&apos;appel indiquera le plus proche de chaque lead.</p> : null}
      <ul className="flex flex-col gap-3">
        {value.map((p, i) => (
          <li key={i} className="flex flex-col gap-3 rounded-[var(--radius)] border border-line p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nom du persona" htmlFor={`persona-name-${i}`}><Input id={`persona-name-${i}`} value={p.name} maxLength={100} placeholder="Ex. Dirigeant seul" onChange={(e) => patch(i, { name: e.target.value })} /></Field>
              <Field label="Rôle ou fonction" htmlFor={`persona-role-${i}`}><Input id={`persona-role-${i}`} value={p.role} maxLength={100} placeholder="Ex. Responsable maintenance" onChange={(e) => patch(i, { role: e.target.value })} /></Field>
            </div>
            <Field label="Enjeux" htmlFor={`persona-challenges-${i}`}><Textarea id={`persona-challenges-${i}`} rows={2} value={p.challenges} maxLength={600} onChange={(e) => patch(i, { challenges: e.target.value })} /></Field>
            <Field label="Objections typiques" hint="Entrée pour ajouter. Elles sont fournies à l'analyse et affichées sur la fiche.">
              <TagInput label={`Objections du persona ${i + 1}`} value={p.objections} max={8} onChange={(objections) => patch(i, { objections })} placeholder="Ex. C'est trop cher pour notre taille" />
            </Field>
            <div><Button type="button" variant="ghost" size="sm" onClick={() => onChange(value.filter((_, j) => j !== i))}>Supprimer ce persona</Button></div>
          </li>
        ))}
      </ul>
      {value.length < max ? <div><Button type="button" variant="secondary" onClick={() => onChange([...value, { name: "", role: "", challenges: "", objections: [] }])}><Plus />Ajouter un persona</Button></div> : null}
    </div>
  );
}

const CATEGORY_META: Record<CriterionCategory, { title: string; hint: string }> = {
  fit: { title: "Adéquation à la cible", hint: "Le lead ressemble-t-il à votre client idéal ?" },
  intent: { title: "Intention", hint: "Le lead veut-il vraiment acheter ?" },
  timing: { title: "Timing", hint: "Est-ce le bon moment pour appeler ?" },
  risk: { title: "Risques spécifiques", hint: "Points d'attention qui font baisser le score (ratio plein = aucun risque)." },
};

export function CriteriaEditor({ value, onChange }: { value: Criterion[]; onChange: (v: Criterion[]) => void }) {
  const active = value.filter((c) => c.enabled && c.weight > 0);
  const total = active.reduce((s, c) => s + c.weight, 0);
  const share = (c: Criterion) => (c.enabled && total > 0 ? (c.weight / total) * 100 : 0);

  function patch(key: Criterion["key"], p: Partial<Criterion>) {
    onChange(value.map((c) => (c.key === key ? { ...c, ...p } : c)));
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="rounded-[var(--radius)] border border-line bg-surface-2 px-3 py-2 text-[12px] text-muted">
        Les poids sont relatifs : le score final est toujours ramené sur 100. Doubler un poids double l&apos;importance du critère, sans jamais dépasser 100.
      </p>
      {(["fit", "intent", "timing", "risk"] as CriterionCategory[]).filter((cat) => value.some((c) => c.category === cat)).map((cat) => {
        const items = value.filter((c) => c.category === cat);
        const catShare = items.reduce((s, c) => s + share(c), 0);
        return (
          <section key={cat} aria-labelledby={`cat-${cat}`}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <div>
                <h3 id={`cat-${cat}`} className="text-[13px] font-semibold">{CATEGORY_META[cat].title}</h3>
                <p className="text-[12px] text-muted">{CATEGORY_META[cat].hint}</p>
              </div>
              <span className="num text-[13px] text-muted">{Math.round(catShare)} pts</span>
            </div>
            <ul className="divide-y divide-line rounded-[var(--radius)] border border-line">
              {items.map((c) => {
                const inputId = `w-${c.key}`;
                return (
                  <li key={c.key} className={cn("grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 px-3 py-3 sm:grid-cols-[auto_1fr_11rem_3.5rem]", !c.enabled && "opacity-55")}>
                    <input
                      type="checkbox"
                      checked={c.enabled}
                      onChange={(e) => patch(c.key, { enabled: e.target.checked })}
                      aria-label={`Activer le critère ${c.label}`}
                      className="size-4 accent-[var(--accent)]"
                    />
                    <label htmlFor={inputId} className="min-w-0">
                      <span className="block text-[13px] font-medium">{c.label}</span>
                      <span className="block text-[12px] text-muted">{c.description}</span>
                    </label>
                    <input
                      id={inputId}
                      type="range"
                      min={0}
                      max={30}
                      step={1}
                      value={c.weight}
                      disabled={!c.enabled}
                      onChange={(e) => patch(c.key, { weight: Number(e.target.value) })}
                      className="col-span-2 w-full accent-[var(--accent)] sm:col-span-1"
                      aria-valuetext={`Poids ${c.weight}`}
                    />
                    <span className="num col-span-2 text-right text-[13px] sm:col-span-1" title="Points maximum sur 100">
                      {c.enabled ? `${share(c).toFixed(1).replace(/\.0$/, "")}` : "off"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
