import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/session";
import { isDemoMode } from "@/lib/supabase/env";
import { LoginForm } from "./login-form";

export const metadata = { title: "Connexion" };

const PILLARS = [
  { name: "Adéquation", text: "Secteur, taille, zone et rôle du contact face à votre cible idéale." },
  { name: "Intention", text: "Ce que dit le message, d'où vient le lead, s'il est joignable." },
  { name: "Timing", text: "Échéance exprimée et fraîcheur : un lead se refroidit vite." },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const demo = isDemoMode();
  if (!demo && (await getSession())) redirect("/leads");

  return (
    <div className="relative grid min-h-[100dvh] lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-line p-10 lg:flex">
        <div aria-hidden className="grid-bg absolute inset-0 opacity-60" />
        <Logo className="relative" />
        <div className="relative max-w-[34rem]">
          <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight xl:text-5xl">Sachez qui appeler en premier, et pourquoi.</h1>
          <p className="mt-4 max-w-[48ch] text-muted">Priora note chaque lead entrant sur 100, montre le détail de chaque point, et prépare l&apos;appel.</p>
          <dl className="mt-10 flex flex-col gap-5 border-t border-line pt-6">
            {PILLARS.map((p) => (
              <div key={p.name} className="grid grid-cols-[7.5rem_1fr] gap-4">
                <dt className="num text-[13px] text-accent">{p.name}</dt>
                <dd className="text-[13px] text-muted">{p.text}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="relative text-[12px] text-faint">Les scores sont calculés par des règles explicites, jamais par une boîte noire.</p>
      </section>

      <section className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between lg:justify-end">
          <Logo className="lg:hidden" />
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h2 className="text-xl font-semibold tracking-tight">{demo ? "Mode démonstration" : "Accéder à Priora"}</h2>
          {demo ? (
            <div className="mt-4 flex flex-col gap-4">
              <p className="text-[13px] text-muted">
                Aucune base Supabase n&apos;est configurée : Priora s&apos;ouvre avec des données fictives (30 leads, entreprises inventées) conservées en mémoire. Rien n&apos;est enregistré durablement.
              </p>
              <Button asChild variant="primary" size="lg">
                <Link href="/leads">Ouvrir la démo</Link>
              </Button>
              <p className="text-[12px] text-faint">Pour activer les comptes, renseignez les variables Supabase du fichier .env.example.</p>
            </div>
          ) : (
            <div className="mt-5">
              <LoginForm initialError={sp.error === "lien" ? "Ce lien n'est plus valide. Demandez-en un nouveau." : undefined} />
            </div>
          )}
          <p className="mt-8 text-[11px] text-faint">
            En continuant, vous acceptez les <Link href="/legal/cgu" className="underline underline-offset-2">conditions d&apos;utilisation</Link> et la{" "}
            <Link href="/legal/confidentialite" className="underline underline-offset-2">politique de confidentialité</Link>.
          </p>
        </div>
      </section>
    </div>
  );
}
