"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { ChartBar, Kanban, Lightning, Quotes, GearSix, SignOut, Info } from "@/components/icons";
import { NotificationBell, type BellItem } from "@/components/app/notification-bell";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Tour, TourLauncher } from "@/components/app/tour";
import { resetDemoAction } from "@/app/actions/demo";
import { Tag } from "@/components/ui/badges";
import { activeGroup, navFor, tabActive, type GroupId, type Tab } from "@/lib/nav";
import { ROLE_LABEL, type Role } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICON: Record<GroupId, typeof Lightning> = { leads: Lightning, pipeline: Kanban, pilotage: ChartBar, reglages: GearSix };

export interface DemoSwitch {
  current: string;
  banner: string | null;
  orgs: { key: string; label: string; hint: string }[];
  /** Membre simulé ("Voir en tant que") et membres disponibles dans l'organisation de démonstration courante. */
  asUser: string;
  users: { id: string; name: string; role: Role }[];
}

/** Route handler qui pose un cookie puis redirige : navigation complète voulue (pas de routeur client). */
function go(url: string) {
  window.location.href = url;
}

const selectCls = "h-8 min-w-0 w-full rounded-[var(--radius)] border border-line-strong bg-surface px-2 text-[12px] text-fg";

/**
 * Sélecteurs de démonstration, compacts : organisation et "Voir en tant que" (membre simulé, pour montrer les droits de chaque rôle).
 * Deux listes natives (clavier et lecteur d'écran gratuits). Mode démonstration uniquement.
 */
function DemoSwitchers({ switcher, pathname, row = false }: { switcher: DemoSwitch; pathname: string; row?: boolean }) {
  const asHref = (id: string) => `/demo/as/${id}?next=${encodeURIComponent(pathname)}`;
  return (
    <div data-tour="as" role="group" aria-label="Démonstration" className={cn(row ? "flex items-center gap-2 border-b border-line bg-surface px-4 py-1.5 lg:hidden" : "flex flex-col gap-1.5")}>
      <Tag tone="warn" className={row ? undefined : "self-start"}>Démo</Tag>
      <div className={cn("min-w-0", row ? "grid flex-1 grid-cols-2 gap-2" : "flex flex-col gap-1.5")}>
        <select
          aria-label="Organisation de démonstration"
          value={switcher.current}
          onChange={(e) => { go(`/demo/${e.target.value}`); }}
          className={selectCls}
        >
          {switcher.orgs.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <select
          aria-label="Voir en tant que"
          value={switcher.asUser}
          onChange={(e) => { go(asHref(e.target.value)); }}
          className={selectCls}
        >
          {switcher.users.map((u) => <option key={u.id} value={u.id}>{u.name} ({ROLE_LABEL[u.role].toLowerCase()})</option>)}
        </select>
      </div>
    </div>
  );
}

/** Onglets d'un groupe (Pilotage, Réglages) : liens simples, chaque onglet reste une URL à part entière. */
function SectionTabs({ tabs, pathname }: { tabs: Tab[]; pathname: string }) {
  return (
    <nav aria-label="Sections" className="scroll-x -mt-1 mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => {
        const on = tabActive(pathname, t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex h-10 shrink-0 items-center border-b-2 px-3 text-[13px] font-medium transition-colors",
              on ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Shell({
  orgName, email, userName, role, demo, publicDemo = false, tour = false, demoSwitch, notifications, unread, children,
}: { orgName: string; email: string; userName: string; role: Role; demo: boolean; publicDemo?: boolean; tour?: boolean; demoSwitch?: DemoSwitch; notifications: BellItem[]; unread: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const groups = navFor(role);
  const current = activeGroup(groups, pathname);
  const items = groups.map((g) => ({ id: g.id, href: g.tabs[0]!.href, label: g.label, short: g.short, icon: g.id === "reglages" && g.label === "Objections" ? Quotes : ICON[g.id] }));
  const active = (id: GroupId) => current?.id === id;

  return (
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-[13.5rem_1fr]">
      {/* Barre latérale (desktop) */}
      <aside className="sticky top-0 hidden h-[100dvh] flex-col overflow-y-auto border-r border-line bg-surface lg:flex">
        <div className="flex h-14 items-center justify-between pl-4 pr-2"><Logo /><NotificationBell items={notifications} unread={unread} panelId="bell-desktop" /></div>
        {demoSwitch ? <div className="px-3 pb-1"><DemoSwitchers switcher={demoSwitch} pathname={pathname} /></div> : null}
        <nav aria-label="Navigation principale" className="flex flex-1 flex-col gap-0.5 px-2 py-2">
          {items.map(({ id, href, label, icon: Icon }) => (
            <Link
              key={id}
              href={href}
              aria-current={active(id) ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-[var(--radius)] px-2.5 text-[13px] font-medium transition-colors",
                active(id) ? "bg-surface-3 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              <Icon className={cn("size-4", active(id) && "text-accent")} />
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
            {demoSwitch ? null : <span className="max-w-32 truncate text-[12px] text-muted">{orgName}</span>}
            {tour ? <TourLauncher label="Visite" className="inline-flex h-8 items-center whitespace-nowrap rounded-[var(--radius)] px-2 text-[12px] text-muted hover:bg-surface-2 hover:text-fg" /> : null}
            <NotificationBell items={notifications} unread={unread} panelId="bell-mobile" />
            <ThemeToggle />
          </div>
        </header>
        {demoSwitch ? <DemoSwitchers switcher={demoSwitch} pathname={pathname} row /> : null}

        <main id="contenu" tabIndex={-1} className="mx-auto w-full max-w-[1400px] outline-none flex-1 px-4 py-5 md:px-6 lg:px-8 lg:py-7">
          {current && current.tabs.length > 1 ? <SectionTabs tabs={current.tabs} pathname={pathname} /> : null}
          {children}
        </main>
      </div>

      {tour ? <Tour canPilot={navFor(role).some((g) => g.id === "pilotage")} /> : null}

      {/* Navigation basse (mobile) */}
      <nav
        aria-label="Navigation principale"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
        className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {items.map(({ id, href, short: label, icon: Icon }) => (
          <Link
            key={id}
            href={href}
            aria-current={active(id) ? "page" : undefined}
            className={cn("flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[11px] font-medium", active(id) ? "text-fg" : "text-muted")}
          >
            <Icon className={cn("size-5", active(id) && "text-accent")} />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
