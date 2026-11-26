"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { importLeadsChunk, type ImportChunkResult } from "@/app/actions/leads";
import { UploadSimple } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { parseCsv, type ParsedCsv } from "@/lib/csv";
import { guessField } from "@/lib/validation";

const FIELDS = [
  { id: "email", label: "Email (obligatoire)" },
  { id: "company", label: "Entreprise (obligatoire)" },
  { id: "firstName", label: "Prénom" },
  { id: "lastName", label: "Nom" },
  { id: "name", label: "Nom complet (sera séparé)" },
  { id: "phone", label: "Téléphone" },
  { id: "jobTitle", label: "Fonction" },
  { id: "website", label: "Site web" },
  { id: "location", label: "Localisation" },
  { id: "message", label: "Message" },
  { id: "sourceDetail", label: "Détail de la source" },
] as const;

const MAX_ROWS = 300;
const CHUNK = 6;
const MAX_FILE = 2_000_000;

type Mapping = Record<number, string>; // index de colonne -> champ ("" = ignorer)

function buildRow(row: string[], mapping: Mapping): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [idx, field] of Object.entries(mapping)) {
    if (!field) continue;
    const value = (row[Number(idx)] ?? "").trim();
    if (value) out[field] = value;
  }
  if (out.name && !out.firstName && !out.lastName) {
    const [first, ...rest] = out.name.split(/\s+/);
    out.firstName = first ?? "";
    out.lastName = rest.join(" ");
  }
  delete out.name;
  return out;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function rowProblem(r: Record<string, string>): string | null {
  if (!r.email || !EMAIL_RE.test(r.email)) return "email invalide";
  if (!r.company || r.company.length < 2) return "entreprise manquante";
  return null;
}

export function CsvImporter({ maxRows }: { maxRows?: number }) {
  const rowCap = maxRows ?? MAX_ROWS;
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Mapping>({});
  const [enrich, setEnrich] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportChunkResult | null>(null);
  const cancelled = useRef(false);

  async function onFile(file: File | undefined) {
    setError(null);
    setResult(null);
    if (!file) return;
    if (file.size > MAX_FILE) return setError("Fichier trop volumineux (2 Mo maximum).");
    const text = await file.text();
    const parsed = parseCsv(text, rowCap + 1);
    if (parsed.headers.length < 2 || parsed.rows.length === 0) return setError("Fichier vide ou illisible. Vérifiez qu'il contient une ligne d'en-têtes et au moins une ligne de données.");
    setFileName(file.name);
    setCsv(parsed);
    const guess: Mapping = {};
    const used = new Set<string>();
    parsed.headers.forEach((h, i) => {
      const g = guessField(h);
      if (g && !used.has(g)) { guess[i] = g; used.add(g); } else guess[i] = "";
    });
    setMapping(guess);
  }

  const mapped = useMemo(() => (csv ? csv.rows.slice(0, rowCap).map((r) => buildRow(r, mapping)) : []), [csv, mapping, rowCap]);
  const problems = useMemo(() => mapped.map(rowProblem), [mapped]);
  const validCount = problems.filter((p) => !p) .length;
  const hasEmail = Object.values(mapping).includes("email");
  const hasCompany = Object.values(mapping).includes("company");
  const truncated = csv ? csv.rows.length > rowCap : false;

  async function run() {
    if (!csv) return;
    cancelled.current = false;
    const queue = mapped.map((data, i) => ({ row: i + 2, data })).filter((_, i) => !problems[i]);
    const total: ImportChunkResult = { created: 0, errors: mapped.flatMap((_, i) => (problems[i] ? [{ row: i + 2, message: problems[i] as string }] : [])) };
    setProgress({ done: 0, total: queue.length });
    setError(null);
    try {
      for (let i = 0; i < queue.length; i += CHUNK) {
        if (cancelled.current) break;
        const res = await importLeadsChunk(queue.slice(i, i + CHUNK), enrich);
        total.created += res.created;
        total.errors.push(...res.errors);
        setProgress({ done: Math.min(queue.length, i + CHUNK), total: queue.length });
      }
    } catch {
      setError("L'import a été interrompu (connexion ou session). Les lignes déjà traitées sont conservées.");
    }
    setResult(total);
    setProgress(null);
  }

  if (result) {
    return (
      <Panel className="max-w-2xl p-5" role="status">
        <p className="text-base font-semibold">Import terminé</p>
        <p className="mt-1 text-[14px]"><span className="num text-accent">{result.created}</span> lead{result.created > 1 ? "s" : ""} créé{result.created > 1 ? "s" : ""}, <span className="num">{result.errors.length}</span> ligne{result.errors.length > 1 ? "s" : ""} ignorée{result.errors.length > 1 ? "s" : ""}.</p>
        {result.errors.length > 0 ? (
          <ul className="mt-3 max-h-48 overflow-auto rounded-[var(--radius)] border border-line bg-surface-2 p-3 text-[12px] text-muted">
            {result.errors.slice(0, 100).map((e, i) => <li key={i}>Ligne <span className="num">{e.row}</span> : {e.message}</li>)}
          </ul>
        ) : null}
        {error ? <p role="alert" className="mt-3 text-[13px] text-danger">{error}</p> : null}
        <div className="mt-4 flex gap-2">
          <Button asChild variant="primary"><Link href="/leads">Voir la file de leads</Link></Button>
          <Button variant="secondary" onClick={() => { setResult(null); setCsv(null); setFileName(""); }}>Importer un autre fichier</Button>
        </div>
      </Panel>
    );
  }

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <Panel className="p-5">
        <label htmlFor="csv-file" className="flex cursor-pointer flex-col items-start gap-2 rounded-[var(--radius)] border border-dashed border-line-strong p-5 transition-colors hover:border-accent-line hover:bg-surface-2">
          <span className="inline-flex items-center gap-2 text-[14px] font-medium"><UploadSimple className="size-4" />{fileName || "Choisir un fichier CSV"}</span>
          <span className="text-[12px] text-muted">Séparateur virgule, point-virgule ou tabulation. Première ligne = en-têtes. {rowCap} lignes maximum par import, 2 Mo maximum.</span>
        </label>
        <input id="csv-file" type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        {error ? <p role="alert" className="mt-3 text-[13px] text-danger">{error}</p> : null}
      </Panel>

      {csv ? (
        <>
          <Panel>
            <PanelHeader title="Correspondance des colonnes" />
            <ul className="divide-y divide-line">
              {csv.headers.map((h, i) => (
                <li key={i} className="grid grid-cols-1 items-center gap-2 px-4 py-2.5 sm:grid-cols-[1fr_16rem]">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{h || `Colonne ${i + 1}`}</p>
                    <p className="truncate text-[12px] text-muted">Ex. {csv.rows[0]?.[i] || "(vide)"}</p>
                  </div>
                  <div>
                    <label className="sr-only" htmlFor={`map-${i}`}>Champ pour la colonne {h}</label>
                    <Select id={`map-${i}`} value={mapping[i] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [i]: e.target.value }))}>
                      <option value="">Ignorer cette colonne</option>
                      {FIELDS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </Select>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel>
            <PanelHeader title={`Aperçu (${Math.min(5, mapped.length)} premières lignes)`} />
            <div className="scroll-x overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-[12px]">
                <thead className="border-b border-line text-muted">
                  <tr><th className="px-4 py-2 font-medium">Ligne</th><th className="px-2 py-2 font-medium">Nom</th><th className="px-2 py-2 font-medium">Email</th><th className="px-2 py-2 font-medium">Entreprise</th><th className="px-2 py-2 font-medium">Fonction</th><th className="px-4 py-2 font-medium">Contrôle</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {mapped.slice(0, 5).map((r, i) => (
                    <tr key={i}>
                      <td className="num px-4 py-2 text-muted">{i + 2}</td>
                      <td className="px-2 py-2">{`${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "-"}</td>
                      <td className="px-2 py-2">{r.email ?? "-"}</td>
                      <td className="px-2 py-2">{r.company ?? "-"}</td>
                      <td className="px-2 py-2">{r.jobTitle ?? "-"}</td>
                      <td className={`px-4 py-2 ${problems[i] ? "text-danger" : "text-accent"}`}>{problems[i] ?? "OK"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel className="flex flex-col gap-4 p-4">
            {!hasEmail || !hasCompany ? <p role="alert" className="text-[13px] text-danger">Associez au moins une colonne à « Email » et une à « Entreprise ».</p> : null}
            {truncated ? <p className="text-[13px] text-warn">Le fichier dépasse {rowCap} lignes : seules les {rowCap} premières seront importées.</p> : null}
            <label className="flex items-start gap-2.5 text-[13px]">
              <input type="checkbox" checked={enrich} onChange={(e) => setEnrich(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
              <span>Enrichir via le registre des entreprises et les sites web{maxRows ? " (désactivé en démo publique : données fictives)" : ""}<span className="block text-[12px] text-muted">Plus lent (environ 1 à 2 secondes par lead). Les imports sont notés par règles, sans appel IA, pour maîtriser le budget.</span></span>
            </label>
            {progress ? (
              <div role="status" aria-live="polite">
                <div className="h-1.5 overflow-hidden rounded-[2px] bg-surface-3"><div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></div>
                <p className="num mt-1.5 text-[12px] text-muted">{progress.done} / {progress.total}</p>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" disabled={!hasEmail || !hasCompany || validCount === 0 || progress !== null} onClick={run}>
                {progress ? "Import en cours" : `Importer ${validCount} lead${validCount > 1 ? "s" : ""}`}
              </Button>
              {mapped.length - validCount > 0 ? <span className="text-[12px] text-muted">{mapped.length - validCount} ligne(s) invalide(s) seront ignorées.</span> : null}
              {progress ? <Button variant="ghost" onClick={() => { cancelled.current = true; }}>Arrêter</Button> : null}
            </div>
          </Panel>
        </>
      ) : null}
    </div>
  );
}
