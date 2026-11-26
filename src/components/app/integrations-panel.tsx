"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { connectHubSpotAction, disconnectHubSpotAction, importHubSpotAction, setDemoIncidentAction, setHubSpotAutoPushAction } from "@/app/actions/integrations";
import { ArrowClockwise, PlugsConnected } from "@/components/icons";
import { Tag } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { formatDateTime } from "@/lib/format";
import type { IntegrationInfo, SyncLogEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

export function HubSpotPanel({ info, logs, demo, unavailableReason }: { info: IntegrationInfo | null; logs: SyncLogEntry[]; demo: boolean; unavailableReason: string | null }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [pending, start] = useTransition();
  const connected = info !== null && info.status !== "disconnected";

  function run(fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, after?: () => void) {
    setFeedback(null);
    start(async () => {
      const r = await fn();
      setFeedback(r.ok ? { ok: true, text: r.message ?? "Fait." } : { ok: false, text: r.error });
      if (r.ok) after?.();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
            <PlugsConnected className="size-4 text-muted" />HubSpot
            {!connected ? <Tag>Non connecté</Tag> : info.status === "error" ? <Tag tone="danger">Erreur : reconnexion nécessaire</Tag> : <Tag tone="accent">Connecté</Tag>}
            {connected && info.simulated ? <Tag tone="warn" title="Aucun appel réel : un faux HubSpot répond">Simulation (démo)</Tag> : null}
          </p>
          <p className="mt-1 max-w-[65ch] text-[13px] text-muted">
            Envoie les leads qualifiés ou gagnés vers HubSpot (contact créé ou mis à jour par email, plus une transaction avec le score et le verdict Priora) et importe les contacts HubSpot récents comme leads de source « CRM ». Offre gratuite HubSpot, jeton d&apos;application privée.
          </p>
        </div>
      </div>

      {demo ? (
        <p role="note" className="rounded-[var(--radius)] border border-warn/30 bg-warn-soft px-3 py-2 text-[12px] text-warn">
          <strong className="font-semibold">Mode démonstration.</strong> La connexion est simulée : aucun jeton n&apos;est demandé, aucun appel ne part vers HubSpot. Un faux HubSpot répond comme l&apos;API réelle, avec des contacts fictifs, et vous pouvez lui faire simuler des incidents.
        </p>
      ) : null}

      {!connected ? (
        <div className="flex flex-col gap-3">
          {unavailableReason ? (
            <p role="alert" className="rounded-[var(--radius)] border border-danger/40 bg-danger-soft px-3 py-2 text-[13px] text-danger">{unavailableReason}</p>
          ) : null}
          {demo ? (
            <div><Button variant="primary" disabled={pending} onClick={() => run(() => connectHubSpotAction(null))}>{pending ? "Connexion" : "Connecter (simulation)"}</Button></div>
          ) : (
            <form className="flex max-w-xl flex-col gap-3" onSubmit={(e) => { e.preventDefault(); run(() => connectHubSpotAction(token), () => setToken("")); }}>
              <Field label="Jeton d'accès de l'application privée" htmlFor="hs-token" hint="Il est vérifié auprès de HubSpot, chiffré côté serveur, puis jamais réaffiché.">
                <Input id="hs-token" type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} placeholder="pat-..." />
              </Field>
              <div><Button type="submit" variant="primary" disabled={pending || token.trim() === "" || unavailableReason !== null}>{pending ? "Vérification" : "Connecter HubSpot"}</Button></div>
            </form>
          )}
          <details className="rounded-[var(--radius)] border border-line">
            <summary className="cursor-pointer px-3 py-2 text-[13px] font-medium">Comment créer le jeton (gratuit)</summary>
            <ol className="list-decimal space-y-1 border-t border-line py-3 pl-7 pr-3 text-[12px] text-muted">
              <li>HubSpot, <em>Paramètres</em>, <em>Intégrations</em>, <em>Applications privées</em>, <em>Créer une application privée</em>.</li>
              <li>Onglet <em>Portées</em> : <code className="num">crm.objects.contacts.read</code>, <code className="num">crm.objects.contacts.write</code>, <code className="num">crm.objects.deals.read</code>, <code className="num">crm.objects.deals.write</code>.</li>
              <li>Pour créer les propriétés « Score Priora » et « Verdict Priora » : ajoutez <code className="num">crm.schemas.contacts.write</code> et <code className="num">crm.schemas.deals.write</code>. Sans elles, le score est placé dans la description de la transaction.</li>
              <li>Créez l&apos;application, copiez le <em>jeton d&apos;accès</em> et collez-le ici. Les transactions utilisent le pipeline par défaut de HubSpot.</li>
            </ol>
          </details>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-3">
            <div><dt className="text-[11px] uppercase tracking-wide text-faint">Jeton</dt><dd className="num">{info.simulated ? "aucun (simulation)" : `••••${info.tokenHint ?? ""}`}</dd></div>
            <div><dt className="text-[11px] uppercase tracking-wide text-faint">Connecté le</dt><dd>{info.connectedAt ? formatDateTime(info.connectedAt) : "n.d."}</dd></div>
            <div><dt className="text-[11px] uppercase tracking-wide text-faint">Dernière synchronisation</dt><dd>{info.lastSyncAt ? formatDateTime(info.lastSyncAt) : "aucune"}</dd></div>
          </dl>

          <label className="flex items-start gap-2 text-[13px]">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--accent)]"
              checked={info.autoPush}
              disabled={pending}
              onChange={(e) => run(() => setHubSpotAutoPushAction(e.target.checked))}
            />
            <span>Envoyer automatiquement vers HubSpot quand un lead passe à <strong className="font-medium">Qualifié</strong> ou <strong className="font-medium">Gagné</strong>.<span className="block text-[12px] text-muted">Le bouton « Envoyer vers HubSpot » reste disponible sur chaque fiche.</span></span>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => importHubSpotAction())}><ArrowClockwise className={cn(pending && "animate-spin")} />{pending ? "Import en cours" : "Importer les contacts récents (30 jours)"}</Button>
            {confirmOff ? (
              <>
                <span className="text-[12px] text-muted">Le jeton enregistré sera supprimé.</span>
                <Button variant="danger" size="sm" disabled={pending} onClick={() => { setConfirmOff(false); run(() => disconnectHubSpotAction()); }}>Confirmer la déconnexion</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmOff(false)}>Annuler</Button>
              </>
            ) : <Button variant="ghost" size="sm" onClick={() => setConfirmOff(true)}>Déconnecter</Button>}
          </div>

          {demo ? (
            <div className="max-w-sm">
              <Field label="Simuler un incident côté HubSpot (démo)" htmlFor="hs-incident" hint="Prochain envoi ou import : 429 (réessai automatique puis succès), 401 (jeton refusé) ou 500 (indisponible). Les échecs apparaissent dans le journal et la cloche.">
                <Select id="hs-incident" defaultValue="none" disabled={pending} onChange={(e) => run(async () => { const r = await setDemoIncidentAction(e.target.value); return r.ok ? { ok: true, message: e.target.value === "none" ? "Incident retiré." : `Incident ${e.target.value} armé.` } : r; })}>
                  <option value="none">Aucun incident</option>
                  <option value="429">429 : trop de requêtes (une fois)</option>
                  <option value="401">401 : jeton refusé</option>
                  <option value="500">500 : HubSpot indisponible</option>
                </Select>
              </Field>
            </div>
          ) : null}
        </div>
      )}

      {feedback ? <p role={feedback.ok ? "status" : "alert"} className={cn("text-[13px]", feedback.ok ? "text-accent" : "text-danger")}>{feedback.text}</p> : null}

      <div>
        <h3 className="text-[13px] font-semibold">Journal de synchronisation</h3>
        {logs.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted">Aucune synchronisation pour le moment.</p>
        ) : (
          <>
            <div className="mt-2 hidden overflow-hidden rounded-[var(--radius)] border border-line md:block">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-2 py-2 font-medium">Sens</th>
                    <th className="px-2 py-2 font-medium">Statut</th>
                    <th className="px-3 py-2 font-medium">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td className="num whitespace-nowrap px-3 py-2 text-muted">{formatDateTime(l.createdAt)}</td>
                      <td className="whitespace-nowrap px-2 py-2">{l.direction === "push" ? "Envoi" : "Import"}</td>
                      <td className="px-2 py-2"><Tag tone={l.status === "success" ? "accent" : "danger"}>{l.status === "success" ? "Réussi" : "Échec"}</Tag></td>
                      <td className="px-3 py-2">{l.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="mt-2 divide-y divide-line rounded-[var(--radius)] border border-line md:hidden">
              {logs.map((l) => (
                <li key={l.id} className="px-3 py-2.5 text-[12px]">
                  <p className="flex flex-wrap items-center gap-2"><Tag tone={l.status === "success" ? "accent" : "danger"}>{l.status === "success" ? "Réussi" : "Échec"}</Tag><span>{l.direction === "push" ? "Envoi" : "Import"}</span><span className="num text-muted">{formatDateTime(l.createdAt)}</span></p>
                  <p className="mt-1">{l.message}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <p className="text-[12px] text-muted">Pipedrive : adaptateur prévu en V2 (l&apos;interface existe, pas encore l&apos;implémentation).</p>
    </div>
  );
}
