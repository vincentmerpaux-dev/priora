import Link from "next/link";
import { BarList, StackedBar, VolumeChart, fmtPct } from "@/components/app/charts";
import { Info } from "@/components/icons";
import { SOURCE_LABEL, STATUS_LABEL } from "@/components/ui/badges";
import { PageHeader, Panel, PanelHeader } from "@/components/ui/panel";
import { requirePermission } from "@/lib/session";
import { computeDashboard, PERIODS, type Period } from "@/lib/team/stats";
import { formatMinutes } from "@/lib/team/speed";
import { cn } from "@/lib/utils";

export const metadata = { title: "Tableau de bord" };

const STATUS_COLOR = { new: "bg-line-strong", contacted: "bg-muted", qualified: "bg-warn", won: "bg-accent", lost: "bg-danger" } as const;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  // Droits côté serveur : managers et administrateurs seulement.
  const { repo, session } = await requirePermission("dashboard.view");
  const sp = await searchParams;
  const period = (PERIODS as readonly number[]).includes(Number(sp.p)) ? (Number(sp.p) as Period) : 30;

  const [leads, members, settings] = await Promise.all([repo.listLeads(session.orgId), repo.listMembers(session.orgId), repo.getOrgSettings(session.orgId)]);
  const d = computeDashboard({ leads, members, settings, days: period });
  const targets = settings.speedTargets;

  const kpis = [
    { label: "Leads reçus", value: String(d.total), sub: `${d.open} encore ouverts`, tone: "text-fg" },
    { label: "Délai médian de premier contact", value: d.firstContact.medianMinutes === null ? "n.d." : formatMinutes(d.firstContact.medianMinutes), sub: `cibles : ${formatMinutes(targets.callNowMinutes)} et ${formatMinutes(targets.nurtureMinutes)}`, tone: "text-fg" },
    { label: "Dans le délai cible", value: fmtPct(d.firstContact.withinPct), sub: `${d.firstContact.within} sur ${d.firstContact.measured} mesurés`, tone: (d.firstContact.withinPct ?? 0) >= 0.7 ? "text-accent" : (d.firstContact.withinPct ?? 0) >= 0.4 ? "text-warn" : "text-danger" },
    { label: "Taux de gain", value: fmtPct(d.winRate), sub: `${d.won} gagnés, ${d.lost} perdus`, tone: "text-fg" },
    { label: "En retard maintenant", value: String(d.firstContact.overdueNow), sub: "leads non contactés hors délai", tone: d.firstContact.overdueNow > 0 ? "text-danger" : "text-accent" },
  ];

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        description="Volume, rapidité de premier contact, conversion et performance de l'équipe sur la période choisie."
        actions={
          <nav aria-label="Période" className="inline-flex overflow-hidden rounded-[var(--radius)] border border-line-strong">
            {PERIODS.map((p) => (
              <Link
                key={p}
                href={`/dashboard?p=${p}`}
                aria-current={p === period ? "true" : undefined}
                className={cn("num inline-flex h-9 items-center px-3.5 text-[13px] transition-colors", p === period ? "bg-surface-3 text-fg" : "bg-surface text-muted hover:bg-surface-2 hover:text-fg", p !== PERIODS[0] && "border-l border-line-strong")}
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
          <span><strong className="font-semibold">Données de démonstration.</strong> Historique fictif de 90 jours (leads, activités, délais et résultats générés pour l&apos;exemple), à ne pas lire comme des chiffres réels.</span>
        </p>
      ) : null}

      <dl className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius)] border border-line bg-line lg:grid-cols-5">
        {kpis.map((k, i) => (
          <div key={k.label} className={cn("bg-surface px-4 py-3", i === kpis.length - 1 && "col-span-2 lg:col-span-1")}>
            <dt className="text-[12px] text-muted">{k.label}</dt>
            <dd className={cn("num mt-1 text-2xl font-semibold", k.tone)}>{k.value}</dd>
            <p className="mt-0.5 text-[11px] text-faint">{k.sub}</p>
          </div>
        ))}
      </dl>

      {d.total === 0 ? (
        <Panel className="p-6 text-[13px] text-muted">Aucun lead reçu sur cette période.</Panel>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel>
            <PanelHeader title={`Volume de leads (${period} jours)`} action={<span className="num text-[12px] text-muted">{d.total} au total</span>} />
            <div className="p-4"><VolumeChart buckets={d.volume.buckets} bucketDays={d.volume.bucketDays} /></div>
            {d.volume.bucketDays > 1 ? <p className="border-t border-line px-4 py-2 text-[11px] text-faint">Une barre = {d.volume.bucketDays} jours.</p> : null}
          </Panel>

          <Panel>
            <PanelHeader title="Volume par source" />
            <div className="p-4">
              <BarList rows={d.volume.bySource.map((s) => ({ key: s.source, label: SOURCE_LABEL[s.source], value: s.count, display: String(s.count), sub: fmtPct(s.count / d.total) }))} />
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Conversion par tranche de score" />
            <div className="p-4">
              <BarList
                rows={d.byScoreBand.map((b) => ({
                  key: b.key, label: `Score ${b.label}`, value: b.winRate ?? 0, display: fmtPct(b.winRate),
                  sub: `${b.won} gagnés sur ${b.won + b.lost} clos, ${b.leads} leads`,
                  tone: b.key === "high" ? "accent" : b.key === "mid" ? "warn" : "danger",
                }))}
              />
              <p className="mt-4 text-[11px] text-faint">Taux de gain = gagnés / (gagnés + perdus). Les leads encore ouverts ne comptent pas. Un score fiable fait monter le taux avec la tranche.</p>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Pipeline par statut" />
            <div className="p-4">
              <StackedBar parts={d.pipeline.map((p) => ({ key: p.status, label: STATUS_LABEL[p.status], value: p.count, className: STATUS_COLOR[p.status] }))} />
              <p className="mt-4 text-[11px] text-faint">Statut actuel des leads reçus sur la période.</p>
            </div>
          </Panel>

          <Panel className="lg:col-span-2">
            <PanelHeader title="Classement des commerciaux" action={<span className="text-[12px] text-muted">trié par leads gagnés</span>} />
            {d.bySales.length === 0 ? (
              <p className="p-4 text-[13px] text-muted">Aucun commercial dans l&apos;organisation.</p>
            ) : (
              <>
                <div className="hidden md:block">
                  <table className="w-full text-left text-[13px]">
                    <thead>
                      <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
                        <th className="w-10 px-4 py-2 font-medium">#</th>
                        <th className="px-2 py-2 font-medium">Commercial</th>
                        <th className="px-2 py-2 text-right font-medium">Attribués</th>
                        <th className="px-2 py-2 text-right font-medium">Traités</th>
                        <th className="px-2 py-2 text-right font-medium">Délai médian</th>
                        <th className="px-2 py-2 text-right font-medium">Dans le délai</th>
                        <th className="px-2 py-2 text-right font-medium">Gagnés</th>
                        <th className="px-2 py-2 text-right font-medium">Perdus</th>
                        <th className="px-4 py-2 text-right font-medium">Taux de gain</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {d.bySales.map((r, i) => (
                        <tr key={r.userId} className={cn(!r.active && "opacity-60")}>
                          <td className="num px-4 py-2.5 text-muted">{i + 1}</td>
                          <td className="px-2 py-2.5 font-medium">{r.name}{r.active ? "" : <span className="ml-2 text-[11px] font-normal text-faint">désactivé</span>}</td>
                          <td className="num px-2 py-2.5 text-right">{r.assigned}</td>
                          <td className="num px-2 py-2.5 text-right">{r.handled}</td>
                          <td className="num px-2 py-2.5 text-right">{r.medianMinutes === null ? "n.d." : formatMinutes(r.medianMinutes)}</td>
                          <td className={cn("num px-2 py-2.5 text-right", (r.withinPct ?? 0) >= 0.7 ? "text-accent" : (r.withinPct ?? 0) >= 0.4 ? "text-warn" : "text-danger")}>{fmtPct(r.withinPct)}</td>
                          <td className="num px-2 py-2.5 text-right text-accent">{r.won}</td>
                          <td className="num px-2 py-2.5 text-right">{r.lost}</td>
                          <td className="num px-4 py-2.5 text-right font-semibold">{fmtPct(r.winRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ol className="divide-y divide-line md:hidden">
                  {d.bySales.map((r, i) => (
                    <li key={r.userId} className={cn("px-4 py-3", !r.active && "opacity-60")}>
                      <p className="flex items-baseline justify-between gap-2"><span className="text-[14px] font-medium"><span className="num mr-2 text-muted">{i + 1}.</span>{r.name}</span><span className="num text-[15px] font-semibold">{fmtPct(r.winRate)}</span></p>
                      <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                        <div><dt className="text-faint">Traités</dt><dd className="num text-[13px]">{r.handled}/{r.assigned}</dd></div>
                        <div><dt className="text-faint">Délai médian</dt><dd className="num text-[13px]">{r.medianMinutes === null ? "n.d." : formatMinutes(r.medianMinutes)}</dd></div>
                        <div><dt className="text-faint">Dans le délai</dt><dd className="num text-[13px]">{fmtPct(r.withinPct)}</dd></div>
                        <div><dt className="text-faint">Gagnés</dt><dd className="num text-[13px] text-accent">{r.won}</dd></div>
                        <div><dt className="text-faint">Perdus</dt><dd className="num text-[13px]">{r.lost}</dd></div>
                      </dl>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
