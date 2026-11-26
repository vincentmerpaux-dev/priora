import { cn } from "@/lib/utils";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1]![0]! : "")).toUpperCase();
}

/** Pastille d'initiales + nom. Non attribué : tiret et libellé neutre. */
export function MemberChip({ name, inactive, className }: { name: string | null; inactive?: boolean; className?: string }) {
  if (!name) return <span className={cn("text-[12px] text-faint", className)}>Non attribué</span>;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-[12px]", inactive && "text-faint line-through", className)} title={inactive ? `${name} (désactivé)` : name}>
      <span aria-hidden className="num inline-flex size-5 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-line-strong bg-surface-3 text-[10px] font-medium">{initials(name)}</span>
      <span className="truncate">{name}</span>
    </span>
  );
}
