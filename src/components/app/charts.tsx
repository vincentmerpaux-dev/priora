import { cn } from "@/lib/utils";

/**
 * Graphiques sobres, sans bibliothèque : barres en HTML et CSS, couleurs issues des tokens (thèmes sombre et clair),
 * chiffres en JetBrains Mono (classe .num). Composants serveur, sans JavaScript côté navigateur.
 */

export const fmtPct = (v: number | null): string => (v === null ? "n.d." : `${Math.round(v * 100)} %`);

/** Histogramme de volume : une barre par tranche, libellés de l'axe réduits au début, au milieu et à la fin. */
export function VolumeChart({ buckets, bucketDays }: { buckets: { start: string; count: number }[]; bucketDays: number }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const label = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const mid = Math.floor(buckets.length / 2);
  return (
    <figure aria-label="Volume de leads par période">
      <div className="relative">
        <p className="num absolute -top-1 left-0 text-[11px] text-faint">{max}</p>
        <div className="flex h-36 items-end gap-[3px] border-b border-line pt-4" role="img" aria-label={`Leads reçus, tranches de ${bucketDays} jour${bucketDays > 1 ? "s" : ""}, maximum ${max}`}>
          {buckets.map((b) => (
            <div key={b.start} className="group relative flex h-full min-w-0 flex-1 items-end" title={`${label(b.start)} : ${b.count} lead${b.count > 1 ? "s" : ""}`}>
              <div className={cn("w-full rounded-t-[2px] bg-accent/80 transition-colors group-hover:bg-accent", b.count === 0 && "bg-surface-3")} style={{ height: `${Math.max(b.count === 0 ? 2 : 4, (b.count / max) * 100)}%` }} />
            </div>
          ))}
        </div>
      </div>
      <figcaption className="num mt-1.5 flex justify-between text-[11px] text-faint">
        <span>{label(buckets[0]!.start)}</span>
        <span className="hidden sm:inline">{label(buckets[mid]!.start)}</span>
        <span>{label(buckets[buckets.length - 1]!.start)}</span>
      </figcaption>
    </figure>
  );
}

/** Liste de barres horizontales (sources, tranches de score). */
export function BarList({ rows }: { rows: { key: string; label: string; value: number; display: string; sub?: string; tone?: "accent" | "warn" | "danger" | "muted" }[] }) {
  const max = Math.max(1e-9, ...rows.map((r) => r.value));
  const color = { accent: "bg-accent", warn: "bg-warn", danger: "bg-danger", muted: "bg-muted" } as const;
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate">{r.label}</span>
            <span className="num shrink-0">{r.display}{r.sub ? <span className="ml-2 text-[11px] text-faint">{r.sub}</span> : null}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-[2px] bg-surface-3" role="presentation">
            <div className={cn("h-full rounded-[2px]", color[r.tone ?? "accent"])} style={{ width: `${Math.max(r.value > 0 ? 2 : 0, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Barre empilée (pipeline par statut) avec légende chiffrée. */
export function StackedBar({ parts }: { parts: { key: string; label: string; value: number; className: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-[2px] bg-surface-3" role="img" aria-label={parts.map((p) => `${p.label} : ${p.value}`).join(", ")}>
        {total > 0 ? parts.filter((p) => p.value > 0).map((p) => <div key={p.key} className={p.className} style={{ width: `${(p.value / total) * 100}%` }} title={`${p.label} : ${p.value}`} />) : null}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-5">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2 text-[12px]">
            <span className={cn("size-2 shrink-0 rounded-[2px]", p.className)} aria-hidden />
            <span className="text-muted">{p.label}</span>
            <span className="num ml-auto">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
