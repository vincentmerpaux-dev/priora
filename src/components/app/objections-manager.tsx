"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteObjectionAction, saveObjectionAction } from "@/app/actions/settings";
import { PencilSimple, Plus, Trash } from "@/components/icons";
import { Tag } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import type { ObjectionItem } from "@/lib/types";
import { fillPrice } from "@/lib/ai/fallback";

type Draft = { id?: string; objection: string; response: string; category: string };
const EMPTY: Draft = { objection: "", response: "", category: "Prix" };
const SUGGESTED = ["Prix", "Timing", "Concurrence", "Décision", "Confiance", "Autre"];

export function ObjectionsManager({ items, canEdit }: { items: ObjectionItem[]; canEdit: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const groups = new Map<string, ObjectionItem[]>();
  for (const o of items) groups.set(o.category, [...(groups.get(o.category) ?? []), o]);

  function save() {
    if (!draft) return;
    start(async () => {
      const res = await saveObjectionAction(draft);
      if (!res.ok) return setError(res.error);
      setDraft(null);
      setError(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {canEdit && !draft ? (
        <div><Button variant="primary" onClick={() => setDraft({ ...EMPTY })}><Plus />Ajouter une objection</Button></div>
      ) : null}

      {draft ? (
        <Panel className="p-4">
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <Field label="Objection du prospect" htmlFor="obj-text">
              <Input id="obj-text" value={draft.objection} maxLength={400} autoFocus onChange={(e) => setDraft({ ...draft, objection: e.target.value })} />
            </Field>
            <Field label="Réponse recommandée" htmlFor="obj-resp" hint="Ce qui fonctionne vraiment dans vos appels. L'analyse la réutilise.">
              <Textarea id="obj-resp" rows={3} value={draft.response} maxLength={1500} onChange={(e) => setDraft({ ...draft, response: e.target.value })} />
            </Field>
            <Field label="Catégorie" htmlFor="obj-cat">
              <Input id="obj-cat" list="obj-cats" value={draft.category} maxLength={60} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
              <datalist id="obj-cats">{SUGGESTED.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            {error ? <p role="alert" className="text-[13px] text-danger">{error}</p> : null}
            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={pending}>{pending ? "Enregistrement" : "Enregistrer"}</Button>
              <Button type="button" variant="ghost" onClick={() => { setDraft(null); setError(null); }}>Annuler</Button>
            </div>
          </form>
        </Panel>
      ) : null}

      {[...groups.entries()].map(([category, list]) => (
        <section key={category} aria-label={category}>
          <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold">{category}<span className="num text-[12px] font-normal text-muted">{list.length}</span></h2>
          <ul className="divide-y divide-line rounded-[var(--radius)] border border-line bg-surface">
            {list.map((o) => (
              <li key={o.id} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-[14px] font-medium">« {o.objection} »</p>
                  <p className="mt-1 whitespace-pre-line text-[13px] text-muted">{fillPrice(o.response)}</p>
                </div>
                {canEdit ? (
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" aria-label="Modifier" onClick={() => { setDraft({ id: o.id, objection: o.objection, response: o.response, category: o.category }); window.scrollTo({ top: 0, behavior: "smooth" }); }}><PencilSimple /></Button>
                    <Button variant="ghost" size="icon" aria-label="Supprimer" disabled={pending} onClick={() => start(async () => { await deleteObjectionAction(o.id); router.refresh(); })}><Trash /></Button>
                  </div>
                ) : <Tag>Lecture seule</Tag>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
