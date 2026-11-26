import { ScoreBar, ScoreNumber, Tag } from "@/components/ui/badges";
import { buildDemoData } from "@/lib/demo/data";
import { verdictLabel } from "@/lib/scoring/engine";
import type { CriterionCategory } from "@/lib/types";

/**
 * Reproduction de la fiche lead pour la page d'accueil. Les valeurs viennent du vrai moteur de score et de la
 * vraie analyse sur un lead FICTIF de la démo (entreprise inventée, domaine .example) : rien n'est saisi à la main.
 */
const CATEGORY_TITLE: Record<CriterionCategory, string> = { fit: "Adéquation", intent: "Intention", timing: "Timing", risk: "Risques" };

let cache: ReturnType<typeof compute> | null = null;

function compute() {
  const d = buildDemoData();
  // Un lead à 75/100 : assez haut pour être « à appeler », assez nuancé pour montrer des points partiels.
  const lead = d.leads.find((l) => l.lastName === "Sabatier") ?? d.leads[1]!;
  const score = d.scores.filter((s) => s.leadId === lead.id).at(-1)!;
  const analysis = d.analyses.filter((a) => a.leadId === lead.id).at(-1)!.content;
  return { lead, score, analysis };
}

export function HeroCard() {
  const { lead, score, analysis } = (cache ??= compute());
  const cats = (["fit", "intent", "timing"] as CriterionCategory[]).filter((c) => (score.breakdown[c]?.max ?? 0) > 0);
  const rows = [...score.details].sort((a, b) => b.points / (b.max || 1) - a.points / (a.max || 1)).slice(0, 6);
  const ordered = score.details.filter((d) => rows.includes(d));

  return (
    <figure aria-label="Exemple de fiche lead dans Priora (lead fictif)" className="rise m-0 overflow-hidden rounded-[var(--radius)] border border-line-strong bg-surface shadow-[var(--shadow)]">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-3.5 py-2">
        <p className="num truncate text-[11px] text-muted">priora / leads / <span className="text-fg">{lead.firstName.toLowerCase()}-{lead.lastName.toLowerCase()}</span></p>
        <Tag tone="warn" className="shrink-0">Exemple fictif</Tag>
      </div>

      <div className="grid gap-px bg-line md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* Colonne gauche : identité, verdict, script */}
        <div className="flex min-w-0 flex-col gap-4 bg-surface p-4">
          <div>
            <p className="text-[15px] font-semibold tracking-tight">{lead.firstName} {lead.lastName}</p>
            <p className="text-[12px] text-muted">{lead.jobTitle} chez {lead.company}</p>
          </div>
          <div className="rounded-[var(--radius)] border border-accent-line bg-accent-soft p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Verdict</p>
            <p className="mt-0.5 text-lg font-semibold tracking-tight">{verdictLabel(analysis.verdict.decision)}</p>
            <p className="mt-0.5 text-[12px]">{analysis.verdict.reason}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Script d&apos;ouverture (30 secondes)</p>
            <p className="mt-1.5 line-clamp-6 text-[12.5px] leading-relaxed text-fg/90">{analysis.openingScript}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Objection probable</p>
            <p className="mt-1 text-[12.5px] font-medium">« {analysis.objections[0]?.objection} »</p>
          </div>
        </div>

        {/* Colonne droite : score détaillé */}
        <div className="min-w-0 bg-surface p-4">
          <div className="flex items-end gap-2">
            <ScoreNumber value={score.total} size="xl" />
            <span className="num pb-1 text-sm text-muted">/ 100</span>
          </div>
          <div className="mt-3 grid gap-2.5" style={{ gridTemplateColumns: `repeat(${cats.length}, minmax(0, 1fr))` }}>
            {cats.map((c) => (
              <div key={c}>
                <p className="text-[11px] text-muted">{CATEGORY_TITLE[c]}</p>
                <p className="num text-[12px]">{Math.round(score.breakdown[c]?.points ?? 0)}<span className="text-faint"> / {Math.round(score.breakdown[c]?.max ?? 0)}</span></p>
                <div className="mt-1"><ScoreBar points={score.breakdown[c]?.points ?? 0} max={score.breakdown[c]?.max ?? 0} /></div>
              </div>
            ))}
          </div>
          <ul className="mt-4 flex flex-col gap-3 border-t border-line pt-3.5">
            {ordered.map((d) => (
              <li key={d.key}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12.5px] font-medium">{d.label}</span>
                  <span className="num text-[11px]">{Math.round(d.points)}<span className="text-faint"> / {Math.round(d.max)}</span></span>
                </div>
                <div className="my-1"><ScoreBar points={d.points} max={d.max} /></div>
                <p className="text-[11.5px] leading-snug text-muted">{d.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <figcaption className="border-t border-line bg-surface-2 px-3.5 py-2 text-[11px] text-faint">
        Lead inventé (domaine .example). Score, raisons et script produits par le moteur de Priora, sans retouche.
      </figcaption>
    </figure>
  );
}
