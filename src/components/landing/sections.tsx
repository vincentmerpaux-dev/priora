import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChartBar, CheckCircle, Clock, EnvelopeSimple, ListChecks, Robot, UsersThree } from "@/components/icons";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { HeroCard } from "@/components/landing/hero-card";
import { buttonVariants } from "@/components/ui/button";
import { authorLink, SITE } from "@/config/site";
import { cn } from "@/lib/utils";

/** Les liens de démo sont de simples <a> (pas de préchargement) : ils posent des cookies avant de rediriger. */
export interface Entry { demo: boolean }

const link = (key: "maintia" | "orus", demo: boolean) => (demo ? `/demo/${key}?as=admin` : "/login");

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="num mb-3 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted"><span aria-hidden className="size-1.5 rounded-full bg-accent" />{children}</p>;
}

export function SiteHeader({ demo }: Entry) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between gap-4 px-5">
        <Link href="/" aria-label="Priora, accueil"><Logo /></Link>
        <nav aria-label="Sections de la page" className="hidden items-center gap-6 text-[13px] text-muted md:flex">
          <a href="#fonctionnement" className="hover:text-fg">Fonctionnement</a>
          <a href="#fonctionnalites" className="hover:text-fg">Fonctionnalités</a>
          <a href="#calibration" className="hover:text-fg">Calibration</a>
          <a href="#a-propos" className="hover:text-fg">À propos</a>
        </nav>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <a href={link("maintia", demo)} className={buttonVariants({ variant: "primary", size: "md" })}>{demo ? "Essayer la démo" : "Se connecter"}</a>
        </div>
      </div>
    </header>
  );
}

export function Hero({ demo }: Entry) {
  return (
    <section className="relative isolate overflow-hidden border-b border-line">
      <div aria-hidden className="grid-bg absolute inset-0 -z-10 opacity-60" />
      <div className="mx-auto grid w-full max-w-[1200px] items-center gap-10 px-5 pb-14 pt-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12 lg:pb-20 lg:pt-16">
        <div className="min-w-0">
          <Eyebrow>Qualification de leads inbound</Eyebrow>
          <h1 className="text-[2.15rem] font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.4rem]">
            Sachez en 10 secondes <span className="text-accent">quel lead appeler</span>, et quoi lui dire.
          </h1>
          <p className="mt-5 max-w-[52ch] text-base leading-relaxed text-muted">
            Priora note chaque lead entrant sur 100, explique chaque point du score et prépare le script d&apos;appel de 30 secondes. Vos commerciaux rappellent les bons leads, dans le bon délai.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a href={link("maintia", demo)} className={buttonVariants({ variant: "primary", size: "lg" })}>{demo ? "Essayer la démo" : "Se connecter"}<ArrowRight /></a>
            {demo ? <a href={link("orus", demo)} className={buttonVariants({ variant: "secondary", size: "lg" })}>Voir le cas Orus</a> : null}
          </div>
          <p className="mt-4 max-w-[52ch] text-[12.5px] text-muted">
            {demo ? "Sans compte ni installation. Données fictives, dans un bac à sable à vous : rien n'est partagé avec les autres visiteurs." : "Connectez-vous pour accéder à votre espace."}
          </p>
        </div>
        <div className="min-w-0 lg:-mr-6"><HeroCard /></div>
      </div>
    </section>
  );
}

const PROBLEMS = [
  { n: "01", title: "Tous les leads se ressemblent", text: "Formulaire, email, webhook, CRM : la file mélange le décideur pressé et le curieux. Personne ne sait lequel appeler en premier, alors on prend le plus récent." },
  { n: "02", title: "Le rappel arrive trop tard", text: "Sans délai cible ni alerte, un lead chaud attend derrière trois autres. Quand on le rappelle, il a déjà parlé à un concurrent." },
  { n: "03", title: "Le score est une boîte noire", text: "Un chiffre sans explication ne convainc ni le commercial ni le manager. Et personne ne vérifie s'il prédit vraiment les ventes." },
];

export function Problem() {
  return (
    <section aria-labelledby="probleme" className="border-b border-line">
      <div className="mx-auto grid w-full max-w-[1200px] gap-8 px-5 py-16 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16 lg:py-20">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Eyebrow>Le problème</Eyebrow>
          <h2 id="probleme" className="text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">Les leads entrants sont mal priorisés, puis rappelés trop tard.</h2>
        </div>
        <ol className="m-0 flex list-none flex-col p-0">
          {PROBLEMS.map((p) => (
            <li key={p.n} className="grid grid-cols-[3rem_1fr] gap-4 border-t border-line py-6 first:border-t-0 first:pt-0 sm:grid-cols-[4rem_1fr]">
              <span className="num text-sm text-accent">{p.n}</span>
              <div>
                <h3 className="text-lg font-semibold tracking-tight">{p.title}</h3>
                <p className="mt-1.5 max-w-[60ch] text-[14.5px] leading-relaxed text-muted">{p.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const STEPS = [
  { n: "1", verb: "Capter", text: "Formulaire intégrable, webhook, email entrant, import CSV, HubSpot. Chaque lead est enrichi (registre des entreprises, site web) puis attribué automatiquement.", tags: ["Formulaire", "Webhook", "Email", "CSV", "HubSpot"] },
  { n: "2", verb: "Noter et expliquer", text: "Un score sur 100 en trois blocs : adéquation, intention, timing. Chaque point a sa raison. Puis une fiche : verdict, objections, risques, questions de découverte, script.", tags: ["Score /100", "Verdict", "Script 30 s"] },
  { n: "3", verb: "Appeler au bon moment", text: "File triée par priorité, délai de rappel cible selon le verdict, compte à rebours et alerte en cas de retard. Le manager suit les délais réels.", tags: ["Priorité", "Délai cible", "Alerte"] },
];

export function HowItWorks() {
  return (
    <section id="fonctionnement" aria-labelledby="fonctionnement-titre" className="scroll-mt-16 border-b border-line bg-surface">
      <div className="mx-auto w-full max-w-[1200px] px-5 py-16 lg:py-20">
        <Eyebrow>Comment ça marche</Eyebrow>
        <h2 id="fonctionnement-titre" className="max-w-[22ch] text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">Trois étapes, de l&apos;arrivée du lead à l&apos;appel.</h2>
        <ol className="m-0 mt-10 grid list-none gap-px overflow-hidden rounded-[var(--radius)] border border-line bg-line p-0 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="flex flex-col gap-3 bg-surface p-6">
              <span className="num text-[12px] text-muted">Étape {s.n}</span>
              <h3 className="text-xl font-semibold tracking-tight">{s.verb}</h3>
              <p className="text-[14px] leading-relaxed text-muted">{s.text}</p>
              <ul className="m-0 mt-auto flex list-none flex-wrap gap-1.5 p-0 pt-2">
                {s.tags.map((t) => <li key={t} className="num rounded-[var(--radius-sm)] border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">{t}</li>)}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Shot({ name, alt, width, height, className }: { name: string; alt: string; width: number; height: number; className?: string }) {
  // Deux captures (sombre, clair) : celle du thème actif est affichée, l'autre reste masquée et non chargée (lazy).
  return (
    <>
      <Image src={`/shots/${name}-dark.webp`} alt={alt} width={width} height={height} unoptimized loading="lazy" className={cn("hidden h-auto w-full dark:block", className)} />
      <Image src={`/shots/${name}-light.webp`} alt={alt} width={width} height={height} unoptimized loading="lazy" className={cn("h-auto w-full dark:hidden", className)} />
    </>
  );
}

function Tile({ icon: Icon, title, children, className }: { icon: typeof ChartBar; title: string; children: React.ReactNode; className?: string }) {
  return (
    <article className={cn("flex min-w-0 flex-col gap-2 bg-surface p-6", className)}>
      <Icon className="size-5 text-accent" aria-hidden />
      <h3 className="mt-1 text-lg font-semibold tracking-tight">{title}</h3>
      <div className="text-[14px] leading-relaxed text-muted">{children}</div>
    </article>
  );
}

export function Features() {
  return (
    <section id="fonctionnalites" aria-labelledby="fonctionnalites-titre" className="scroll-mt-16 border-b border-line">
      <div className="mx-auto w-full max-w-[1200px] px-5 py-16 lg:py-20">
        <Eyebrow>Fonctionnalités</Eyebrow>
        <h2 id="fonctionnalites-titre" className="max-w-[24ch] text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">Ce que Priora fait pour une équipe commerciale.</h2>
        <div className="mt-10 grid gap-px overflow-hidden rounded-[var(--radius)] border border-line bg-line md:grid-cols-6">
          <Tile icon={ListChecks} title="Score transparent" className="md:col-span-3">
            <p>Dix critères pondérés, éditables par l&apos;équipe. Chaque point affiché a sa raison en une phrase : secteur retrouvé, effectif dans la cible, urgence exprimée. Le moteur est un jeu de règles pures, testé.</p>
          </Tile>
          <Tile icon={Robot} title="Fiche d'appel IA" className="md:col-span-3">
            <p>Résumé, besoin probable, objections tirées de votre bibliothèque, risques, questions de découverte et script d&apos;ouverture de 30 secondes. L&apos;IA est optionnelle : sans clé, une analyse par règles prend le relais.</p>
          </Tile>
          <Tile icon={Clock} title="Attribution et délai de rappel" className="md:col-span-2">
            <p>Tour de rôle ou règles par segment, délai cible selon le verdict, compte à rebours, « en retard de » et notifications.</p>
          </Tile>
          <Tile icon={UsersThree} title="Rôles et droits" className="md:col-span-2">
            <p>Admin, manager, commercial. Les droits sont appliqués côté serveur : un commercial ne reçoit jamais les leads des autres.</p>
          </Tile>
          <Tile icon={EnvelopeSimple} title="Email entrant et HubSpot" className="md:col-span-2">
            <p>Un email transféré devient un lead (signature, téléphone, fonction extraits). Envoi vers HubSpot à la qualification et au gain. HubSpot est simulé dans la démo.</p>
          </Tile>
          <article className="grid min-w-0 gap-6 bg-surface p-6 md:col-span-6 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:items-center">
            <div className="flex flex-col gap-2">
              <ChartBar className="size-5 text-accent" aria-hidden />
              <h3 className="mt-1 text-lg font-semibold tracking-tight">Tableau de bord manager</h3>
              <p className="text-[14px] leading-relaxed text-muted">Volume par jour et par source, délai médian de premier contact, part des rappels dans le délai, conversion par tranche de score, classement des commerciaux. Données fictives dans la démo.</p>
            </div>
            <div className="overflow-hidden rounded-[var(--radius)] border border-line-strong">
              <Shot name="dashboard" alt="Capture du tableau de bord manager de Priora (données fictives)" width={1280} height={800} />
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

export function Calibration({ demo }: Entry) {
  return (
    <section id="calibration" aria-labelledby="calibration-titre" className="scroll-mt-16 border-b border-line bg-surface">
      <div className="mx-auto grid w-full max-w-[1200px] items-center gap-10 px-5 py-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14 lg:py-20">
        <div className="min-w-0">
          <Eyebrow>Ce qui nous distingue</Eyebrow>
          <h2 id="calibration-titre" className="text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">Le score se vérifie sur <span className="text-accent">vos ventes réelles</span>.</h2>
          <p className="mt-4 max-w-[56ch] text-[15px] leading-relaxed text-muted">
            Un score n&apos;a de valeur que s&apos;il prédit les ventes. Priora compare chaque critère au résultat des leads clos, gagnés ou perdus, puis propose de corriger les poids.
          </p>
          <ul className="m-0 mt-5 flex list-none flex-col gap-2.5 p-0 text-[14px]">
            {[
              "Taux de gain par tranche de score et par verdict",
              "Pouvoir prédictif de chaque critère, avec sa fiabilité selon l'effectif",
              "Suggestion de poids bornée à plus ou moins 25 %, sans conclusion hâtive sur un petit échantillon",
              "Aperçu avant et après, versions conservées, retour arrière en un clic",
            ].map((t) => (
              <li key={t} className="grid grid-cols-[1.25rem_1fr] gap-2"><CheckCircle className="mt-0.5 size-4 text-accent" aria-hidden /><span>{t}</span></li>
            ))}
          </ul>
          <p className="mt-5 max-w-[56ch] text-[12.5px] text-muted">Dans la démo, l&apos;historique de 90 jours est fictif : il sert à montrer la méthode, pas à prouver un résultat.</p>
          {demo ? <a href={link("maintia", demo)} className={cn(buttonVariants({ variant: "secondary", size: "md" }), "mt-5")}>Voir la calibration dans la démo<ArrowRight /></a> : null}
        </div>
        <div className="min-w-0 overflow-hidden rounded-[var(--radius)] border border-line-strong shadow-[var(--shadow)]">
          <Shot name="calibration" alt="Capture de l'écran Calibration de Priora : taux de gain par tranche de score et pouvoir prédictif de chaque critère (données fictives)" width={1280} height={800} />
        </div>
      </div>
    </section>
  );
}

export function DemoBand({ demo }: Entry) {
  if (!demo) return null;
  return (
    <section aria-labelledby="demo-titre" className="border-b border-line">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-5 py-14 md:flex-row md:items-center md:justify-between">
        <div className="max-w-[60ch]">
          <h2 id="demo-titre" className="text-2xl font-semibold tracking-tight sm:text-3xl">Dans la démo en un clic.</h2>
          <p className="mt-2 text-[14.5px] leading-relaxed text-muted">Poste administrateur, tous les écrans, « Voir en tant que » commercial ou manager, visite guidée de six étapes. Maintia est une entreprise fictive de GMAO. Le cas Orus applique le même moteur à l&apos;assurance des TPE.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a href={link("maintia", demo)} className={buttonVariants({ variant: "primary", size: "lg" })}>Essayer la démo<ArrowRight /></a>
          <a href={link("orus", demo)} className={buttonVariants({ variant: "secondary", size: "lg" })}>Voir le cas Orus</a>
        </div>
      </div>
    </section>
  );
}

export function Stack() {
  return (
    <section aria-label="Stack technique" className="border-b border-line">
      <div className="mx-auto w-full max-w-[1200px] px-5 py-6">
        <p className="num text-[12px] leading-relaxed text-muted">
          <span className="text-faint">stack</span> {SITE.stack.join(" · ")}. Moteur de score en règles pures, IA optionnelle avec repli par règles, Row Level Security sur toutes les tables.
        </p>
      </div>
    </section>
  );
}

export function About() {
  const items = [
    { key: "linkedin" as const, label: "LinkedIn" },
    { key: "github" as const, label: "GitHub" },
    { key: "email" as const, label: "Email" },
  ];
  return (
    <section id="a-propos" aria-labelledby="a-propos-titre" className="scroll-mt-16 border-b border-line bg-surface">
      <div className="mx-auto grid w-full max-w-[1200px] gap-8 px-5 py-16 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:py-20">
        <div>
          <Eyebrow>À propos</Eyebrow>
          <h2 id="a-propos-titre" className="text-2xl font-semibold tracking-tight sm:text-3xl">Conçu et développé par {SITE.author.name.split(" ")[0]}.</h2>
          <p className="mt-3 max-w-[56ch] text-[14.5px] leading-relaxed text-muted">
            Priora est un projet personnel de démonstration. Il n&apos;a pas de clients à ce jour : tous les leads, entreprises et chiffres que vous voyez dans la démo sont fictifs. Il montre ma façon d&apos;aborder la qualification des leads : un score qu&apos;on peut expliquer, un rappel rapide, une mesure sur les ventes réelles.
          </p>
        </div>
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[14px] md:pt-9">
          {items.map(({ key, label }) => {
            const l = authorLink(key);
            return (
              <li key={key} className="grid grid-cols-[5.5rem_1fr] items-baseline gap-3 border-b border-line pb-2">
                <span className="num text-[12px] text-muted">{label}</span>
                {l ? (
                  <a href={l.href} {...(key === "email" ? {} : { target: "_blank", rel: "noopener noreferrer" })} className="min-w-0 truncate text-fg underline decoration-line-strong underline-offset-4 hover:decoration-accent">{l.label}</a>
                ) : (
                  <span className="min-w-0 text-warn">À renseigner dans src/config/site.ts</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function SiteFooter({ demo }: Entry) {
  return (
    <footer className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-5 py-8 text-[12.5px] text-muted md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-1">
        <Logo />
        <p>Projet de démonstration, aucune donnée réelle. Leads, entreprises et SIREN (999...) fictifs.</p>
      </div>
      <nav aria-label="Pied de page" className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {demo ? <a href={link("maintia", demo)} className="hover:text-fg">Démo</a> : <Link href="/login" className="hover:text-fg">Connexion</Link>}
        <Link href="/legal/confidentialite" className="hover:text-fg">Confidentialité</Link>
        <Link href="/legal/cgu" className="hover:text-fg">Conditions d&apos;utilisation</Link>
      </nav>
    </footer>
  );
}
