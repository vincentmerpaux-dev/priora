import { redirect } from "next/navigation";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { getRepo } from "@/lib/repo";
import { defaultIcp, DEFAULT_OBJECTIONS } from "@/lib/scoring/defaults";
import { requireSession } from "@/lib/session";
import { OnboardingWizard } from "./wizard";

export const metadata = { title: "Configuration" };

export default async function OnboardingPage() {
  const session = await requireSession();
  // Réservé à la création de l'organisation ou à sa reconfiguration par un administrateur.
  if (session.disabled) redirect("/account-disabled");
  if (session.orgId && session.role !== "admin") redirect("/leads");
  const repo = await getRepo();

  let name = "";
  let slug = "";
  let icp = defaultIcp("pending");
  let objections: { objection: string; response: string; category: string }[] = DEFAULT_OBJECTIONS.map((o) => ({ ...o }));

  if (session.orgId) {
    const [org, savedIcp, savedObjections] = await Promise.all([repo.getOrganization(session.orgId), repo.getIcp(session.orgId), repo.listObjections(session.orgId)]);
    name = org?.name ?? "";
    slug = org?.slug ?? "";
    icp = savedIcp;
    if (savedObjections.length > 0) objections = savedObjections.map((o) => ({ objection: o.objection, response: o.response, category: o.category }));
  }
  const { orgId: _orgId, ...icpValues } = icp;
  void _orgId;

  return (
    <div className="min-h-[100dvh]">
      <header className="flex items-center justify-between border-b border-line px-5 py-3">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="px-5 py-8 sm:py-12">
        <OnboardingWizard hasOrg={Boolean(session.orgId)} initialName={name} initialSlug={slug} initialIcp={icpValues} initialObjections={objections} />
      </main>
    </div>
  );
}
