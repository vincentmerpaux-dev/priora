"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FunnelSimple, MagnifyingGlass } from "@/components/icons";
import { Input, Select } from "@/components/ui/field";

/**
 * Filtres de la file : l'état vit dans l'URL (partageable, rechargeable).
 * Visibles : recherche, Délai, Verdict. Le reste (attribution, statut, source, score, tri) est replié derrière
 * « Plus de filtres » (bouton avec aria-expanded), qui s'ouvre tout seul si l'un de ces filtres est actif.
 */
export const SECONDARY_FILTERS = ["owner", "status", "source", "min", "sort"] as const;
export function secondaryActive(get: (key: string) => string | null | undefined): number {
  return SECONDARY_FILTERS.filter((k) => Boolean(get(k))).length;
}

export interface OwnerOption { value: string; label: string }

export function LeadFilters({ owners, ownerDefault }: { owners: OwnerOption[]; ownerDefault: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const activeCount = secondaryActive((k) => params.get(k));
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  // Automatique : ouvert dès qu'un filtre replié est actif (lien partagé, rechargement) ; le clic sur le bouton reprend la main.
  const open = manualOpen ?? activeCount > 0;
  const [q, setQ] = useState(params.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  const sel = (key: string, def = "") => params.get(key) ?? def;
  const hasFilters = ["q", "status", "source", "verdict", "min", "sort", "owner", "late"].some((k) => params.get(k));

  return (
    <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:flex xl:flex-wrap" role="search" aria-label="Filtrer les leads">
      <div className="relative col-span-2 md:col-span-3 xl:min-w-[14rem] xl:flex-1">
        <MagnifyingGlass className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <Input
          aria-label="Rechercher un lead"
          placeholder="Nom, entreprise, email"
          value={q}
          className="pl-8"
          onChange={(e) => {
            setQ(e.target.value);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => set("q", e.target.value.trim()), 300);
          }}
        />
      </div>
      <Select className="xl:w-auto" aria-label="Délai de premier contact" value={sel("late")} onChange={(e) => set("late", e.target.value)}>
        <option value="">Tous les délais</option>
        <option value="1">En retard</option>
      </Select>
      <Select className="xl:w-auto" aria-label="Verdict" value={sel("verdict")} onChange={(e) => set("verdict", e.target.value)}>
        <option value="">Tous les verdicts</option>
        <option value="call_now">Appeler maintenant</option>
        <option value="nurture">Nourrir</option>
        <option value="disqualify">Disqualifier</option>
      </Select>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="plus-de-filtres"
        onClick={() => setManualOpen(!open)}
        className="col-span-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-[var(--radius)] border border-line-strong px-3 text-[13px] text-muted hover:bg-surface-2 hover:text-fg md:col-span-3 xl:col-span-1"
      >
        <FunnelSimple className="size-4" />
        Plus de filtres{activeCount > 0 ? <span className="num rounded-full bg-accent-soft px-1.5 text-[11px] text-fg">{activeCount}</span> : null}
      </button>
      <div id="plus-de-filtres" hidden={!open} className="col-span-2 grid grid-cols-2 gap-2 md:col-span-3 md:grid-cols-3 xl:basis-full xl:grid-cols-5">
      {owners.length > 1 ? (
        <Select aria-label="Attribution" value={sel("owner", ownerDefault)} onChange={(e) => set("owner", e.target.value === ownerDefault ? "" : e.target.value)}>
          {owners.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      ) : null}
      <Select aria-label="Statut" value={sel("status", "open")} onChange={(e) => set("status", e.target.value === "open" ? "" : e.target.value)}>
        <option value="open">Leads ouverts</option>
        <option value="all">Tous les statuts</option>
        <option value="new">Nouveaux</option>
        <option value="contacted">Contactés</option>
        <option value="qualified">Qualifiés</option>
        <option value="won">Gagnés</option>
        <option value="lost">Perdus</option>
      </Select>
      <Select aria-label="Source" value={sel("source")} onChange={(e) => set("source", e.target.value)}>
        <option value="">Toutes les sources</option>
        <option value="formulaire">Formulaire</option>
        <option value="webhook">Webhook</option>
        <option value="csv">Import CSV</option>
        <option value="saisie">Saisie</option>
        <option value="email">Email</option>
        <option value="crm">CRM</option>
      </Select>
      <Select aria-label="Score minimum" value={sel("min")} onChange={(e) => set("min", e.target.value)}>
        <option value="">Tout score</option>
        <option value="70">Score 70 et plus</option>
        <option value="40">Score 40 et plus</option>
      </Select>
      <Select aria-label="Tri" value={sel("sort", "priority")} onChange={(e) => set("sort", e.target.value === "priority" ? "" : e.target.value)}>
        <option value="priority">Tri : priorité</option>
        <option value="score">Tri : score</option>
        <option value="recent">Tri : plus récents</option>
      </Select>
      </div>
      {hasFilters ? (
        <button
          type="button"
          onClick={() => { setQ(""); setManualOpen(null); router.replace(pathname, { scroll: false }); }}
          className="col-span-2 text-left text-[12px] text-muted underline underline-offset-2 hover:text-fg md:col-span-3 xl:basis-full"
        >
          Réinitialiser les filtres
        </button>
      ) : null}
    </div>
  );
}
