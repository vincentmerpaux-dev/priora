import { cn } from "@/lib/utils";

/** Marque : trois barres de score (même motif que l'icône PWA). */
export function Logo({ className, withWord = true }: { className?: string; withWord?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span aria-hidden className="flex h-4 items-end gap-[2px]">
        <span className="h-[45%] w-[3px] rounded-[1px] bg-faint" />
        <span className="h-[72%] w-[3px] rounded-[1px] bg-faint" />
        <span className="h-full w-[3px] rounded-[1px] bg-accent" />
      </span>
      {withWord ? <span className="text-[15px] font-semibold tracking-tight">Priora</span> : null}
    </span>
  );
}
