import { ObjectionsManager } from "@/components/app/objections-manager";
import { EmptyState, PageHeader } from "@/components/ui/panel";
import { requireOrg } from "@/lib/session";
import { can } from "@/lib/team/permissions";

export const metadata = { title: "Bibliothèque d'objections" };

export default async function ObjectionsPage() {
  const { repo, session } = await requireOrg();
  const items = await repo.listObjections(session.orgId);
  return (
    <>
      <PageHeader
        title="Bibliothèque d'objections"
        description="Les objections de vos prospects et les réponses qui marchent. La fiche d'appel de chaque lead s'appuie dessus en priorité."
      />
      {items.length === 0 && !can(session.role, "objections.manage") ? (
        <EmptyState title="Aucune objection enregistrée" description="Un administrateur ou un manager peut en ajouter." />
      ) : (
        <ObjectionsManager items={items} canEdit={can(session.role, "objections.manage")} />
      )}
    </>
  );
}
