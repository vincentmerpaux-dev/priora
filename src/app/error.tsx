"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Logo } from "@/components/app/logo";
import { Button, buttonVariants } from "@/components/ui/button";

/** Erreur imprévue : message sobre, aucun détail technique affiché, possibilité de réessayer ou de repartir de l'accueil. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error("[priora] erreur d'affichage :", error instanceof Error ? error.message : error);
  }, [error]);
  return (
    <main id="contenu" className="flex min-h-[100dvh] flex-col">
      <header className="px-6 py-5"><Link href="/" aria-label="Priora, accueil"><Logo /></Link></header>
      <div role="alert" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 px-6 pb-24">
        <p className="num text-sm text-warn">Erreur</p>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight">Quelque chose s&apos;est mal passé.</h1>
        <p className="text-muted">Ce n&apos;est pas de votre fait. Réessayez ; si le problème continue, revenez à l&apos;accueil (dans la démo, le bouton « Réinitialiser la démo » remet tout à zéro).</p>
        <div className="mt-2 flex flex-wrap gap-3">
          <Button variant="primary" size="lg" onClick={() => retry()}>Réessayer</Button>
          <Link href="/" className={buttonVariants({ variant: "secondary", size: "lg" })}>Retour à l&apos;accueil</Link>
        </div>
      </div>
    </main>
  );
}
