import { CaretRight } from "@/components/icons";
import { cn } from "@/lib/utils";

/** Panneau bordé, sans ombre : l'élévation n'est utilisée que pour les menus et dialogues. */
export function Panel({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius)] border border-line bg-surface", className)} {...p} />;
}

export function PanelHeader({ title, action, className }: { title: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 border-b border-line px-4 py-3", className)}>
      <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
        {description ? <p className="mt-1 max-w-[65ch] text-[13px] text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-[var(--radius)] border border-dashed border-line-strong px-6 py-10">
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-[60ch] text-[13px] text-muted">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/**
 * Section dépliable (details/summary natifs : clavier, lecteur d'écran et focus gérés par le navigateur).
 * Repliée par défaut : la fiche garde l'essentiel en vue, le détail est à un clic.
 */
export function Disclosure({ title, hint, defaultOpen = false, className, children }: { title: string; hint?: string; defaultOpen?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <details open={defaultOpen} className={cn("group rounded-[var(--radius)] border border-line bg-surface", className)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-[var(--radius)] px-4 py-3 outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
        <CaretRight className="size-3.5 shrink-0 text-muted transition-transform group-open:rotate-90" aria-hidden />
        <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
        {hint ? <span className="ml-auto truncate text-[12px] text-muted">{hint}</span> : null}
      </summary>
      <div className="border-t border-line">{children}</div>
    </details>
  );
}
