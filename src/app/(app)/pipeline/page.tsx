import { Kanban } from "@/components/app/kanban";
import { EmptyState, PageHeader } from "@/components/ui/panel";
import { requireOrg } from "@/lib/session";
import { canWriteLead, visibleLeads } from "@/lib/team/permissions";

export const metadata = { title: "Pipeline" };

/** Les leads gagnés ou perdus depuis plus de 30 jours quittent le tableau (ils restent dans la file et le tableau de bord). */
const CLOSED_VISIBLE_DAYS = 30;

export default async function PipelinePage() {
  const { repo, session } = await requireOrg();
  const [all, settings, members] = await Promise.all([repo.listLeads(session.orgId), repo.getOrgSettings(session.orgId), repo.listMembers(session.orgId)]);
  const cutoff = new Date().getTime() - CLOSED_VISIBLE_DAYS * 86_400_000;
  // Droits côté serveur : seuls les leads visibles pour ce rôle sont envoyés au navigateur.
  const leads = visibleLeads(all, session.role, session.userId, settings).filter(
    (l) => !(l.status === "won" || l.status === "lost") || new Date(l.updatedAt).getTime() >= cutoff,
  );
  const locked = leads.filter((l) => !canWriteLead(session.role, session.userId, l)).map((l) => l.id);
  const owners = Object.fromEntries(members.map((m) => [m.userId, m.name]));
  const ownerOf = Object.fromEntries(leads.flatMap((l) => (l.ownerId ? [[l.id, owners[l.ownerId] ?? "Membre inconnu"]] : [])));

  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Glissez les leads d'une colonne à l'autre. Gagné et Perdu demandent un motif pour alimenter vos statistiques. Les leads clos depuis plus de 30 jours sont masqués."
      />
      {leads.length === 0 ? (
        <EmptyState title="Le pipeline est vide" description="Les leads apparaissent ici dès leur arrivée dans la file." />
      ) : (
        <Kanban leads={leads} lockedIds={locked} ownerNames={ownerOf} />
      )}
    </>
  );
}
