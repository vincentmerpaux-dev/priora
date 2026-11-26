import Link from "next/link";
import { WarningCircle } from "@/components/icons";

export function LegalShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10">
      <Link href="/leads" className="text-[12px] text-muted hover:text-fg">Retour à Priora</Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
      <div role="note" className="mt-4 flex gap-3 rounded-[var(--radius)] border border-warn/40 bg-warn-soft p-3 text-[13px]">
        <WarningCircle className="mt-0.5 size-4 shrink-0 text-warn" />
        <p>
          <strong>Document provisoire.</strong> Ce texte est un modèle de départ, il n&apos;a aucune valeur juridique tant qu&apos;un professionnel (avocat ou DPO) ne l&apos;a pas relu, complété et validé.
          Les passages entre crochets sont à renseigner.
        </p>
      </div>
      <div className="mt-6 flex flex-col gap-6 text-[14px] leading-relaxed text-muted [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-fg [&_li]:ml-4 [&_li]:list-disc">
        {children}
      </div>
    </main>
  );
}
