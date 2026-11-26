import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityForm, AssignControl, CopyButton, DeleteLeadButton, HubSpotPushButton, ReanalyzeButton, ReenrichButton, StatusControl } from "@/components/app/lead-controls";
import { MemberChip } from "@/components/app/member-chip";
import { SpeedBadge } from "@/components/app/speed";
import { Buildings, EnvelopeSimple, Globe, Phone, Robot, WarningCircle } from "@/components/icons";
import { ScoreBar, ScoreNumber, SOURCE_LABEL, Tag } from "@/components/ui/badges";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { AI_UNAVAILABLE_NOTICE, aiConfigured } from "@/lib/ai/analyze";
import { formatDate, formatDateTime, fullName, timeAgo } from "@/lib/format";
import { verdictLabel } from "@/lib/scoring/engine";
import { requireOrg } from "@/lib/session";
import { can, canReadLead, canWriteLead } from "@/lib/team/permissions";
import { formatMinutes } from "@/lib/team/speed";
import type { Analysis, CriterionCategory, Verdict } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Fiche lead" };

const RISK_LABEL: Record<Analysis["risks"][number]["type"], string> = {
  budget: "Budget", decision_maker: "Décideur absent", competitor: "Concurrent", timing: "Mauvais timing",
};
const LEVEL: Record<"low" | "medium" | "high", { label: string; tone: "accent" | "warn" | "danger" }> = {
  low: { label: "Faible", tone: "accent" }, medium: { label: "Moyen", tone: "warn" }, high: { label: "Élevé", tone: "danger" },
};
const CATEGORY_TITLE: Record<CriterionCategory, string> = { fit: "Adéquation", intent: "Intention", timing: "Timing", risk: "Risques" };
const ACTIVITY_LABEL = { call: "Appel", email: "Email", note: "Note", assignment: "Attribution", inbound: "Email reçu" } as const;

function verdictStyle(v: Verdict) {
  return {
    call_now: "border-accent-line bg-accent-soft",
    nurture: "border-warn/40 bg-warn-soft",
    disqualify: "border-danger/40 bg-danger-soft",
  }[v];
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { repo, session } = await requireOrg();
  const detail = /^[0-9a-f-]{36}$/i.test(id) ? await repo.getLeadDetail(session.orgId, id) : null;
  if (!detail) notFound();
  const [settings, members, icp, hubspot, hubspotLink] = await Promise.all([
    repo.getOrgSettings(session.orgId), repo.listMembers(session.orgId), repo.getIcp(session.orgId),
    repo.getIntegration(session.orgId, "hubspot"), repo.getCrmLink(session.orgId, id, "hubspot"),
  ]);
  // Droits côté serveur : un lead hors de votre périmètre répond comme un lead introuvable.
  if (!canReadLead(session.role, session.userId, detail.lead, settings)) notFound();
  const writable = canWriteLead(session.role, session.userId, detail.lead);
  const owner = members.find((m) => m.userId === detail.lead.ownerId);
  const personas = icp.personas;
  const { lead, score, analysis, activities, outcome } = detail;
  const a = analysis?.content;
  const name = fullName(lead);
  const company = lead.enrichment?.company;
  const web = lead.enrichment?.website;
  const now = new Date();
  const verdictNow = analysis?.content.verdict.decision ?? null;
  const targetMin = verdictNow === "call_now" ? settings.speedTargets.callNowMinutes : verdictNow === "nurture" ? settings.speedTargets.nurtureMinutes : null;
  const targetLabel = targetMin === null ? "Aucun (verdict Disqualifier ou non analysé)" : formatMinutes(targetMin);
  const shownCategories = (["fit", "intent", "timing", "risk"] as CriterionCategory[]).filter((c) => (score?.breakdown[c]?.max ?? 0) > 0);

  return (
    <>
      <Link href="/leads" className="mb-3 inline-block text-[12px] text-muted hover:text-fg">Retour à la file</Link>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{name}</h1>
          <p className="mt-0.5 text-[13px] text-muted">{[lead.jobTitle, lead.company].filter(Boolean).join(" chez ")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Tag>{SOURCE_LABEL[lead.source]}{lead.sourceDetail ? ` : ${lead.sourceDetail}` : ""}</Tag>
            <Tag>Reçu {timeAgo(lead.createdAt, now)}</Tag>
            {lead.isDemo ? <Tag tone="warn">Donnée de démonstration</Tag> : null}
            {hubspotLink ? <Tag tone="accent" title="Contact et transaction liés dans HubSpot">HubSpot : envoyé {timeAgo(hubspotLink.updatedAt, now)}{hubspot?.simulated ? " (simulation)" : ""}</Tag> : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="flex items-center gap-2 text-[12px] text-muted">Attribué à <MemberChip name={owner?.name ?? (lead.ownerId ? "Membre inconnu" : null)} inactive={owner ? !owner.active : false} className="text-fg" /></span>
            {can(session.role, "leads.assign") ? <AssignControl leadId={lead.id} ownerId={lead.ownerId} assignees={members.filter((m) => m.role === "commercial" && m.active).map((m) => ({ id: m.userId, name: m.name }))} /> : null}
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {writable ? <StatusControl leadId={lead.id} leadName={name} status={lead.status} /> : null}
          <div className="flex flex-wrap gap-1">
            {writable ? <ReenrichButton leadId={lead.id} /> : null}
            {writable && hubspot && hubspot.status !== "disconnected" ? <HubSpotPushButton leadId={lead.id} simulated={hubspot.simulated} sentAt={hubspotLink?.updatedAt ?? null} /> : null}
            {can(session.role, "leads.delete") ? <DeleteLeadButton leadId={lead.id} /> : null}
          </div>
        </div>
      </header>

      {!writable ? (
        <p role="note" className="mb-5 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-3 py-2 text-[13px] text-muted">
          Lecture seule : ce lead est {lead.ownerId ? `attribué à ${owner?.name ?? "un autre membre"}` : "non attribué"}. Seul son commercial ou un manager peut le modifier.
        </p>
      ) : null}

      {outcome ? (
        <p className={cn("mb-5 rounded-[var(--radius)] border px-3 py-2 text-[13px]", outcome.result === "won" ? "border-accent-line bg-accent-soft" : "border-danger/40 bg-danger-soft")}>
          <strong>{outcome.result === "won" ? "Gagné" : "Perdu"}</strong>{[outcome.reasonCode, outcome.reason].filter(Boolean).length ? ` : ${[outcome.reasonCode, outcome.reason].filter(Boolean).join(", ")}` : ""}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* Colonne principale : la fiche d'appel */}
        <div className="flex min-w-0 flex-col gap-5">
          {a ? (
            <>
              <section className={cn("rise rounded-[var(--radius)] border p-4", verdictStyle(a.verdict.decision))} aria-label="Verdict">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Verdict</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{verdictLabel(a.verdict.decision)}</p>
                <p className="mt-1 max-w-[65ch] text-[14px]">{a.verdict.reason}</p>
              </section>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
                <span className="inline-flex items-center gap-1.5">
                  {analysis.origin === "ai" ? <Robot className="size-4 text-accent" /> : <WarningCircle className="size-4 text-warn" />}
                  {analysis.origin === "ai"
                    ? `Analyse IA (${analysis.model}), version ${analysis.version}, ${timeAgo(analysis.createdAt, now)}`
                    : `${AI_UNAVAILABLE_NOTICE} (version ${analysis.version})`}
                </span>
                {writable ? <ReanalyzeButton leadId={lead.id} aiAvailable={aiConfigured()} /> : null}
              </div>

              <Panel>
                <PanelHeader title="Résumé et besoin probable" />
                <div className="flex flex-col gap-3 p-4 text-[14px]">
                  <p>{a.summary}</p>
                  <p className="text-muted"><span className="font-medium text-fg">Besoin probable : </span>{a.probableNeed}</p>
                </div>
              </Panel>

              {a.persona ? (
                <Panel>
                  <PanelHeader title="Persona le plus proche" />
                  <PersonaBlock persona={a.persona} detail={personas.find((x) => x.name === a.persona?.name)} />
                </Panel>
              ) : null}

              <Panel>
                <PanelHeader title="Script d'ouverture (30 secondes)" action={<CopyButton text={a.openingScript} />} />
                <p className="p-4 text-[14px] leading-relaxed">{a.openingScript}</p>
              </Panel>

              <Panel>
                <PanelHeader title="Objections probables" />
                <ul className="divide-y divide-line">
                  {a.objections.map((o, i) => (
                    <li key={i} className="p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[14px] font-medium">« {o.objection} »</p>
                        {o.fromLibrary ? <Tag tone="accent">Votre bibliothèque</Tag> : null}
                      </div>
                      <p className="mt-1.5 whitespace-pre-line text-[13px] text-muted">{o.response}</p>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel>
                <PanelHeader title="Risques" />
                <ul className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0">
                  {a.risks.map((r, i) => (
                    <li key={i} className={cn("p-4", i % 2 === 1 && "sm:border-l sm:border-line", i > 1 && "sm:border-t sm:border-line")}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-medium">{RISK_LABEL[r.type]}</p>
                        <Tag tone={LEVEL[r.level].tone}>{LEVEL[r.level].label}</Tag>
                      </div>
                      <p className="mt-1.5 text-[12px] text-muted">{r.detail}</p>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel>
                <PanelHeader title="Questions de découverte" />
                <ol className="flex flex-col gap-2.5 p-4 text-[14px]">
                  {a.discoveryQuestions.map((q, i) => (
                    <li key={i} className="grid grid-cols-[1.5rem_1fr] gap-1"><span className="num text-muted">{i + 1}.</span><span>{q}</span></li>
                  ))}
                </ol>
              </Panel>
            </>
          ) : (
            <Panel className="p-5">
              <p className="text-sm font-medium">Aucune analyse pour ce lead</p>
              <p className="mt-1 text-[13px] text-muted">Lancez l&apos;analyse pour obtenir le verdict, les objections et le script d&apos;appel.</p>
              <div className="mt-3"><ReanalyzeButton leadId={lead.id} aiAvailable={aiConfigured()} /></div>
            </Panel>
          )}

          <Panel>
            <PanelHeader title="Message du lead" />
            <p className="whitespace-pre-wrap p-4 text-[14px] text-muted">{lead.message || "Aucun message."}</p>
          </Panel>
        </div>

        {/* Colonne latérale : score, enrichissement, contact, activités */}
        <aside className="flex min-w-0 flex-col gap-5">
          <Panel>
            <PanelHeader title="Délai de premier contact" />
            <div className="flex flex-col gap-2 p-4 text-[13px]">
              <div className="flex flex-wrap items-center gap-2">
                <SpeedBadge lead={{ createdAt: lead.createdAt, firstContactedAt: lead.firstContactedAt, status: lead.status, verdict: verdictNow }} targets={settings.speedTargets} nowIso={now.toISOString()} />
              </div>
              <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-[12px]">
                <dt className="text-muted">Cible</dt>
                <dd className="num">{targetLabel}</dd>
                <dt className="text-muted">Lead reçu</dt>
                <dd className="num">{formatDateTime(lead.createdAt)}</dd>
                <dt className="text-muted">Premier contact</dt>
                <dd className="num">{lead.firstContactedAt ? formatDateTime(lead.firstContactedAt) : "Pas encore"}</dd>
              </dl>
              <p className="text-[11px] text-faint">Premier contact : premier appel ou email enregistré, ou passage au statut Contacté. Alerte visuelle uniquement (pas de notification par email ou push).</p>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Score détaillé" />
            {score ? (
              <div className="p-4">
                <div className="flex items-end gap-2">
                  <ScoreNumber value={score.total} size="xl" />
                  <span className="num pb-1 text-sm text-muted">/ 100</span>
                </div>
                <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: `repeat(${shownCategories.length}, minmax(0, 1fr))` }}>
                  {shownCategories.map((c) => (
                    <div key={c}>
                      <p className="text-[11px] text-muted">{CATEGORY_TITLE[c]}</p>
                      <p className="num text-[13px]">{Math.round(score.breakdown[c]?.points ?? 0)}<span className="text-faint"> / {Math.round(score.breakdown[c]?.max ?? 0)}</span></p>
                      <div className="mt-1"><ScoreBar points={score.breakdown[c]?.points ?? 0} max={score.breakdown[c]?.max ?? 0} /></div>
                    </div>
                  ))}
                </div>
                <ul className="mt-5 flex flex-col gap-4 border-t border-line pt-4">
                  {score.details.map((d) => (
                    <li key={d.key}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-medium">{d.label}</span>
                        <span className="num text-[12px]">{Math.round(d.points)}<span className="text-faint"> / {Math.round(d.max)}</span></span>
                      </div>
                      <div className="my-1.5"><ScoreBar points={d.points} max={d.max} /></div>
                      <p className="text-[12px] text-muted">{d.reason}</p>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 border-t border-line pt-3 text-[11px] text-faint">Calculé le {formatDateTime(score.createdAt)}. La fraîcheur est évaluée à cette date.</p>
              </div>
            ) : (
              <p className="p-4 text-[13px] text-muted">Score non calculé.</p>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Enrichissement" />
            <div className="flex flex-col gap-3 p-4 text-[13px]">
              {company ? (
                <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-2">
                  <dt className="text-muted">Raison sociale</dt><dd>{company.legalName}</dd>
                  <dt className="text-muted">SIREN</dt><dd className="num">{company.siren}</dd>
                  <dt className="text-muted">Secteur (NAF)</dt><dd>{company.sectorLabel ?? "Inconnu"}{company.nafCode ? <span className="num text-muted"> {company.nafCode}</span> : null}</dd>
                  <dt className="text-muted">Effectif</dt><dd>{company.employees?.label ?? "Non diffusé"}</dd>
                  <dt className="text-muted">Création</dt><dd>{formatDate(company.creationDate)}</dd>
                  <dt className="text-muted">Siège</dt><dd>{[company.city, company.postalCode].filter(Boolean).join(" ") || "Inconnu"}</dd>
                </dl>
              ) : (
                <p className="text-muted">Entreprise non retrouvée dans le registre.</p>
              )}
              {web ? (
                <div className="border-t border-line pt-3">
                  <p className="flex items-center gap-1.5 text-muted"><Globe className="size-3.5" />{web.url.replace(/^https?:\/\//, "")}</p>
                  {web.title ? <p className="mt-1 font-medium">{web.title}</p> : null}
                  {web.description ? <p className="mt-0.5 text-[12px] text-muted">{web.description}</p> : null}
                </div>
              ) : null}
              {lead.enrichment?.notes.length ? (
                <ul className="border-t border-line pt-3 text-[12px] text-muted">
                  {lead.enrichment.notes.map((n, i) => <li key={i} className="flex gap-1.5"><WarningCircle className="mt-0.5 size-3.5 shrink-0 text-warn" />{n}</li>)}
                </ul>
              ) : null}
              {!lead.enrichment ? <p className="text-muted">Aucun enrichissement effectué.</p> : null}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Contact" />
            <ul className="flex flex-col gap-2 p-4 text-[13px]">
              <li className="flex items-center gap-2"><EnvelopeSimple className="size-4 text-muted" /><a className="truncate underline-offset-2 hover:underline" href={`mailto:${lead.email}`}>{lead.email}</a></li>
              {lead.phone ? <li className="flex items-center gap-2"><Phone className="size-4 text-muted" /><a className="num underline-offset-2 hover:underline" href={`tel:${lead.phone.replace(/\s/g, "")}`}>{lead.phone}</a></li> : null}
              <li className="flex items-center gap-2"><Buildings className="size-4 text-muted" />{lead.company}{lead.location ? <span className="text-muted"> ({lead.location})</span> : null}</li>
            </ul>
          </Panel>

          <Panel>
            <PanelHeader title="Activités" />
            <div className="flex flex-col gap-4 p-4">
              {writable ? <ActivityForm leadId={lead.id} /> : null}
              {activities.length === 0 ? (
                <p className="text-[12px] text-muted">Aucune activité enregistrée. Notez ici vos appels et emails.</p>
              ) : (
                <ul className="flex flex-col gap-3 border-t border-line pt-3">
                  {activities.map((x) => (
                    <li key={x.id} className="text-[13px]">
                      <p className="flex items-center gap-2 text-[11px] text-muted"><Tag>{ACTIVITY_LABEL[x.type]}</Tag><span>{formatDateTime(x.createdAt)}</span>{x.authorId ? <span>{"par "}{members.find((m) => m.userId === x.authorId)?.name ?? "un membre"}</span> : x.type === "assignment" ? <span>automatique</span> : null}</p>
                      <p className={cn("mt-1 whitespace-pre-wrap", x.type === "assignment" && "text-muted")}>{x.content}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
        </aside>
      </div>
    </>
  );
}

function PersonaBlock({ persona, detail }: { persona: { name: string; reason: string }; detail?: { role: string; challenges: string; objections: string[] } }) {
  return (
    <div className="flex flex-col gap-2 p-4 text-[13px]">
      <p className="text-[14px] font-medium">{persona.name}{detail?.role ? <span className="font-normal text-muted"> ({detail.role})</span> : null}</p>
      <p className="text-[12px] text-muted">{persona.reason}</p>
      {detail?.challenges ? <p><span className="font-medium">Enjeux : </span><span className="text-muted">{detail.challenges}</span></p> : null}
      {detail && detail.objections.length > 0 ? (
        <div>
          <p className="font-medium">Objections typiques</p>
          <ul className="mt-1 list-disc pl-5 text-muted">{detail.objections.map((o) => <li key={o}>{o}</li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}
