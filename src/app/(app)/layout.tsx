import { Shell } from "@/components/app/shell";
import { DEMO_ORGS, demoOrgById } from "@/lib/demo/orgs";
import { syncOverdueThrottled } from "@/lib/notifications/service";
import { requireOrg } from "@/lib/session";
import { isPublicDemo } from "@/lib/supabase/env";
import { can } from "@/lib/team/permissions";

export const metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { repo, session } = await requireOrg();
  // Repli de la tâche planifiée : les retards sont aussi détectés à l'affichage (au plus une fois par minute et par organisation).
  // Réservé au staff : seul lui voit tous les leads (un commercial ne verrait qu'une partie des retards).
  if (session.mode === "demo" || can(session.role, "leads.view_all")) await syncOverdueThrottled(repo, session.orgId);
  const [org, notes] = await Promise.all([repo.getOrganization(session.orgId), repo.listNotifications(session.orgId, session.userId, 30)]);
  const bell = notes.map(({ id, kind, title, body, leadId, readAt, createdAt }) => ({ id, kind, title, body, leadId, readAt, createdAt }));
  const current = session.mode === "demo" ? demoOrgById(session.orgId) : null;
  const members = current ? (await repo.listMembers(session.orgId)).filter((m) => m.active) : [];
  const demoSwitch = current
    ? {
        current: current.key,
        banner: current.banner,
        orgs: DEMO_ORGS.map(({ key, label, hint }) => ({ key, label, hint })),
        asUser: session.userId,
        users: members.map((m) => ({ id: m.userId, name: m.name, role: m.role })),
      }
    : undefined;
  return (
    <Shell orgName={org?.name ?? "Mon entreprise"} email={session.email} userName={session.name} role={session.role} demo={session.mode === "demo"} publicDemo={isPublicDemo()} tour={session.mode === "demo" && process.env.PRIORA_DISABLE_TOUR !== "true"} demoSwitch={demoSwitch} notifications={bell} unread={notes.filter((n) => !n.readAt).length}>
      {children}
    </Shell>
  );
}
