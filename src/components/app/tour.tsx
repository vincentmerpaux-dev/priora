"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "@/components/icons";
import { Button } from "@/components/ui/button";

/**
 * Visite guidée de la démo : panneau flottant (pas de surimpression bloquante, pas de bibliothèque), 6 étapes.
 * Accessible au clavier (boutons natifs, Échap pour fermer), l'élément expliqué est entouré d'un trait (CSS).
 * Mémorisée en localStorage (avec try/catch : navigation privée ou stockage bloqué sans conséquence).
 * Désactivable : PRIORA_DISABLE_TOUR=true côté serveur, ou « Fermer » (ne revient plus tout seul).
 */
const STORAGE_KEY = "priora-tour-v1";
export const TOUR_OPEN_EVENT = "priora-tour-open";

interface Step {
  title: string;
  body: string;
  /** Page où l'étape se déroule. */
  href?: string;
  /** Élément à entourer (premier élément visible correspondant). */
  target?: string;
  /** Rappel de rôle quand l'écran dépend des droits. */
  hint?: string;
}

const STEPS: Step[] = [
  {
    title: "La file est déjà priorisée",
    body: "Chaque lead reçoit un score sur 100 et un verdict : appeler maintenant, nourrir ou disqualifier. Les plus chauds et les plus anciens remontent en haut, avec le délai de rappel.",
    href: "/leads",
    target: '[data-tour="queue"]',
  },
  {
    title: "La fiche lead dit quoi faire",
    body: "Score détaillé justifié point par point, verdict argumenté, script d'ouverture de 30 secondes, objections probables et questions de découverte.",
  },
  {
    title: "Voir en tant que",
    body: "Changez de poste en un clic : un commercial ne voit que ses leads, le manager pilote, l'admin règle. Les droits sont appliqués côté serveur, pas seulement masqués.",
    target: '[data-tour="as"]',
  },
  {
    title: "Le tableau de bord du manager",
    body: "Volume par source, délai médian de premier contact, conversion par tranche de score, classement des commerciaux. Données fictives, calculées comme en production.",
    href: "/dashboard",
    hint: "Réservé aux postes manager et admin.",
  },
  {
    title: "La calibration : le score se vérifie",
    body: "Priora compare le score aux ventes réelles : quels critères prédisent vraiment un gain, lesquels n'ont aucun effet. Une suggestion de poids, un aperçu avant et après, un retour arrière possible.",
    href: "/calibration",
    hint: "Réservé aux postes manager et admin.",
  },
  {
    title: "À vous de jouer",
    body: "Déplacez un lead dans le pipeline, créez-en un, changez de poste. Rien n'est partagé avec les autres visiteurs, et le bouton Réinitialiser remet tout à zéro. Le Cas Orus montre une autre configuration.",
    href: "/pipeline",
  },
];

interface Saved { step: number; done: boolean }

function read(): Saved | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Saved>;
    return { step: Math.min(Math.max(Number(v.step) || 0, 0), STEPS.length - 1), done: v.done === true };
  } catch {
    return null;
  }
}
function write(v: Saved) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  } catch {
    /* stockage indisponible : la visite reste utilisable, sans mémoire */
  }
}

/** Premier élément visible (le sélecteur peut viser une version desktop et une version mobile du même bloc). */
function findVisible(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) if (el.getClientRects().length > 0) return el;
  return null;
}

export function Tour() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const focusOnOpen = useRef(false);

  // Première visite : la visite s'ouvre toute seule, une seule fois.
  useEffect(() => {
    const saved = read();
    if (saved?.done) return;
    const t = window.setTimeout(() => {
      setStep(saved?.step ?? 0);
      setOpen(true);
      if (!saved) write({ step: 0, done: false });
    }, saved ? 0 : 900);
    return () => window.clearTimeout(t);
  }, []);

  // Relance depuis le bouton « Visite guidée ».
  useEffect(() => {
    const onOpen = () => { focusOnOpen.current = true; setStep(0); setOpen(true); write({ step: 0, done: false }); };
    window.addEventListener(TOUR_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(TOUR_OPEN_EVENT, onOpen);
  }, []);

  const close = useCallback((done: boolean) => {
    setOpen(false);
    write({ step, done });
  }, [step]);

  const go = useCallback((next: number) => {
    const n = Math.min(Math.max(next, 0), STEPS.length - 1);
    setStep(n);
    write({ step: n, done: false });
    const s = STEPS[n]!;
    if (s.href && pathname !== s.href) router.push(s.href);
    // Étape « fiche lead » : ouvre le lead le plus prioritaire de la file.
    if (n === 1) {
      const link = findVisible('a[href^="/leads/"]:not([href="/leads/new"]):not([href="/leads/import"])');
      const href = link?.getAttribute("href");
      router.push(href ?? "/leads");
    }
  }, [pathname, router]);

  // Entoure l'élément de l'étape (avec quelques tentatives : la page peut encore être en cours de chargement).
  useEffect(() => {
    if (!open) return;
    const selector = STEPS[step]?.target;
    if (!selector) return;
    let el: HTMLElement | null = null;
    let tries = 0;
    const timers: number[] = [];
    const attempt = () => {
      el = findVisible(selector);
      if (el) {
        el.setAttribute("data-tour-highlight", "true");
        // Un grand bloc (la file entière) n'est pas recentré : seuls les petits éléments hors écran le sont.
        if (el.getBoundingClientRect().height < window.innerHeight * 0.8) el.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      } else if (tries++ < 8) timers.push(window.setTimeout(attempt, 250));
    };
    attempt();
    return () => { timers.forEach(window.clearTimeout); el?.removeAttribute("data-tour-highlight"); };
  }, [open, step, pathname]);

  useEffect(() => {
    if (open && focusOnOpen.current) { focusOnOpen.current = false; panelRef.current?.focus(); }
  }, [open]);

  if (!open) return null;
  const s = STEPS[step]!;
  const last = step === STEPS.length - 1;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="tour-title"
      tabIndex={-1}
      onKeyDown={(e) => { if (e.key === "Escape") close(false); }}
      className="rise fixed inset-x-3 bottom-[4.5rem] z-50 rounded-[var(--radius)] border border-accent-line bg-surface p-4 shadow-[var(--shadow)] outline-none sm:left-auto sm:right-4 sm:w-[22rem] lg:bottom-5 lg:right-5"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="num text-[11px] text-muted" aria-live="polite">Visite guidée · {step + 1} / {STEPS.length}</p>
        <button
          type="button"
          onClick={() => close(true)}
          aria-label="Fermer la visite guidée"
          className="-mr-1.5 -mt-1.5 inline-flex size-8 items-center justify-center rounded-[var(--radius)] text-muted hover:bg-surface-2 hover:text-fg"
        >
          <X className="size-4" />
        </button>
      </div>
      <h2 id="tour-title" className="mt-1 text-[15px] font-semibold tracking-tight">{s.title}</h2>
      <p className="mt-1.5 text-[13px] text-muted">{s.body}</p>
      {s.hint ? <p className="mt-1.5 text-[12px] text-faint">{s.hint}</p> : null}
      <div className="mt-3 flex items-center gap-1" aria-hidden>
        {STEPS.map((_, i) => <span key={i} className={i === step ? "h-1 w-5 rounded-full bg-accent" : "h-1 w-1.5 rounded-full bg-line-strong"} />)}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => go(step - 1)} disabled={step === 0}><ArrowLeft />Précédent</Button>
        {last ? (
          <Button variant="primary" size="sm" onClick={() => close(true)}>Terminer</Button>
        ) : (
          <Button variant="primary" size="sm" onClick={() => go(step + 1)}>Suivant<ArrowRight /></Button>
        )}
      </div>
    </div>
  );
}

/** Bouton de relance (barre latérale et barre mobile). */
export function TourLauncher({ className, label = "Visite guidée" }: { className?: string; label?: string }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(TOUR_OPEN_EVENT))} className={className}>
      {label}
    </button>
  );
}
