"use client";

import { useState, useTransition } from "react";
import { regenerateWebhookKey, saveIcpAction, saveOrgNameAction } from "@/app/actions/settings";
import { CriteriaEditor, PersonasEditor, TagInput } from "@/components/app/icp-fields";
import { CopyButton } from "@/components/app/lead-controls";
import { Key } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import type { IcpConfig } from "@/lib/types";

function Feedback({ state }: { state: { ok: boolean; message: string } | null }) {
  if (!state) return null;
  return <p role={state.ok ? "status" : "alert"} className={`text-[13px] ${state.ok ? "text-accent" : "text-danger"}`}>{state.message}</p>;
}

export function OrgNameForm({ name, canEdit }: { name: string; canEdit: boolean }) {
  const [value, setValue] = useState(name);
  const [fb, setFb] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveOrgNameAction(value);
          setFb(r.ok ? { ok: true, message: "Nom enregistré." } : { ok: false, message: r.error });
        });
      }}
    >
      <Field label="Nom de l'entreprise" htmlFor="org-name" className="sm:w-80">
        <Input id="org-name" value={value} maxLength={120} disabled={!canEdit} onChange={(e) => setValue(e.target.value)} />
      </Field>
      {canEdit ? <Button type="submit" variant="secondary" disabled={pending}>Enregistrer</Button> : null}
      <Feedback state={fb} />
    </form>
  );
}

export function IcpSettings({ initial, canEdit }: { initial: Omit<IcpConfig, "orgId">; canEdit: boolean }) {
  const [icp, setIcp] = useState(initial);
  const [fb, setFb] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const patch = (p: Partial<typeof icp>) => { setIcp((c) => ({ ...c, ...p })); setFb(null); };

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveIcpAction(icp);
          setFb(r.ok ? { ok: true, message: "Réglages enregistrés. Les nouveaux scores utiliseront ces critères." } : { ok: false, message: r.error });
        });
      }}
    >
      <fieldset disabled={!canEdit} className="flex flex-col gap-5">
        <legend className="mb-3 text-[13px] font-semibold">Offre et cible idéale</legend>
        <Field label="Votre offre" htmlFor="s-offer"><Textarea id="s-offer" rows={3} value={icp.offer} maxLength={1500} onChange={(e) => patch({ offer: e.target.value })} /></Field>
        <Field label="Client idéal" htmlFor="s-ideal"><Textarea id="s-ideal" rows={2} value={icp.idealCustomer} maxLength={1500} onChange={(e) => patch({ idealCustomer: e.target.value })} /></Field>
        <Field label="Secteurs"><TagInput label="Secteurs" value={icp.sectors} onChange={(sectors) => patch({ sectors })} placeholder="Ajouter un secteur" /></Field>
        <div className="grid grid-cols-2 gap-4 sm:max-w-md">
          <Field label="Effectif minimum" htmlFor="s-min"><Input id="s-min" type="number" min={0} value={icp.sizeMin ?? ""} onChange={(e) => patch({ sizeMin: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })} /></Field>
          <Field label="Effectif maximum" htmlFor="s-max"><Input id="s-max" type="number" min={0} value={icp.sizeMax ?? ""} onChange={(e) => patch({ sizeMax: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })} /></Field>
        </div>
        <Field label="Zones géographiques"><TagInput label="Zones" value={icp.zones} onChange={(zones) => patch({ zones })} placeholder="Région, ville ou département" /></Field>
        <Field label="Rôles décideurs"><TagInput label="Rôles décideurs" value={icp.decisionRoles} onChange={(decisionRoles) => patch({ decisionRoles })} placeholder="Ajouter une fonction" /></Field>
      </fieldset>

      <fieldset disabled={!canEdit} className="flex flex-col gap-3">
        <legend className="mb-3 text-[13px] font-semibold">Personas</legend>
        <PersonasEditor value={icp.personas} onChange={(personas) => patch({ personas })} />
      </fieldset>

      <fieldset disabled={!canEdit} className="flex flex-col gap-3">
        <legend className="mb-3 text-[13px] font-semibold">Critères de scoring</legend>
        <CriteriaEditor value={icp.criteria} onChange={(criteria) => patch({ criteria })} />
      </fieldset>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={pending}>{pending ? "Enregistrement" : "Enregistrer les réglages"}</Button>
          <Feedback state={fb} />
        </div>
      ) : <p className="text-[13px] text-muted">Seuls les administrateurs peuvent modifier ces réglages.</p>}
    </form>
  );
}

export function WebhookPanel({ prefix, createdAt, endpoint, canEdit }: { prefix: string | null; createdAt: string | null; endpoint: string; canEdit: boolean }) {
  const [fresh, setFresh] = useState<{ key: string; prefix: string } | null>(null);
  const [currentPrefix, setCurrentPrefix] = useState(prefix);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const sample = `curl -X POST ${endpoint} \\\n  -H "Authorization: Bearer ${fresh?.key ?? "VOTRE_CLE"}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"email":"prenom.nom@entreprise.fr","company":"Entreprise","first_name":"Prénom","last_name":"Nom","job_title":"Directeur","message":"Besoin décrit par le prospect"}'`;

  function generate() {
    start(async () => {
      const r = await regenerateWebhookKey();
      if (!r.ok) return setError(r.error);
      setFresh({ key: r.key, prefix: r.prefix });
      setCurrentPrefix(r.prefix);
      setConfirm(false);
      setError(null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[12px] text-muted">Adresse du webhook (méthode POST)</p>
        <div className="mt-1 flex items-center gap-2 rounded-[var(--radius)] border border-line bg-surface-2 px-3 py-2">
          <code className="num min-w-0 flex-1 truncate text-[12px]">{endpoint}</code>
          <CopyButton text={endpoint} />
        </div>
      </div>

      <div>
        <p className="text-[12px] text-muted">Clé d&apos;API</p>
        {fresh ? (
          <div className="mt-1 rounded-[var(--radius)] border border-warn/40 bg-warn-soft p-3">
            <p className="text-[12px] font-medium text-warn">Copiez cette clé maintenant : elle ne sera plus jamais affichée.</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="num min-w-0 flex-1 break-all text-[12px]">{fresh.key}</code>
              <CopyButton text={fresh.key} />
            </div>
          </div>
        ) : (
          <p className="num mt-1 flex items-center gap-2 text-[13px]">
            <Key className="size-4 text-muted" />
            {currentPrefix ? <>{currentPrefix}<span className="text-faint">{"••••••••••••"}</span></> : <span className="text-muted">Aucune clé générée</span>}
            {createdAt && !fresh ? <span className="font-sans text-[12px] text-muted">créée le {new Date(createdAt).toLocaleDateString("fr-FR")}</span> : null}
          </p>
        )}
        {canEdit ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {currentPrefix && !confirm ? (
              <Button variant="secondary" size="sm" onClick={() => setConfirm(true)}>Régénérer la clé</Button>
            ) : confirm ? (
              <>
                <span className="text-[12px] text-muted">L&apos;ancienne clé cessera de fonctionner immédiatement.</span>
                <Button variant="danger" size="sm" disabled={pending} onClick={generate}>Confirmer la régénération</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>Annuler</Button>
              </>
            ) : (
              <Button variant="primary" size="sm" disabled={pending} onClick={generate}>Générer une clé</Button>
            )}
          </div>
        ) : <p className="mt-2 text-[12px] text-muted">Réservé aux administrateurs.</p>}
        {error ? <p role="alert" className="mt-2 text-[13px] text-danger">{error}</p> : null}
      </div>

      <div>
        <div className="flex items-center justify-between"><p className="text-[12px] text-muted">Exemple</p><CopyButton text={sample} /></div>
        <pre className="num scroll-x mt-1 overflow-x-auto rounded-[var(--radius)] border border-line bg-surface-2 p-3 text-[11px] leading-relaxed">{sample}</pre>
        <p className="mt-2 text-[12px] text-muted">Champs reconnus : email (obligatoire), company (obligatoire), first_name, last_name ou name, phone, job_title, website, location, message, source_detail.</p>
      </div>
    </div>
  );
}
