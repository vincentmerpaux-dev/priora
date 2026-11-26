import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/panel";
import { ManualLeadForm } from "./manual-form";

export const metadata = { title: "Nouveau lead" };

export default function NewLeadPage() {
  return (
    <>
      <Link href="/leads" className="mb-3 inline-block text-[12px] text-muted hover:text-fg">Retour à la file</Link>
      <PageHeader title="Nouveau lead" description="Le lead est enrichi (registre des entreprises, site web), noté sur 100, puis analysé." />
      <Panel className="max-w-2xl p-5">
        <ManualLeadForm />
      </Panel>
    </>
  );
}
