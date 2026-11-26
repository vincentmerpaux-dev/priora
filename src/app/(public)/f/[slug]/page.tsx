import { notFound } from "next/navigation";
import { PUBLIC_DEMO_DISABLED_MESSAGE } from "@/lib/demo/public";
import { isPublicDemo } from "@/lib/supabase/env";
import { getPublicRepo } from "@/lib/repo";
import { PublicForm } from "./public-form";

export const metadata = { title: "Contact", robots: { index: false } };

export default async function PublicFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ theme?: string }>;
}) {
  const { slug } = await params;
  const { theme } = await searchParams;
  if (isPublicDemo()) {
    return (
      <main className="mx-auto w-full max-w-xl px-5 py-10">
        <h1 className="text-xl font-semibold tracking-tight">Formulaire désactivé</h1>
        <p className="mt-2 text-[13px] text-muted">{PUBLIC_DEMO_DISABLED_MESSAGE} Pour tester la saisie d&apos;un lead, utilisez « Nouveau lead » dans la démo.</p>
      </main>
    );
  }
  const pub = getPublicRepo();
  const org = pub ? await pub.getOrganizationBySlug(slug.toLowerCase().slice(0, 48)) : null;
  if (!org) notFound();
  // ?theme=light|dark permet d'adapter le formulaire intégré au site du client.
  const forced = theme === "light" || theme === "dark" ? theme : undefined;

  return (
    <div data-theme={forced} className="min-h-[100dvh] bg-bg text-fg">
      <main className="mx-auto w-full max-w-xl px-5 py-8 sm:py-10">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Contacter {org.name}</h1>
        <p className="mb-6 mt-1 text-[13px] text-muted">Décrivez votre besoin, nous revenons vers vous rapidement.</p>
        <PublicForm slug={org.slug} orgName={org.name} />
        <p className="mt-8 text-[11px] text-faint">Formulaire propulsé par Priora.</p>
      </main>
    </div>
  );
}
