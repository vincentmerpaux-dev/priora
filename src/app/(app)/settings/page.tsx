import Link from "next/link";
import { OrgNameForm, IcpSettings, WebhookPanel } from "@/components/app/settings-forms";
import { CopyButton } from "@/components/app/lead-controls";
import { Tag } from "@/components/ui/badges";
import { PageHeader, Panel, PanelHeader } from "@/components/ui/panel";
import { aiConfigured, aiModel } from "@/lib/ai/analyze";
import { appUrl } from "@/lib/supabase/env";
import { TeamSettingsForm } from "@/components/app/team-settings-form";
import { InboundEmailPanel } from "@/components/app/inbound-settings";
import { HubSpotPanel } from "@/components/app/integrations-panel";
import { secretsStatus } from "@/lib/integrations/secrets";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/team/permissions";

export const metadata = { title: "Réglages" };

export default async function SettingsPage() {
  const { repo, session } = await requirePermission("settings.view");
  const manageIntegrations = can(session.role, "integrations.manage");
  const [org, icp, sources, key, teamSettings, members, inboundKey, integration, syncLogs] = await Promise.all([
    repo.getOrganization(session.orgId),
    repo.getIcp(session.orgId),
    repo.listSources(session.orgId),
    repo.getWebhookKeyInfo(session.orgId),
    repo.getOrgSettings(session.orgId),
    repo.listMembers(session.orgId),
    repo.getInboundKeyInfo(session.orgId),
    manageIntegrations ? repo.getIntegration(session.orgId, "hubspot") : Promise.resolve(null),
    manageIntegrations ? repo.listSyncLogs(session.orgId, 30) : Promise.resolve([]),
  ]);
  const secrets = session.mode === "supabase" ? secretsStatus() : ({ ok: true } as const);
  const base = appUrl();
  const formUrl = `${base}/f/${org?.slug ?? ""}`;
  const iframe = `<iframe src="${formUrl}" title="Formulaire de contact" width="100%" height="760" style="border:0;max-width:640px" loading="lazy"></iframe>`;
  const { orgId: _o, ...icpValues } = icp;
  void _o;
  const edit = can(session.role, "settings.manage");
  const { orgId: _s, ...teamValues } = teamSettings;
  void _s;

  return (
    <>
      <PageHeader title="Réglages" description={edit ? "Cible idéale, personas, critères de score, attribution des leads, sources et accès webhook." : "Lecture seule : seuls les administrateurs modifient les réglages."} />

      <nav aria-label="Aller à une section de la page" className="scroll-x mb-5 flex gap-1 overflow-x-auto border-b border-line pb-2 text-[13px]">
        {[["organisation", "Organisation"], ["cible", "Cible, personas, critères"], ["equipe", "Attribution et délais"], ["sources", "Sources"], ["email", "Email entrant"], ["webhook", "Webhook"], ...(manageIntegrations ? [["integrations", "Intégrations"]] : []), ["ia", "IA et légal"]].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="shrink-0 rounded-[var(--radius)] px-3 py-1.5 text-muted hover:bg-surface-2 hover:text-fg">{label}</a>
        ))}
      </nav>

      <div className="flex max-w-3xl flex-col gap-6">
        <Panel id="organisation" className="scroll-mt-20">
          <PanelHeader title="Organisation" />
          <div className="p-4">
            <OrgNameForm name={org?.name ?? ""} canEdit={edit} />
            <p className="mt-4 text-[12px] text-muted">Identifiant du formulaire public : <code className="num text-fg">{org?.slug}</code></p>
            {edit ? <p className="mt-2 text-[12px] text-muted">Pour reprendre le parcours guidé : <Link href="/onboarding" className="text-fg underline underline-offset-2">relancer la configuration</Link>.</p> : null}
          </div>
        </Panel>

        <Panel id="cible" className="scroll-mt-20">
          <PanelHeader title="Cible idéale, personas et critères de score" />
          <div className="p-4"><IcpSettings initial={icpValues} canEdit={edit} /></div>
        </Panel>

        <Panel id="equipe" className="scroll-mt-20">
          <PanelHeader title="Attribution des leads et délais de contact" />
          <div className="p-4">
            <TeamSettingsForm initial={teamValues} canEdit={edit} sales={members.filter((m) => m.role === "commercial").map((m) => ({ id: m.userId, name: m.name, active: m.active }))} />
            <p className="mt-4 text-[12px] text-muted">Membres et rôles : <Link href="/team" className="text-fg underline underline-offset-2">page Équipe</Link>.</p>
          </div>
        </Panel>

        <Panel id="sources" className="scroll-mt-20">
          <PanelHeader title="Sources de leads" />
          <ul className="divide-y divide-line">
            {sources.map((s) => (
              <li key={s.type} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="text-[13px] font-medium">{s.label}</p>
                  <p className="num text-[12px] text-muted">{s.leadCount} lead{s.leadCount > 1 ? "s" : ""}</p>
                </div>
                {s.enabled ? <Tag tone="accent">Actif</Tag> : <Tag>Prévu (version suivante)</Tag>}
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-4 border-t border-line p-4">
            <div>
              <p className="text-[13px] font-medium">Formulaire public</p>
              <p className="mt-1 text-[12px] text-muted">Page autonome, à partager ou à intégrer sur votre site. Ajoutez <code className="num">?theme=light</code> pour le thème clair.</p>
              <div className="mt-2 flex items-center gap-2 rounded-[var(--radius)] border border-line bg-surface-2 px-3 py-2">
                <a href={formUrl} target="_blank" rel="noopener" className="num min-w-0 flex-1 truncate text-[12px] underline-offset-2 hover:underline">{formUrl}</a>
                <CopyButton text={formUrl} />
              </div>
              <div className="mt-3 flex items-center justify-between"><p className="text-[12px] text-muted">Code à intégrer (iframe)</p><CopyButton text={iframe} label="Copier le code" /></div>
              <pre className="num scroll-x mt-1 overflow-x-auto rounded-[var(--radius)] border border-line bg-surface-2 p-3 text-[11px] leading-relaxed">{iframe}</pre>
            </div>
            <p className="text-[12px] text-muted">
              Import de fichier : <Link href="/leads/import" className="text-fg underline underline-offset-2">importer un CSV</Link>. Saisie à la main : <Link href="/leads/new" className="text-fg underline underline-offset-2">nouveau lead</Link>.
            </p>
          </div>
        </Panel>

        <Panel id="email" className="scroll-mt-20">
          <PanelHeader title="Email entrant" action={inboundKey.prefix ? <Tag tone="accent">Actif</Tag> : <Tag>Clé à générer</Tag>} />
          <div className="p-4">
            <InboundEmailPanel prefix={inboundKey.prefix} createdAt={inboundKey.createdAt} endpointBase={`${base}/api/inbound/email`} canEdit={edit} />
          </div>
        </Panel>

        <Panel id="webhook" className="scroll-mt-20">
          <PanelHeader title="Webhook entrant" />
          <div className="p-4">
            <WebhookPanel prefix={key.prefix} createdAt={key.createdAt} endpoint={`${base}/api/webhooks/leads`} canEdit={edit} />
          </div>
        </Panel>

        {manageIntegrations ? (
          <Panel id="integrations" className="scroll-mt-20">
            <PanelHeader title="Intégrations" />
            <div className="p-4">
              <HubSpotPanel info={integration} logs={syncLogs} demo={session.mode === "demo"} unavailableReason={secrets.ok ? null : secrets.reason} />
            </div>
          </Panel>
        ) : null}

        <Panel id="ia" className="scroll-mt-20">
          <PanelHeader title="IA et documents légaux" />
          <div className="flex flex-col gap-3 p-4 text-[13px]">
            <p className="flex flex-wrap items-center gap-2">
              Analyse IA :
              {aiConfigured() ? <Tag tone="accent">Active ({aiModel()})</Tag> : <Tag tone="warn">Clé Anthropic absente : analyse par règles</Tag>}
            </p>
            <p className="text-muted">Une analyse est créée par lead à son arrivée et conservée. Elle n&apos;est relancée que manuellement depuis la fiche du lead.</p>
            <p>
              <Link href="/legal/cgu" className="underline underline-offset-2">Conditions d&apos;utilisation</Link>{" "}et{" "}
              <Link href="/legal/confidentialite" className="underline underline-offset-2">politique de confidentialité</Link>{" "}
              <span className="text-muted">(modèles à faire valider)</span>
            </p>
          </div>
        </Panel>
      </div>
    </>
  );
}
