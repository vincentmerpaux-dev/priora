"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { ChartBar, Kanban, Lightning, Quotes, GearSix, SignOut, Info, SlidersHorizontal, UsersThree } from "@/components/icons";
import { NotificationBell, type BellItem } from "@/components/app/notification-bell";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Tour, TourLauncher } from "@/components/app/tour";
import { resetDemoAction } from "@/app/actions/demo";
import { Tag } from "@/components/ui/badges";
import { can, type Permission } from "@/lib/team/permissions";
import { ROLE_LABEL, type Role } from "@/lib/types";
import { cn } from "@/lib/utils";

interface NavItem { href: string; label: string; short: string; icon: typeof Lightning; permission?: Permission }

/** Les entrées de navigation suivent les droits du rôle. Les pages refusent de toute façon l'accès côté serveur. */
const NAV: NavItem[] = [
  { href: "/leads", label: "Leads", short: "Leads", icon: Lightning },
  { href: "/pipeline", label: "Pipeline", short: "Pipeline", icon: Kanban },
  { href: "/dashboard", label: "Tableau de bord", short: "Pilotage", icon: ChartBar, permission: "dashboard.view" },
  { href: "/calibration", label: "Calibration", short: "Calibrage", icon: SlidersHorizontal, permission: "calibration.view" },
  { href: "/objections", label: "Objections", short: "Objections", icon: Quotes },
  { href: "/team", label: "Équipe", short: "Équipe", icon: UsersThree, permission: "team.view" },
  { href: "/settings", label: "Réglages", short: "Réglages", icon: GearSix, permission: "settings.view" },
];

export interface DemoSwitch {
  current: string;
  banner: string | null;
  orgs: { key: string; label: string; hint: string }[];
  /** Membre simulé ("Voir en tant que") et membres disponibles dans l'organisation de démonstration courante. */
  asUser: string;
  users: { id: string; name: string; role: Role }[];
}

/** "Voir en tant que" : change le membre simulé en un clic pour montrer les droits de chaque rôle. Mode démonstration uniquement. */
function DemoUserSwitcher({ switcher, pathname, compact = false }: { switcher: DemoSwitch; pathname: string; compact?: boolean }) {
  const href = (id: string) => `/demo/as/${id}?next=${encodeURIComponent(pathname)}`;
  if (compact) {
    return (
      <div data-tour="as" className="flex items-center gap-2 border-b border-line bg-surface px-4 py-1.5 lg:hidden">
        <Tag tone="warn">Démo</Tag>
        <label htmlFor="as-select" className="shrink-0 text-[12px] text-muted">Voir en tant que</label>
        <select
          id="as-select"
          value={switcher.asUser}
          onChange={(e) => { window.location.href = href(e.target.value); }}
          className="h-8 min-w-0 flex-1 rounded-[var(--radius)] border border-line-strong bg-surface px-2 text-[12px] text-fg"
        >
          {switcher.users.map((u) => <option key={u.id} value={u.id}>{u.name} ({ROLE_LABEL[u.role].toLowerCase()})</option>)}
        </select>
      </div>
    );
  }
  return (
    <div data-tour="as" role="group" aria-label="Voir en tant que (démonstration)" className="flex flex-col gap-1">
      <p className="flex items-center gap-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-faint">Voir en tant que <Tag tone="warn" className="normal-case tracking-normal">Démo</Tag></p>
      {switcher.users.map((u) => {
        const on = u.id === switcher.asUser;
        return (
          <a
            key={u.id}
            href={href(u.id)}
            aria-current={on ? "true" : undefined}
            className={cn(
              "flex h-8 items-center gap-2 rounded-[var(--radius)] border px-2 text-left text-[12px] transition-colors",
              on ? "border-accent-line bg-accent-soft text-fg" : "border-line text-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            <span className={cn("size-1.5 shrink-0 rounded-full", on ? "bg-accent" : "bg-faint")} aria-hidden />
            <span className="min-w-0 flex-1 truncate font-medium">{u.name}</span>
            <span className="shrink-0 text-[11px] font-normal text-faint">{ROLE_LABEL[u.role].toLowerCase()}</span>
          </a>
        );
      })}
    </div>
  );
}

/** Sélecteur d'organisation de démonstration. Liens simples (pas de préchargement) : chaque clic change de cookie. */
function DemoOrgSwitcher({ switcher, compact = false }: { switcher: DemoSwitch; compact?: boolean }) {
  return (
    <div role="group" aria-label="Organisation de démonstration" className={cn(compact ? "flex gap-1" : "flex flex-col gap-1")}>
      {compact ? null : <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-faint">Organisation de démo</p>}
      {switcher.orgs.map((o) => {
        const on = o.key === switcher.current;
        return (
          <a
            key={o.key}
            href={`/demo/${o.key}`}
            aria-current={on ? "true" : undefined}
            title={o.hint}
            className={cn(
              "inline-flex items-center gap-2 rounded-[var(--radius)] border text-left font-medium transition-colors",
              compact ? "h-8 px-2.5 text-[12px]" : "h-10 px-2.5 text-[13px]",
              on ? "border-accent-line bg-accent-soft text-fg" : "border-line text-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            <span className={cn("size-1.5 shrink-0 rounded-full", on ? "bg-accent" : "bg-faint")} aria-hidden />
            <span className="min-w-0">
              <span className="block truncate">{o.label}</span>
              {compact ? null : <span className="block truncate text-[11px] font-normal text-faint">{o.hint}</span>}
            </span>
          </a>
        );
      })}
    </div>
  );
}

export function Shell({
  orgName, email, userName, role, demo, publicDemo = false, tour = false, demoSwitch, notifications, unread, children,
}: { orgName: string; email: string; userName: string; role: Role; demo: boolean; publicDemo?: boolean; tour?: boolean; demoSwitch?: DemoSwitch; notifications: BellItem[]; unread: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const items = NAV.filter((n) => !n.permission || can(role, n.permission));
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-[13.5rem_1fr]">
      {/* Barre latérale (desktop) */}
      <aside className="sticky top-0 hidden h-[100dvh] flex-col overflow-y-auto border-r border-line bg-surface lg:flex">
        <div className="flex h-14 items-center justify-between pl-4 pr-2"><Logo /><NotificationBell items={notifications} unread={unread} panelId="bell-desktop" /></div>
        {demoSwitch ? <div className="flex flex-col gap-3 px-2 pb-1"><DemoOrgSwitcher switcher={demoSwitch} /><DemoUserSwitcher switcher={demoSwitch} pathname={pathname} /></div> : null}
        <nav aria-label="Navigation principale" className="flex flex-1 flex-col gap-0.5 px-2 py-2">
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-[var(--radius)] px-2.5 text-[13px] font-medium transition-colors",
                active(href) ? "bg-surface-3 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              <Icon className={cn("size-4", active(href) && "text-accent")} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <p className="truncate text-[12px] font-medium" title={orgName}>{orgName}</p>
          <p className="truncate text-[11px] text-muted" title={email}>{userName} · {ROLE_LABEL[role].toLowerCase()}</p>
          {tour ? <TourLauncher className="mt-2 inline-flex h-8 w-full items-center rounded-[var(--radius)] border border-line px-2 text-[12px] text-muted hover:bg-surface-2 hover:text-fg" /> : null}
          <div className="mt-2 flex items-center justify-between">
            <ThemeToggle />
            <form action={signOut}>
              <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] px-2 text-[12px] text-muted hover:bg-surface-2 hover:text-fg">
                <SignOut className="size-4" />{demo ? "Accueil" : "Déconnexion"}
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col pb-16 lg:pb-0">
        {demoSwitch?.banner ? (
          <div role="note" className="flex items-start gap-2 border-b border-accent-line bg-accent-soft px-4 py-2 text-[12px] text-fg">
            <Info className="mt-0.5 size-3.5 shrink-0 text-accent" />
            <span className="min-w-0 flex-1"><strong className="font-semibold">Cas d&apos;étude.</strong> {demoSwitch.banner}{publicDemo ? " Bac à sable personnel, effacé après 2 h d'inactivité." : ""}</span>
            {publicDemo ? <form action={resetDemoAction}><button type="submit" className="inline-flex h-7 shrink-0 items-center rounded-[var(--radius-sm)] border border-accent-line px-2 text-[12px] font-medium hover:bg-accent/10">Réinitialiser la démo</button></form> : null}
          </div>
        ) : demo ? (
          <div role="note" className="flex items-center gap-2 border-b border-warn/30 bg-warn-soft px-4 py-1.5 text-[12px] text-warn">
            <Info className="size-3.5 shrink-0" />
            {publicDemo ? (
              <>
                <span className="min-w-0 flex-1"><strong className="font-semibold">Démo publique.</strong> Données fictives, bac à sable personnel : vos modifications ne sont vues que par vous et s&apos;effacent après 2 h d&apos;inactivité.</span>
                <form action={resetDemoAction}><button type="submit" className="inline-flex h-7 shrink-0 items-center gap-1 rounded-[var(--radius-sm)] border border-warn/40 px-2 text-[12px] font-medium hover:bg-warn/10">Réinitialiser la démo</button></form>
              </>
            ) : (
              <span><strong className="font-semibold">Données de démonstration.</strong> Entreprises et contacts fictifs, stockés en mémoire et réinitialisés au redémarrage.</span>
            )}
          </div>
        ) : null}

        {/* Barre du haut (mobile) */}
        <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-line bg-bg/90 px-4 backdrop-blur lg:hidden">
          <Logo />
          <div className="flex items-center gap-1">
            {demoSwitch ? <DemoOrgSwitcher switcher={demoSwitch} compact /> : <span className="max-w-32 truncate text-[12px] text-muted">{orgName}</span>}
            {tour ? <TourLauncher label="Visite" className="inline-flex h-8 items-center whitespace-nowrap rounded-[var(--radius)] px-2 text-[12px] text-muted hover:bg-surface-2 hover:text-fg" /> : null}
            <NotificationBell items={notifications} unread={unread} panelId="bell-mobile" />
            <ThemeToggle />
          </div>
        </header>
        {demoSwitch ? <DemoUserSwitcher switcher={demoSwitch} pathname={pathname} compact /> : null}

        <main id="contenu" tabIndex={-1} className="mx-auto w-full max-w-[1400px] outline-none flex-1 px-4 py-5 md:px-6 lg:px-8 lg:py-7">{children}</main>
      </div>

      {tour ? <Tour /> : null}

      {/* Navigation basse (mobile) */}
      <nav
        aria-label="Navigation principale"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
        className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {items.map(({ href, short: label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={active(href) ? "page" : undefined}
            className={cn("flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-medium", active(href) ? "text-fg" : "text-muted")}
          >
            <Icon className={cn("size-5", active(href) && "text-accent")} />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
