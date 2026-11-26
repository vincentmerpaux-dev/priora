import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Page introuvable", robots: { index: false } };

export default function NotFound() {
  return (
    <main id="contenu" className="relative isolate flex min-h-[100dvh] flex-col">
      <div aria-hidden className="grid-bg absolute inset-0 -z-10 opacity-50" />
      <header className="px-6 py-5"><Link href="/" aria-label="Priora, accueil"><Logo /></Link></header>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 px-6 pb-24">
        <p className="num text-sm text-warn">404 · page introuvable</p>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight">Cette page n&apos;existe pas, ou plus.</h1>
        <p className="text-muted">Le lien est peut-être erroné, ou la démo a été réinitialisée entre-temps. Rien de grave : repartez de l&apos;accueil.</p>
        <div className="mt-2 flex flex-wrap gap-3">
          <Link href="/" className={buttonVariants({ variant: "primary", size: "lg" })}>Retour à l&apos;accueil</Link>
          {/* Lien simple voulu : la route pose des cookies avant de rediriger, pas de préchargement. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/demo/maintia?as=admin" className={buttonVariants({ variant: "secondary", size: "lg" })}>Ouvrir la démo</a>
        </div>
      </div>
    </main>
  );
}
