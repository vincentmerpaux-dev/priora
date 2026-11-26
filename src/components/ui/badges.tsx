import type { LeadSourceType, LeadStatus, Verdict } from "@/lib/types";
import { verdictLabel } from "@/lib/scoring/engine";
import { cn } from "@/lib/utils";

export function Tag({ children, tone = "neutral", className, title }: { children: React.ReactNode; tone?: "neutral" | "accent" | "warn" | "danger"; className?: string; title?: string }) {
  const tones = {
    neutral: "border-line bg-surface-2 text-muted",
    accent: "border-accent-line bg-accent-soft text-accent",
    warn: "border-warn/40 bg-warn-soft text-warn",
    danger: "border-danger/40 bg-danger-soft text-danger",
  } as const;
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-1.5 py-0.5 text-[11px] font-medium leading-4", tones[tone], className)}>
      {children}
    </span>
  );
}

export function VerdictBadge({ verdict, className }: { verdict: Verdict | null; className?: string }) {
  if (!verdict) return <Tag className={className}>Non analysé</Tag>;
  const tone = verdict === "call_now" ? "accent" : verdict === "nurture" ? "warn" : "danger";
  return <Tag tone={tone} className={className}>{verdictLabel(verdict)}</Tag>;
}

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "Nouveau", contacted: "Contacté", qualified: "Qualifié", won: "Gagné", lost: "Perdu",
};
export const SOURCE_LABEL: Record<LeadSourceType, string> = {
  formulaire: "Formulaire", webhook: "Webhook", csv: "Import CSV", saisie: "Saisie", email: "Email", crm: "CRM",
};

export function StatusTag({ status }: { status: LeadStatus }) {
  const tone = status === "won" ? "accent" : status === "lost" ? "danger" : status === "new" ? "neutral" : "warn";
  return <Tag tone={status === "contacted" || status === "qualified" ? "neutral" : tone}>{STATUS_LABEL[status]}</Tag>;
}

/** Couleur du score : seuils identiques à ceux du verdict (70 / 40). */
export function scoreTone(total: number | null): "accent" | "warn" | "danger" | "neutral" {
  if (total === null) return "neutral";
  return total >= 70 ? "accent" : total >= 40 ? "warn" : "danger";
}

export function ScoreNumber({ value, size = "md" }: { value: number | null; size?: "sm" | "md" | "xl" }) {
  const tone = scoreTone(value);
  const color = { accent: "text-accent", warn: "text-warn", danger: "text-danger", neutral: "text-muted" }[tone];
  const sizes = { sm: "text-sm", md: "text-lg", xl: "text-5xl" }[size];
  return (
    <span className={cn("num font-semibold leading-none", color, sizes)} aria-label={value === null ? "Score indisponible" : `Score ${value} sur 100`}>
      {value ?? "--"}
    </span>
  );
}

export function ScoreBar({ points, max, tone }: { points: number; max: number; tone?: "accent" | "warn" | "danger" }) {
  const ratio = max > 0 ? Math.min(1, points / max) : 0;
  const auto = tone ?? (ratio >= 0.7 ? "accent" : ratio >= 0.35 ? "warn" : "danger");
  const color = { accent: "bg-accent", warn: "bg-warn", danger: "bg-danger" }[auto];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-[2px] bg-surface-3" role="presentation">
      <div className={cn("bar-fill h-full rounded-[2px]", color)} style={{ width: `${Math.max(ratio * 100, ratio > 0 ? 2 : 0)}%` }} />
    </div>
  );
}
