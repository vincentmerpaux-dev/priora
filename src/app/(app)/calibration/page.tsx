import Link from "next/link";
import { ApplySuggestion, RestoreVersion } from "@/components/app/calibration-actions";
import { BarList, fmtPct } from "@/components/app/charts";
import { ArrowDown, ArrowUp, Info, Minus } from "@/components/icons";
import { Tag } from "@/components/ui/badges";
import { PageHeader, Panel, PanelHeader } from "@/components/ui/panel";
import { MIN_GROUP, MIN_TOTAL_FOR_SUGGESTION, type CriterionStat, type Reliability, type Signal } from "@/lib/calibration/compute";
import { CALIBRATION_PERIODS, currentVersion, loadCalibration, loadReasons } from "@/lib/calibration/service";
import { formatDateTime } from "@/lib/format";
import { verdictLabel } from "@/lib/scoring/engine";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/team/permissions";
import type { ScoreConfigVersion } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Calibration du score" };

const SIGNAL: Record<Signal, { label: string; tone: "accent" | "warn" | "danger" | "neutral" }> = {
  strong: { label: "Très prédictif", tone: "accent" },
  medium: { label: "Prédictif", tone: "accent" },
  none: { label: "Ne prédit rien", tone: "warn" },
  inverted: { label: "À contre-sens", tone: "danger" },
  unknown: { label: "Pas de conclusion", tone: "neutral" },
};
const RELIABILITY: Record<Reliability, { label: string; tone: "accent" | "warn" | "neutral"; hint: string }> = {
  reliable: { label: "Fiable", tone: "accent", hint: "25 leads clos ou plus dans chacun des deux groupes." },
  indicative: { label: "Indicatif", tone: "warn", hint: `Entre ${MIN_GROUP} et 24 leads dans le plus petit groupe : à confirmer avec plus de données.` },
  insufficient: { label: "Effectif trop faible", tone: "neutral", hint: `Moins de ${MIN_GROUP} leads dans un des deux groupes : aucune conclusion.` },
};
const SOURCE_LABEL: Record<ScoreConfigVersion["source"], string> = {
  initial: "Départ", manual: "Modification manuelle", suggestion: "Suggestion appliquée", restore: "Retour arrière",
};

const gain = (rate: number | null, n: number) => (n === 0 ? "aucun lead" : `${fmtPct(rate)}`);
const signed = (v: number | null) => (v === null ? "n.d." : `${v > 0 ? "+" : ""}${Math.round(v)} pts`);
const gapTone = (s: CriterionStat) => (s.gap === null || s.signal === "unknown" ? "text-muted" : s.signal === "strong" || s.signal === "medium" ? "text-accent" : s.signal === "inverted" ? "text-danger" : "text-warn");

export default async function CalibrationPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  // Droits côté serveur : managers et administrateurs (lecture) ; l'application des poids est réservée aux administrateurs.
  const { repo, session } = await requirePermission("calibration.view");
  const canApply = can(session.role, "calibration.apply");
  const sp = await searchParams;
  const period = (CALIBRATION_PERIODS as readonly number[]).includes(Number(sp.p)) ? Number(sp.p) : 90;

  const [view, versions, reasons] = await Promise.all([loadCalibration(repo, session.orgId, period), repo.listScoreVersions(session.orgId), loadReasons(repo, session.orgId, period)]);
  const { calibration: c, suggestion, preview, criteria } = view;
  const live = currentVersion(versions, criteria);
  const changedCount = suggestion.changes.filter((x) => x.after !== x.before).length;

  return (
    <>
      <PageHeader
        title="Calibration du score"
        description="Le score prédit-il vraiment qui signe ? Les leads déjà gagnés ou perdus servent à mesurer chaque critère et à proposer des poids plus justes."
        actions={
          <nav aria-label="Période" className="inline-flex overflow-hidden rounded-[var(--radius)] border border-line-strong">
            {CALIBRATION_PERIODS.map((p, i) => (
              <Link
                key={p}
                href={`/calibration?p=${p}`}
                aria-current={p === period ? "true" : undefined}
                className={cn("num inline-flex h-9 items-center px-3.5 text-[13px] transition-colors", p === period ? "bg-surface-3 text-fg" : "bg-surface text-muted hover:bg-surface-2 hover:text-fg", i > 0 && "border-l border-line-strong")}
              >
                {p} j
              </Link>
            ))}
          </nav>
        }
      />

      {session.mode === "demo" ? (
        <p role="note" className="mb-5 flex items-start gap-2 rounded-[var(--radius)] border border-warn/30 bg-warn-soft px-3 py-2 text-[12px] text-warn">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span><strong className="font-semibold">Données de démonstration.</strong> Les résultats gagné ou perdu sont fictifs, générés pour l&apos;exemple (certains critères prédictifs, d&apos;autres inutiles par construction). Ne pas les lire comme des chiffres réels.</span>
        </p>
      ) : null}

      <dl className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius)] border border-line bg-line lg:grid-cols-4">
        {[
          { label: "Leads clos", value: String(c.total), sub: `créés sur les ${period} derniers jours` },
          { label: "Gagnés", value: String(c.won), sub: "résultat enregistré", tone: "text-accent" },
          { label: "Perdus", value: String(c.lost), sub: "résultat enregistré" },
          { label: "Taux de gain", value: fmtPct(c.winRate), sub: "gagnés / (gagnés + perdus)" },
        ].map((k) => (
          <div key={k.label} className="bg-surface px-4 py-3">
            <dt className="text-[12px] text-muted">{k.label}</dt>
            <dd className={cn("num mt-1 text-2xl font-semibold", k.tone)}>{k.value}</dd>
            <p className="mt-0.5 text-[11px] text-faint">{k.sub}</p>
          </div>
        ))}
      </dl>

      {c.total === 0 ? (
        <Panel className="p-6 text-[13px] text-muted">Aucun lead clos sur cette période. Marquez des leads comme gagnés ou perdus dans le pipeline pour alimenter la calibration.</Panel>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel>
            <PanelHeader title="Taux de gain par tranche de score" />
            <div className="p-4">
              <BarList rows={c.byBand.map((b) => ({ key: b.key, label: `Score ${b.label}`, value: b.winRate ?? 0, display: fmtPct(b.winRate), sub: `${b.won} gagnés sur ${b.leads} clos`, tone: b.key === "high" ? "accent" : b.key === "mid" ? "warn" : "danger" }))} />
              <p className="mt-4 text-[11px] text-faint">Un score fiable fait monter le taux de gain avec la tranche.</p>
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Taux de gain par verdict" />
            <div className="p-4">
              <BarList rows={c.byVerdict.map((v) => ({ key: v.verdict, label: verdictLabel(v.verdict), value: v.winRate ?? 0, display: fmtPct(v.winRate), sub: `${v.won} gagnés sur ${v.leads} clos`, tone: v.verdict === "call_now" ? "accent" : v.verdict === "nurture" ? "warn" : "danger" }))} />
              <p className="mt-4 text-[11px] text-faint">Verdict enregistré à l&apos;arrivée du lead (IA ou règles).</p>
            </div>
          </Panel>

          <Panel className="lg:col-span-2">
            <PanelHeader title="Pouvoir prédictif de chaque critère" action={<span className="text-[12px] text-muted">trié par écart décroissant</span>} />
            <p className="border-b border-line px-4 py-3 text-[12px] text-muted">
              Pour chaque critère, on compare le taux de gain des leads qui y ont obtenu <strong className="font-medium text-fg">beaucoup de points</strong> (au moins la moitié du maximum) à celui des leads qui en ont obtenu <strong className="font-medium text-fg">peu</strong>. Plus l&apos;écart est grand, plus le critère aide à repérer les gagnants.
            </p>
            <div className="hidden md:block">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
                    <th className="px-4 py-2 font-medium">Critère</th>
                    <th className="px-2 py-2 text-right font-medium">Poids</th>
                    <th className="px-2 py-2 text-right font-medium">Beaucoup de points</th>
                    <th className="px-2 py-2 text-right font-medium">Peu de points</th>
                    <th className="px-2 py-2 text-right font-medium">Écart</th>
                    <th className="px-4 py-2 font-medium">Lecture</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {c.criteria.map((s) => (
                    <tr key={s.key}>
                      <td className="px-4 py-2.5 font-medium">{s.label}</td>
                      <td className="num px-2 py-2.5 text-right">{s.weight}</td>
                      <td className="num px-2 py-2.5 text-right">{gain(s.high.winRate, s.high.n)}<span className="ml-1.5 text-[11px] text-faint">{s.high.n} leads</span></td>
                      <td className="num px-2 py-2.5 text-right">{gain(s.low.winRate, s.low.n)}<span className="ml-1.5 text-[11px] text-faint">{s.low.n} leads</span></td>
                      <td className={cn("num px-2 py-2.5 text-right font-semibold", gapTone(s))}>{signed(s.gap)}</td>
                      <td className="px-4 py-2.5">
                        <span className="flex flex-wrap gap-1">
                          <Tag tone={SIGNAL[s.signal].tone}>{SIGNAL[s.signal].label}</Tag>
                          <Tag tone={RELIABILITY[s.reliability].tone} title={RELIABILITY[s.reliability].hint}>{RELIABILITY[s.reliability].label}</Tag>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {c.criteria.map((s) => (
                <li key={s.key} className="px-4 py-3">
                  <p className="flex items-baseline justify-between gap-2"><span className="text-[14px] font-medium">{s.label}</span><span className={cn("num text-[15px] font-semibold", gapTone(s))}>{signed(s.gap)}</span></p>
                  <p className="mt-1.5 flex flex-wrap gap-1">
                    <Tag tone={SIGNAL[s.signal].tone}>{SIGNAL[s.signal].label}</Tag>
                    <Tag tone={RELIABILITY[s.reliability].tone}>{RELIABILITY[s.reliability].label}</Tag>
                  </p>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                    <div><dt className="text-faint">Poids</dt><dd className="num text-[13px]">{s.weight}</dd></div>
                    <div><dt className="text-faint">Beaucoup de points</dt><dd className="num text-[13px]">{gain(s.high.winRate, s.high.n)} <span className="text-faint">({s.high.n})</span></dd></div>
                    <div><dt className="text-faint">Peu de points</dt><dd className="num text-[13px]">{gain(s.low.winRate, s.low.n)} <span className="text-faint">({s.low.n})</span></dd></div>
                  </dl>
                </li>
              ))}
            </ul>
            <p className="border-t border-line px-4 py-2 text-[11px] text-faint">
              Fiabilité : « Effectif trop faible » sous {MIN_GROUP} leads dans un des deux groupes (aucune conclusion, poids figé), « Indicatif » de {MIN_GROUP} à 24, « Fiable » à partir de 25. Un critère qui ne varie pas (toujours haut ou toujours bas) ne permet aucune conclusion.
            </p>
          </Panel>

          <Panel className="lg:col-span-2">
            <PanelHeader title="Suggestion d'ajustement des poids" action={<Tag tone={suggestion.blockedReason ? "neutral" : suggestion.changed ? "accent" : "neutral"}>{suggestion.blockedReason ? "Données insuffisantes" : suggestion.changed ? `${changedCount} poids à modifier` : "Aucun changement"}</Tag>} />
            <div className="flex flex-col gap-4 p-4">
              <p className="max-w-[75ch] text-[13px] text-muted">
                Règle : un critère très prédictif voit son poids augmenter (jusqu&apos;à +25 %), un critère qui ne prédit rien baisse de 20 %, un critère à contre-sens baisse de 25 %. L&apos;effectif trop faible ne change rien. Ensuite les poids sont renormalisés pour totaliser 100, sans jamais dépasser ±25 % de variation par critère.
              </p>

              {suggestion.blockedReason ? (
                <p className="rounded-[var(--radius)] border border-line-strong bg-surface-2 px-3 py-2 text-[13px]">{suggestion.blockedReason}</p>
              ) : !suggestion.changed ? (
                <p className="rounded-[var(--radius)] border border-line-strong bg-surface-2 px-3 py-2 text-[13px]">Aucun ajustement à proposer : les poids actuels sont cohérents avec les résultats observés.</p>
              ) : (
                <>
                  <ul className="divide-y divide-line rounded-[var(--radius)] border border-line">
                    {suggestion.changes.map((ch) => {
                      const delta = ch.after - ch.before;
                      const Icon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
                      return (
                        <li key={ch.key} className="flex items-start gap-3 px-3 py-2.5">
                          <span className="num flex w-[5.5rem] shrink-0 items-center gap-1.5 pt-0.5 text-[13px] font-semibold">
                            <Icon className={cn("size-3.5", delta > 0 ? "text-accent" : delta < 0 ? "text-warn" : "text-faint")} />
                            <span className="text-muted">{ch.before}</span><span className="text-faint">→</span><span>{ch.after}</span>
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[13px] font-medium">{ch.label}</span>
                            <span className="block text-[12px] text-muted">{ch.reason}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  {preview ? (
                    <div className="rounded-[var(--radius)] border border-line bg-surface-2 p-4">
                      <h3 className="text-[13px] font-semibold">Aperçu avant / après sur les {preview.leads} leads clos</h3>
                      <p className="mt-1 text-[13px]">
                        <span className="num font-semibold">{preview.verdictChanges.total}</span> lead{preview.verdictChanges.total > 1 ? "s" : ""} changeraient de verdict
                        {preview.verdictChanges.total > 0 ? <span className="text-muted"> ({preview.verdictChanges.promoted} vers un verdict plus chaud, {preview.verdictChanges.demoted} vers un verdict plus froid)</span> : null}.
                      </p>
                      <div className="mt-3 overflow-hidden rounded-[var(--radius)] border border-line bg-surface">
                        <table className="w-full text-left text-[13px]">
                          <thead>
                            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
                              <th className="px-3 py-2 font-medium">Tranche</th>
                              <th className="px-2 py-2 text-right font-medium">Avant</th>
                              <th className="px-3 py-2 text-right font-medium">Après</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line">
                            {preview.bands.map((b) => (
                              <tr key={b.key}>
                                <td className="px-3 py-2">Score {b.label}</td>
                                <td className="num px-2 py-2 text-right">{fmtPct(b.before.winRate)}<span className="ml-1.5 text-[11px] text-faint">{b.before.leads} leads</span></td>
                                <td className="num px-3 py-2 text-right font-semibold">{fmtPct(b.after.winRate)}<span className="ml-1.5 text-[11px] font-normal text-faint">{b.after.leads} leads</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-3 text-[11px] text-faint">
                        Taux de gain simulé : chaque lead clos est renoté avec les poids actuels puis avec les nouveaux (verdict par seuils 70 et 40). Cet aperçu est calculé sur les mêmes leads que ceux qui servent à proposer les poids : il montre l&apos;effet de l&apos;ajustement, pas une garantie sur les leads à venir.
                      </p>
                    </div>
                  ) : null}

                  {canApply ? (
                    <ApplySuggestion days={period} summary={`Appliquer ${changedCount} changement${changedCount > 1 ? "s" : ""} de poids ?`} />
                  ) : (
                    <p className="text-[13px] text-muted">Lecture seule : seul un administrateur peut appliquer ces poids.</p>
                  )}
                  <p className="text-[11px] text-faint">Les scores déjà calculés ne sont pas modifiés : les nouveaux poids s&apos;appliquent aux prochains leads et aux recalculs (« Réenrichir et recalculer » sur la fiche).</p>
                </>
              )}
              {!suggestion.blockedReason && c.total < MIN_TOTAL_FOR_SUGGESTION * 2 ? (
                <p className="text-[11px] text-faint">Avec moins de {MIN_TOTAL_FOR_SUGGESTION * 2} leads clos, les écarts mesurés restent fragiles : relisez les indicateurs de fiabilité avant d&apos;appliquer.</p>
              ) : null}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Motifs de gain" />
            <ReasonList rows={reasons.won.map((r) => ({ code: r.code, n: r.won }))} empty="Aucun motif de gain renseigné (il est facultatif)." />
          </Panel>
          <Panel>
            <PanelHeader title="Motifs de perte" />
            <ReasonList rows={reasons.lost.map((r) => ({ code: r.code, n: r.lost }))} empty="Aucun motif de perte renseigné." tone="danger" />
          </Panel>
        </div>
      )}

      <Panel className="mt-5">
        <PanelHeader title="Historique des versions du score" action={live !== null ? <Tag tone="accent">Version en vigueur : {live}</Tag> : <Tag tone="warn">Configuration modifiée hors historique</Tag>} />
        {versions.length === 0 ? (
          <p className="p-4 text-[13px] text-muted">Aucune version enregistrée. La première modification des poids (suggestion appliquée ou changement dans Réglages) enregistre d&apos;abord la configuration de départ, pour pouvoir y revenir.</p>
        ) : (
          <ol className="divide-y divide-line">
            {versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="num font-semibold">Version {v.version}</span>
                    <Tag>{SOURCE_LABEL[v.source]}</Tag>
                    {v.version === live ? <Tag tone="accent">En vigueur</Tag> : null}
                    <span className="text-[12px] text-muted">{formatDateTime(v.createdAt)}</span>
                  </p>
                  <p className="mt-1 text-[12px] text-muted">{v.note}</p>
                  <p className="num mt-1 text-[11px] text-faint">{v.criteria.filter((x) => x.enabled && x.weight > 0).map((x) => `${x.label} ${x.weight}`).join(" · ")}</p>
                </div>
                {canApply && v.version !== live ? <RestoreVersion versionId={v.id} version={v.version} /> : null}
              </li>
            ))}
          </ol>
        )}
        {!canApply ? <p className="border-t border-line px-4 py-2 text-[11px] text-faint">Lecture seule : seul un administrateur peut revenir à une version précédente.</p> : null}
      </Panel>
    </>
  );
}

function ReasonList({ rows, empty, tone = "accent" }: { rows: { code: string; n: number }[]; empty: string; tone?: "accent" | "danger" }) {
  if (rows.length === 0) return <p className="p-4 text-[13px] text-muted">{empty}</p>;
  return (
    <div className="p-4">
      <BarList rows={rows.slice(0, 6).map((r) => ({ key: r.code, label: r.code, value: r.n, display: String(r.n), tone }))} />
    </div>
  );
}
