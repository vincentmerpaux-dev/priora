import Link from "next/link";
import { Suspense } from "react";
import { LeadFilters, type OwnerOption } from "@/components/app/lead-filters";
import { LeadList, type LeadRow } from "@/components/app/lead-list";
import { Plus, UploadSimple } from "@/components/icons";
import { SOURCE_LABEL } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/panel";
import { fullName, priority } from "@/lib/format";
import { normalize } from "@/lib/text";
import { requireOrg } from "@/lib/session";
import { can, isStaff, visibleLeads } from "@/lib/team/permissions";
import { isOverdue, speedStatus } from "@/lib/team/speed";
import type { LeadWithScore, OrgSettings } from "@/lib/types";

export const metadata = { title: "File de leads" };

type SP = { created?: string; q?: string; status?: string; source?: string; verdict?: string; min?: string; sort?: string; owner?: string; late?: string };

function applyFilters(leads: LeadWithScore[], sp: SP, settings: OrgSettings, now: Date): LeadWithScore[] {
  const q = normalize(sp.q);
  const min = Number(sp.min) || 0;
  const status = sp.status ?? "open";
  return leads.filter((l) => {
    if (status === "open" ? ["won", "lost"].includes(l.status) : status !== "all" && l.status !== status) return false;
    if (sp.source && l.source !== sp.source) return false;
    if (sp.verdict && l.verdict !== sp.verdict) return false;
    if (min && (l.scoreTotal ?? 0) < min) return false;
    if (sp.late === "1" && !isOverdue(speedStatus(l, settings, now))) return false;
    if (q && !normalize(`${l.firstName} ${l.lastName} ${l.company} ${l.email}`).includes(q)) return false;
    return true;
  });
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { repo, session } = await requireOrg();
  const [all, settings, members] = await Promise.all([repo.listLeads(session.orgId), repo.getOrgSettings(session.orgId), repo.listMembers(session.orgId)]);
  const now = new Date();
  const staff = isStaff(session.role);

  // Droits appliqués côté serveur : un commercial ne reçoit jamais les leads des autres, sauf si l'organisation ouvre la file commune.
  const visible = visibleLeads(all, session.role, session.userId, settings);
  const seesCommon = staff || settings.commercialsSeeAll;
  const ownerDefault = staff ? "all" : "me";
  // Un commercial sans accès à la file commune est ramené à "mes leads", quelle que soit l'URL.
  const owner = seesCommon ? (sp.owner ?? ownerDefault) : "me";

  const byId = new Map(members.map((m) => [m.userId, m]));
  const scoped = visible.filter((l) => {
    if (owner === "all") return true;
    if (owner === "me") return l.ownerId === session.userId;
    if (owner === "unassigned") return l.ownerId === null;
    return l.ownerId === owner;
  });

  const rows = applyFilters(scoped, sp, settings, now).sort((a, b) => {
    if (sp.sort === "recent") return b.createdAt.localeCompare(a.createdAt);
    if (sp.sort === "score") return (b.scoreTotal ?? -1) - (a.scoreTotal ?? -1) || b.createdAt.localeCompare(a.createdAt);
    return priority(b, now) - priority(a, now);
  });

  const open = scoped.filter((l) => l.status !== "won" && l.status !== "lost");
  const count = (v: string) => open.filter((l) => l.verdict === v).length;
  const lateCount = open.filter((l) => isOverdue(speedStatus(l, settings, now))).length;

  const sales = members.filter((m) => m.role === "commercial");
  const ownerOptions: OwnerOption[] = !seesCommon
    ? []
    : staff
      ? [{ value: "all", label: "Toute l'équipe" }, { value: "unassigned", label: "Non attribués" }, ...sales.map((m) => ({ value: m.userId, label: m.name + (m.active ? "" : " (désactivé)") }))]
      : [{ value: "me", label: "Mes leads" }, { value: "all", label: "File commune" }];

  const listRows: LeadRow[] = rows.map((l) => {
    const m = l.ownerId ? byId.get(l.ownerId) : undefined;
    return {
      id: l.id, name: fullName(l), sub: [l.jobTitle, l.company].filter(Boolean).join(" chez "), score: l.scoreTotal, verdict: l.verdict,
      sourceLabel: SOURCE_LABEL[l.source], createdAt: l.createdAt, status: l.status,
      ownerName: l.ownerId ? (m?.name ?? "Membre inconnu") : null, ownerInactive: m ? !m.active : false,
      speed: { createdAt: l.createdAt, firstContactedAt: l.firstContactedAt, status: l.status, verdict: l.verdict },
    };
  });
  const inactiveOwned = staff ? open.filter((l) => l.ownerId && byId.get(l.ownerId)?.active === false).length : 0;
  const lateQuery = Object.fromEntries(Object.entries({ ...sp, late: "1", created: undefined }).filter(([, v]) => typeof v === "string")) as Record<string, string>;

  return (
    <>
      <PageHeader
        title={owner === "me" && !staff ? "Mes leads" : "File de leads"}
        description="Triés par priorité : le score, diminué de 2 points par jour sans traitement."
        actions={
          <>
            {can(session.role, "leads.view_all") ? <Button asChild variant="secondary"><Link href="/leads/import"><UploadSimple />Importer un CSV</Link></Button> : null}
            <Button asChild variant="primary"><Link href="/leads/new"><Plus />Nouveau lead</Link></Button>
          </>
        }
      />

      <dl className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius)] border border-line bg-line sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: "Leads ouverts", value: open.length, tone: "text-fg" },
          { label: "Appeler maintenant", value: count("call_now"), tone: "text-accent" },
          { label: "Nourrir", value: count("nurture"), tone: "text-warn" },
          { label: "Disqualifier", value: count("disqualify"), tone: "text-muted" },
        ].map((s) => (
          <div key={s.label} className="bg-surface px-4 py-3">
            <dt className="text-[12px] text-muted">{s.label}</dt>
            <dd className={`num mt-1 text-2xl font-semibold ${s.tone}`}>{s.value}</dd>
          </div>
        ))}
        <div className="col-span-2 bg-surface px-4 py-3 sm:col-span-1">
          <dt className="text-[12px] text-muted">En retard (premier contact)</dt>
          <dd className={`num mt-1 text-2xl font-semibold ${lateCount > 0 ? "text-danger" : "text-accent"}`}>
            {lateCount}
            {lateCount > 0 && sp.late !== "1" ? (
              <Link href={{ pathname: "/leads", query: lateQuery }} className="ml-3 font-sans text-[12px] font-normal text-muted underline underline-offset-2 hover:text-fg">Voir</Link>
            ) : null}
          </dd>
        </div>
      </dl>

      {sp.created === "1" ? (
        <p role="status" className="mb-4 rounded-[var(--radius)] border border-accent-line bg-accent-soft px-3 py-2 text-[13px]">
          Lead créé, enrichi et noté. Il a été attribué automatiquement à un autre membre de l&apos;équipe, qui le retrouvera dans sa file.
        </p>
      ) : null}

      {inactiveOwned > 0 ? (
        <p role="note" className="mb-4 rounded-[var(--radius)] border border-warn/40 bg-warn-soft px-3 py-2 text-[13px] text-warn">
          {inactiveOwned} lead{inactiveOwned > 1 ? "s ouverts sont attribués" : " ouvert est attribué"} à un membre désactivé : réattribuez-les depuis la file.
        </p>
      ) : null}

      <Suspense fallback={<div className="skeleton mb-4 h-9" />}>
        <LeadFilters owners={ownerOptions} ownerDefault={ownerDefault} />
      </Suspense>

      {all.length === 0 ? (
        <EmptyState
          title="Aucun lead pour le moment"
          description="Ajoutez un lead à la main, importez un fichier CSV ou branchez votre formulaire et votre webhook dans les réglages."
          action={<Button asChild variant="primary"><Link href="/leads/new"><Plus />Nouveau lead</Link></Button>}
        />
      ) : scoped.length === 0 && !staff ? (
        <EmptyState title="Aucun lead ne vous est attribué" description="Les nouveaux leads vous seront attribués automatiquement. Un manager peut aussi vous en confier depuis la file." />
      ) : rows.length === 0 ? (
        <EmptyState title="Aucun résultat" description="Aucun lead ne correspond à ces filtres. Élargissez la recherche ou réinitialisez-les." />
      ) : (
        <>
          <p className="mb-2 text-[12px] text-muted"><span className="num">{rows.length}</span> lead{rows.length > 1 ? "s" : ""}</p>
          <LeadList
            rows={listRows}
            targets={settings.speedTargets}
            nowIso={now.toISOString()}
            canAssign={can(session.role, "leads.assign")}
            assignees={sales.filter((m) => m.active).map((m) => ({ id: m.userId, name: m.name }))}
          />
        </>
      )}
    </>
  );
}
