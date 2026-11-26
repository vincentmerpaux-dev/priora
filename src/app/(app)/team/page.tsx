import { TeamManager } from "@/components/app/team-manager";
import { Tag } from "@/components/ui/badges";
import { PageHeader, Panel, PanelHeader } from "@/components/ui/panel";
import { requirePermission } from "@/lib/session";
import { can, type Permission } from "@/lib/team/permissions";
import { ROLE_LABEL, ROLES } from "@/lib/types";

export const metadata = { title: "Équipe" };

const RIGHTS: { label: string; permission: Permission | "own" }[] = [
  { label: "Voir et traiter ses propres leads", permission: "own" },
  { label: "Voir tous les leads de l'organisation", permission: "leads.view_all" },
  { label: "Réattribuer des leads, importer un CSV", permission: "leads.assign" },
  { label: "Tableau de bord", permission: "dashboard.view" },
  { label: "Bibliothèque d'objections (modifier)", permission: "objections.manage" },
  { label: "Réglages : critères, personas, sources, attribution", permission: "settings.manage" },
  { label: "Équipe : inviter, rôles, désactiver", permission: "team.manage" },
];

export default async function TeamPage() {
  const { repo, session } = await requirePermission("team.view");
  const [members, settings] = await Promise.all([repo.listMembers(session.orgId), repo.getOrgSettings(session.orgId)]);

  return (
    <>
      <PageHeader title="Équipe" description="Les membres de l'organisation, leur rôle et leur accès. Un membre désactivé perd tout accès et garde son historique." />
      <div className="flex max-w-4xl flex-col gap-6">
        <TeamManager members={members} currentUserId={session.userId} canEdit={can(session.role, "team.manage")} demo={session.mode === "demo"} />

        <Panel>
          <PanelHeader title="Droits par rôle" />
          <div className="scroll-x overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-4 py-2 font-medium">Droit</th>
                  {ROLES.map((r) => <th key={r} className="px-4 py-2 font-medium">{ROLE_LABEL[r]}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {RIGHTS.map((r) => (
                  <tr key={r.label}>
                    <td className="px-4 py-2.5">{r.label}</td>
                    {ROLES.map((role) => {
                      const yes = r.permission === "own" ? true : can(role, r.permission);
                      return <td key={role} className="px-4 py-2.5">{yes ? <Tag tone="accent">Oui</Tag> : <span className="text-faint">Non</span>}</td>;
                    })}
                  </tr>
                ))}
                <tr>
                  <td className="px-4 py-2.5">Voir la file commune</td>
                  <td className="px-4 py-2.5"><Tag tone="accent">Oui</Tag></td>
                  <td className="px-4 py-2.5"><Tag tone="accent">Oui</Tag></td>
                  <td className="px-4 py-2.5">{settings.commercialsSeeAll ? <Tag tone="accent">Oui, en lecture seule</Tag> : <Tag>Non (réglage)</Tag>}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-4 py-3 text-[12px] text-muted">Ces droits sont appliqués côté serveur (pages et actions) et par les règles de sécurité de la base (RLS) en mode Supabase.</p>
        </Panel>
      </div>
    </>
  );
}
