import Link from "next/link";
import { PageHeader } from "@/components/ui/panel";
import { PUBLIC_DEMO_CSV_MAX_ROWS } from "@/lib/demo/public";
import { isPublicDemo } from "@/lib/supabase/env";
import { requirePermission } from "@/lib/session";
import { CsvImporter } from "./importer";

export const metadata = { title: "Importer un CSV" };

export default async function ImportPage() {
  await requirePermission("leads.view_all");
  return (
    <>
      <Link href="/leads" className="mb-3 inline-block text-[12px] text-muted hover:text-fg">Retour à la file</Link>
      <PageHeader title="Importer un CSV" description="Choisissez un fichier, vérifiez la correspondance des colonnes, contrôlez l'aperçu, puis lancez l'import." />
      <CsvImporter maxRows={isPublicDemo() ? PUBLIC_DEMO_CSV_MAX_ROWS : undefined} />
    </>
  );
}
