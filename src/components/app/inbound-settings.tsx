"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createLeadFromEmailAction, previewEmailAction, regenerateInboundKey, type EmailPreview } from "@/app/actions/inbound";
import { CopyButton } from "@/components/app/lead-controls";
import { Key } from "@/components/icons";
import { Tag } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";

/** Email fictif pour le simulateur (domaine .example : aucune adresse réelle). */
const SAMPLE_EMAIL = `From: Sophie Martin <sophie.martin@atelier-valdor.example>
To: contact@votre-entreprise.example
Subject: Demande de démonstration GMAO
Date: Tue, 25 Nov 2026 09:12:00 +0100

Bonjour,

Nous gérons la maintenance de 3 sites de production sur Excel et cherchons un outil de GMAO.
Le budget est validé (environ 30 k€) et nous voulons démarrer ce mois-ci.
Pouvez-vous me rappeler cette semaine pour une démonstration ?

Cordialement,

Sophie Martin
Directrice des opérations
Atelier Valdor SAS
Tél : 06 00 00 00 21

Le 24 novembre 2026 à 17:40, Support <support@votre-entreprise.example> a écrit :
> Merci pour votre intérêt, voici notre brochure.

Ce message et ses pièces jointes sont confidentiels. Si vous avez reçu ce message par erreur, merci de le supprimer.`;

const CF_WORKER = `// Cloudflare Email Worker : redirige chaque email reçu vers Priora.
// npm i postal-mime ; variable PRIORA_ENDPOINT = l'adresse complète ci-dessus (clé comprise).
import PostalMime from "postal-mime";

export default {
  async email(message, env) {
    const mail = await PostalMime.parse(message.raw);
    const headers = {};
    for (const h of mail.headers) headers[h.key] = h.value;
    const res = await fetch(env.PRIORA_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        from: { name: mail.from?.name, address: mail.from?.address },
        to: message.to, subject: mail.subject, text: mail.text, html: mail.html,
        headers, messageId: mail.messageId,
      }),
    });
    if (res.status >= 500) throw new Error("Priora indisponible"); // Cloudflare réessaiera
  },
};`;

export function InboundEmailPanel({ prefix, createdAt, endpointBase, canEdit }: { prefix: string | null; createdAt: string | null; endpointBase: string; canEdit: boolean }) {
  const [fresh, setFresh] = useState<{ key: string; prefix: string } | null>(null);
  const [currentPrefix, setCurrentPrefix] = useState(prefix);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const endpoint = `${endpointBase}/${fresh?.key ?? "VOTRE_CLE"}`;

  function generate() {
    start(async () => {
      const r = await regenerateInboundKey();
      if (!r.ok) return setError(r.error);
      setFresh({ key: r.key, prefix: r.prefix });
      setCurrentPrefix(r.prefix);
      setConfirm(false);
      setError(null);
    });
  }

  const sampleJson = `curl -X POST ${endpoint} \\\n  -H "Content-Type: application/json" \\\n  -d '{"from":{"name":"Sophie Martin","address":"sophie@entreprise.example"},"subject":"Demande de démo","text":"Bonjour, nous cherchons un outil. Rappelez-moi."}'`;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] text-muted">
        Chaque email reçu sur l&apos;adresse de votre choix devient un lead (source « Email »), enrichi, scoré, attribué et analysé comme les autres. Les réponses automatiques, newsletters et messages d&apos;erreur de remise sont ignorés. Un expéditeur qui réécrit dans les 24 h reçoit une activité « Email reçu » sur son lead existant, sans nouveau lead.
      </p>

      <div>
        <p className="text-[12px] text-muted">Adresse à renseigner chez le fournisseur (méthode POST)</p>
        <div className="mt-1 flex items-center gap-2 rounded-[var(--radius)] border border-line bg-surface-2 px-3 py-2">
          <code className="num min-w-0 flex-1 break-all text-[12px]">{endpoint}</code>
          <CopyButton text={endpoint} />
        </div>
        <p className="mt-1 text-[12px] text-muted">La clé fait partie de l&apos;adresse : les fournisseurs d&apos;email ne savent pas envoyer d&apos;en-tête personnalisé. Gardez cette adresse secrète. Seule l&apos;empreinte de la clé est stockée ; en-têtes <code className="num">Authorization: Bearer</code> et <code className="num">x-api-key</code> acceptés aussi.</p>
      </div>

      <div>
        <p className="text-[12px] text-muted">Clé d&apos;email entrant</p>
        {fresh ? (
          <div className="mt-1 rounded-[var(--radius)] border border-warn/40 bg-warn-soft p-3">
            <p className="text-[12px] font-medium text-warn">Copiez l&apos;adresse ci-dessus maintenant : la clé ne sera plus jamais affichée.</p>
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
                <span className="text-[12px] text-muted">L&apos;ancienne adresse cessera de fonctionner immédiatement.</span>
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
        <h3 className="text-[13px] font-semibold">Instructions par fournisseur</h3>
        <p className="mt-1 text-[12px] text-muted">Le format est détecté automatiquement. Pour un budget de 0 €, la voie la plus sûre est Cloudflare (Email Routing et Email Workers gratuits avec un domaine géré par Cloudflare). Les offres gratuites des autres fournisseurs changent souvent : vérifiez-les avant de vous engager.</p>
        <div className="mt-2 flex flex-col gap-2">
          <details className="rounded-[var(--radius)] border border-line">
            <summary className="cursor-pointer px-3 py-2 text-[13px] font-medium">Cloudflare Email Worker <Tag tone="accent" className="ml-1">gratuit, recommandé</Tag></summary>
            <div className="flex flex-col gap-2 border-t border-line px-3 py-3 text-[12px] text-muted">
              <ol className="list-decimal space-y-1 pl-4">
                <li>Cloudflare, votre domaine, <em>Email</em> puis <em>Email Routing</em> : activez-le (les enregistrements MX sont ajoutés pour vous).</li>
                <li>Créez un Worker avec le code ci-dessous et la variable <code className="num">PRIORA_ENDPOINT</code> (l&apos;adresse complète affichée plus haut).</li>
                <li><em>Routing rules</em> : créez une adresse (par exemple <code className="num">contact@votre-domaine</code>) avec l&apos;action « Send to a Worker ».</li>
              </ol>
              <div className="flex items-center justify-between"><span>Code du Worker</span><CopyButton text={CF_WORKER} /></div>
              <pre className="num scroll-x overflow-x-auto rounded-[var(--radius)] border border-line bg-surface-2 p-3 text-[11px] leading-relaxed text-fg">{CF_WORKER}</pre>
            </div>
          </details>
          <details className="rounded-[var(--radius)] border border-line">
            <summary className="cursor-pointer px-3 py-2 text-[13px] font-medium">Postmark (Inbound)</summary>
            <ol className="list-decimal space-y-1 border-t border-line py-3 pl-7 pr-3 text-[12px] text-muted">
              <li>Serveur, flux <em>Default Inbound Stream</em>, <em>Settings</em>.</li>
              <li>Renseignez l&apos;adresse ci-dessus dans <em>Webhook</em>. Format JSON détecté automatiquement.</li>
              <li>Faites pointer l&apos;adresse de réception : domaine avec un MX vers <code className="num">inbound.postmarkapp.com</code>, ou l&apos;adresse de redirection fournie par Postmark. L&apos;inbound n&apos;est pas inclus dans toutes les formules : vérifiez la vôtre.</li>
            </ol>
          </details>
          <details className="rounded-[var(--radius)] border border-line">
            <summary className="cursor-pointer px-3 py-2 text-[13px] font-medium">Mailgun (Routes)</summary>
            <ol className="list-decimal space-y-1 border-t border-line py-3 pl-7 pr-3 text-[12px] text-muted">
              <li><em>Receiving</em>, <em>Create route</em>, expression : <code className="num">match_recipient(&quot;contact@votre-domaine&quot;)</code>.</li>
              <li>Action : <em>Forward</em> vers l&apos;adresse ci-dessus. Mailgun envoie un formulaire (multipart) : il est lu directement, pièces jointes ignorées.</li>
              <li>Enregistrements MX de votre domaine vers Mailgun (<code className="num">mxa.mailgun.org</code>, <code className="num">mxb.mailgun.org</code>). Vérifiez que votre formule autorise les routes.</li>
            </ol>
          </details>
          <details className="rounded-[var(--radius)] border border-line">
            <summary className="cursor-pointer px-3 py-2 text-[13px] font-medium">SendGrid (Inbound Parse)</summary>
            <ol className="list-decimal space-y-1 border-t border-line py-3 pl-7 pr-3 text-[12px] text-muted">
              <li><em>Settings</em>, <em>Inbound Parse</em>, <em>Add Host &amp; URL</em> : indiquez votre sous-domaine et l&apos;adresse ci-dessus.</li>
              <li>Laissez « POST the raw, full MIME message » décoché (format formulaire détecté automatiquement).</li>
              <li>MX du sous-domaine vers <code className="num">mx.sendgrid.net</code>. SendGrid a supprimé son offre gratuite en 2025 : prévoyez un essai ou une formule payante.</li>
            </ol>
          </details>
          <details className="rounded-[var(--radius)] border border-line">
            <summary className="cursor-pointer px-3 py-2 text-[13px] font-medium">Format générique (Zapier, n8n, script)</summary>
            <div className="flex flex-col gap-2 border-t border-line px-3 py-3 text-[12px] text-muted">
              <p>JSON : <code className="num">from</code> (texte ou objet name et address), <code className="num">subject</code>, <code className="num">text</code> (ou <code className="num">html</code>), <code className="num">headers</code> et <code className="num">messageId</code> facultatifs.</p>
              <div className="flex items-center justify-between"><span>Exemple</span><CopyButton text={sampleJson} /></div>
              <pre className="num scroll-x overflow-x-auto rounded-[var(--radius)] border border-line bg-surface-2 p-3 text-[11px] leading-relaxed text-fg">{sampleJson}</pre>
            </div>
          </details>
        </div>
      </div>

      {canEdit ? <EmailSimulator /> : null}
    </div>
  );
}

/** Simulateur "Coller un email" : montre le lead extrait avant création, puis permet de le créer vraiment. */
function EmailSimulator() {
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [result, setResult] = useState<{ outcome: string; leadId?: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function analyse() {
    setError(null);
    setResult(null);
    start(async () => {
      const r = await previewEmailAction(raw);
      if (!r.ok) { setPreview(null); return setError(r.error); }
      setPreview(r.preview);
    });
  }
  function create() {
    setError(null);
    start(async () => {
      const r = await createLeadFromEmailAction(raw);
      if (!r.ok) return setError(r.error);
      setResult({ outcome: r.outcome, leadId: r.leadId, message: r.message });
      setPreview(null);
    });
  }

  const creatable = preview?.kind === "new" || preview?.kind === "existing";
  return (
    <div className="rounded-[var(--radius)] border border-line-strong p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold">Simulateur « Coller un email »</h3>
        <Button variant="ghost" size="sm" onClick={() => { setRaw(SAMPLE_EMAIL); setPreview(null); setResult(null); setError(null); }}>Insérer un exemple fictif</Button>
      </div>
      <p className="mt-1 text-[12px] text-muted">Collez un email complet (lignes From, Subject, puis le corps). Vous voyez le lead extrait avant toute création ; la création suit exactement le même chemin qu&apos;un vrai email entrant.</p>
      <label htmlFor="sim-raw" className="sr-only">Email à analyser</label>
      <Textarea id="sim-raw" rows={9} value={raw} maxLength={60000} onChange={(e) => { setRaw(e.target.value); setPreview(null); setResult(null); }} className="num mt-2 text-[12px]" placeholder={"From: Prénom Nom <adresse@entreprise.fr>\nSubject: Objet\n\nCorps du message..."} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" disabled={pending || raw.trim() === ""} onClick={analyse}>{pending && !creatable ? "Analyse" : "Analyser l'email"}</Button>
        {creatable ? <Button variant="primary" size="sm" disabled={pending} onClick={create}>{preview?.kind === "existing" ? "Ajouter au lead existant" : "Créer le lead"}</Button> : null}
      </div>
      {error ? <p role="alert" className="mt-2 text-[13px] text-danger">{error}</p> : null}

      {preview ? (
        <div className="mt-3 rounded-[var(--radius)] border border-line bg-surface-2 p-3" aria-live="polite">
          {preview.kind === "skipped" ? (
            <p className="text-[13px]"><Tag tone="warn">Ignoré</Tag> <span className="ml-1">{preview.label}. Aucun lead ne serait créé.</span></p>
          ) : preview.kind === "invalid" ? (
            <p className="text-[13px]"><Tag tone="danger">Inexploitable</Tag> <span className="ml-1">{preview.error}</span></p>
          ) : (
            <>
              <p className="flex flex-wrap items-center gap-1.5 text-[13px]">
                {preview.kind === "existing" ? <Tag tone="warn">Expéditeur déjà connu (24 h)</Tag> : <Tag tone="accent">Nouveau lead</Tag>}
                <Tag>Source : Email</Tag>
                <Tag tone={preview.lead.proDomain ? "accent" : "neutral"}>{preview.lead.proDomain ? `Domaine pro (${preview.lead.domain})` : "Messagerie grand public"}</Tag>
              </p>
              {preview.kind === "existing" && preview.existing ? (
                <p className="mt-2 text-[12px] text-muted">Le message serait ajouté comme activité « Email reçu » sur <Link href={`/leads/${preview.existing.id}`} className="text-fg underline underline-offset-2">{preview.existing.name} ({preview.existing.company})</Link>, sans nouveau lead.</p>
              ) : null}
              <dl className="mt-3 grid gap-x-4 gap-y-2 text-[13px] sm:grid-cols-2">
                {[
                  ["Nom", `${preview.lead.firstName} ${preview.lead.lastName}`.trim() || "non détecté"],
                  ["Email", preview.lead.email],
                  ["Téléphone", preview.lead.phone ?? "non détecté"],
                  ["Entreprise", preview.lead.company],
                  ["Fonction", preview.lead.jobTitle ?? "non détectée"],
                  ["Score estimé", `${preview.estimate.score}/100 : ${preview.estimate.verdict} (avant enrichissement du registre)`],
                ].map(([k, v]) => (
                  <div key={k} className="min-w-0"><dt className="text-[11px] uppercase tracking-wide text-faint">{k}</dt><dd className="break-words">{v}</dd></div>
                ))}
              </dl>
              <p className="mt-3 text-[11px] uppercase tracking-wide text-faint">Message retenu (citations, signature et mentions légales retirées)</p>
              <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-[var(--radius)] border border-line bg-surface p-2 text-[12px]">{preview.lead.message || "(vide)"}</p>
            </>
          )}
        </div>
      ) : null}

      {result ? (
        <p className="mt-3 text-[13px]" aria-live="polite">
          <Tag tone={result.outcome === "created" || result.outcome === "duplicate" ? "accent" : "warn"}>{result.outcome === "created" ? "Créé" : result.outcome === "duplicate" ? "Ajouté" : "Aucun lead"}</Tag>{" "}
          <span>{result.message}</span>{" "}
          {result.leadId ? <Link href={`/leads/${result.leadId}`} className="underline underline-offset-2">Ouvrir la fiche</Link> : null}
        </p>
      ) : null}
    </div>
  );
}
