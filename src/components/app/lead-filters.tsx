"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MagnifyingGlass } from "@/components/icons";
import { Input, Select } from "@/components/ui/field";

/** Filtres de la file : l'état vit dans l'URL (partageable, rechargeable). */
export interface OwnerOption { value: string; label: string }

export function LeadFilters({ owners, ownerDefault }: { owners: OwnerOption[]; ownerDefault: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
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
      {owners.length > 1 ? (
        <Select className="xl:w-auto" aria-label="Attribution" value={sel("owner", ownerDefault)} onChange={(e) => set("owner", e.target.value === ownerDefault ? "" : e.target.value)}>
          {owners.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      ) : null}
      <Select className="xl:w-auto" aria-label="Délai de premier contact" value={sel("late")} onChange={(e) => set("late", e.target.value)}>
        <option value="">Tous les délais</option>
        <option value="1">En retard</option>
      </Select>
      <Select className="xl:w-auto" aria-label="Statut" value={sel("status", "open")} onChange={(e) => set("status", e.target.value === "open" ? "" : e.target.value)}>
        <option value="open">Leads ouverts</option>
        <option value="all">Tous les statuts</option>
        <option value="new">Nouveaux</option>
        <option value="contacted">Contactés</option>
        <option value="qualified">Qualifiés</option>
        <option value="won">Gagnés</option>
        <option value="lost">Perdus</option>
      </Select>
      <Select className="xl:w-auto" aria-label="Verdict" value={sel("verdict")} onChange={(e) => set("verdict", e.target.value)}>
        <option value="">Tous les verdicts</option>
        <option value="call_now">Appeler maintenant</option>
        <option value="nurture">Nourrir</option>
        <option value="disqualify">Disqualifier</option>
      </Select>
      <Select className="xl:w-auto" aria-label="Source" value={sel("source")} onChange={(e) => set("source", e.target.value)}>
        <option value="">Toutes les sources</option>
        <option value="formulaire">Formulaire</option>
        <option value="webhook">Webhook</option>
        <option value="csv">Import CSV</option>
        <option value="saisie">Saisie</option>
        <option value="email">Email</option>
        <option value="crm">CRM</option>
      </Select>
      <Select className="xl:w-auto" aria-label="Score minimum" value={sel("min")} onChange={(e) => set("min", e.target.value)}>
        <option value="">Tout score</option>
        <option value="70">Score 70 et plus</option>
        <option value="40">Score 40 et plus</option>
      </Select>
      <Select className="xl:w-auto" aria-label="Tri" value={sel("sort", "priority")} onChange={(e) => set("sort", e.target.value === "priority" ? "" : e.target.value)}>
        <option value="priority">Tri : priorité</option>
        <option value="score">Tri : score</option>
        <option value="recent">Tri : plus récents</option>
      </Select>
      {hasFilters ? (
        <button
          type="button"
          onClick={() => { setQ(""); router.replace(pathname, { scroll: false }); }}
          className="col-span-2 text-left text-[12px] text-muted underline underline-offset-2 hover:text-fg md:col-span-3 xl:basis-full"
        >
          Réinitialiser les filtres
        </button>
      ) : null}
    </div>
  );
}
