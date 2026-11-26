import "server-only";
import { fullName } from "@/lib/format";
import { leadLink, resendConfigured, sendEmail } from "@/lib/notifications/email";
import type { Repository } from "@/lib/repo/types";
import { speedStatus } from "@/lib/team/speed";
import type { AppNotification, Lead, Member, NotificationKind } from "@/lib/types";

/**
 * Notifications in-app (cloche) et email optionnel (Resend). Aucune exception ne remonte : une notification
 * qui échoue ne doit jamais bloquer la création d'un lead ni une synchronisation.
 */

/** Seuls ces types déclenchent un email (quand RESEND_API_KEY est présente) : les attributions restent dans l'application. */
const EMAIL_KINDS = new Set<NotificationKind>(["lead_overdue", "overdue_digest", "sync_failed"]);

export interface NotifyInput {
  kind: NotificationKind;
  title: string;
  body: string;
  leadId: string | null;
  dedupeKey: string;
}

export async function notifyUser(repo: Repository, orgId: string, userId: string, n: NotifyInput, members?: Member[]): Promise<AppNotification | null> {
  try {
    const created = await repo.addNotification(orgId, { userId, ...n });
    if (created && EMAIL_KINDS.has(n.kind) && resendConfigured()) {
      const list = members ?? (await repo.listMembers(orgId));
      const to = list.find((m) => m.userId === userId && m.active)?.email;
      // Les adresses de démonstration (.example) ne reçoivent jamais d'email.
      if (to && !to.endsWith(".example")) {
        await sendEmail({ to, subject: n.title, text: `${n.body}\n\n${leadLink(n.leadId)}` });
      }
    }
    return created;
  } catch (e) {
    console.error("[priora] notification :", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Lead attribué : prévient le nouveau responsable (sauf s'il s'est attribué le lead lui-même). */
export async function notifyAssigned(
  repo: Repository,
  lead: Pick<Lead, "id" | "orgId" | "firstName" | "lastName" | "email" | "company">,
  ownerId: string | null,
  actorId: string | null,
): Promise<void> {
  if (!ownerId || ownerId === actorId) return;
  const name = fullName(lead);
  await notifyUser(repo, lead.orgId, ownerId, {
    kind: "lead_assigned",
    title: `Nouveau lead attribué : ${name}`,
    body: `${name} (${lead.company}) vous a été attribué.`,
    leadId: lead.id,
    dedupeKey: `assigned:${lead.id}:${Date.now().toString(36)}`,
  });
}

/** Message supplémentaire d'un prospect déjà connu : prévient le responsable du lead. */
export async function notifyLeadMessage(
  repo: Repository,
  lead: Pick<Lead, "id" | "orgId" | "firstName" | "lastName" | "email" | "ownerId">,
  subject: string,
): Promise<void> {
  if (!lead.ownerId) return;
  await notifyUser(repo, lead.orgId, lead.ownerId, {
    kind: "lead_message",
    title: `Nouveau message de ${fullName(lead)}`,
    body: subject ? `Objet : ${subject}` : "Le prospect a répondu par email.",
    leadId: lead.id,
    dedupeKey: `message:${lead.id}:${Date.now().toString(36)}`,
  });
}

/** Échec de synchronisation : prévient tous les administrateurs actifs (une notification par entrée de journal). */
export async function notifySyncFailed(repo: Repository, orgId: string, logId: string, message: string, leadId: string | null): Promise<void> {
  try {
    const members = await repo.listMembers(orgId);
    for (const m of members.filter((x) => x.active && x.role === "admin")) {
      await notifyUser(repo, orgId, m.userId, {
        kind: "sync_failed", title: "Synchronisation HubSpot en échec", body: message.slice(0, 300), leadId, dedupeKey: `sync:${logId}`,
      }, members);
    }
  } catch (e) {
    console.error("[priora] notification de synchro :", e instanceof Error ? e.message : e);
  }
}

const OVERDUE_WINDOW_DAYS = 7;
const MAX_PER_RUN = 25;

/**
 * Détecte les leads "Appeler maintenant" en retard et prévient leur responsable (une fois par lead),
 * plus un résumé quotidien pour les managers et administrateurs. Appelé par la tâche planifiée et, en repli,
 * à l'affichage de l'application (au plus une fois par minute et par organisation).
 */
export async function syncOverdueNotifications(repo: Repository, orgId: string, now: Date = new Date()): Promise<{ owners: number; digests: number; overdue: number }> {
  const [leads, settings, members] = await Promise.all([repo.listLeads(orgId), repo.getOrgSettings(orgId), repo.listMembers(orgId)]);
  const since = now.getTime() - OVERDUE_WINDOW_DAYS * 86_400_000;
  const overdue = leads
    .filter((l) => new Date(l.createdAt).getTime() >= since && l.verdict === "call_now" && speedStatus(l, settings, now).state === "overdue")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  let owners = 0;
  for (const l of overdue.slice(0, MAX_PER_RUN)) {
    if (!l.ownerId || !members.some((m) => m.userId === l.ownerId && m.active)) continue;
    const late = speedStatus(l, settings, now).minutes ?? 0;
    const created = await notifyUser(repo, orgId, l.ownerId, {
      kind: "lead_overdue",
      title: `Appeler maintenant en retard : ${fullName(l)}`,
      body: `${l.company} n'a pas été contacté dans le délai cible (${settings.speedTargets.callNowMinutes} min), retard d'environ ${late} min.`,
      leadId: l.id,
      dedupeKey: `overdue:${l.id}`,
    }, members);
    if (created) owners++;
  }
  let digests = 0;
  if (overdue.length > 0) {
    const day = now.toISOString().slice(0, 10);
    for (const m of members.filter((x) => x.active && (x.role === "admin" || x.role === "manager"))) {
      const created = await notifyUser(repo, orgId, m.userId, {
        kind: "overdue_digest",
        title: `${overdue.length} lead${overdue.length > 1 ? "s" : ""} « Appeler maintenant » en retard`,
        body: "Ouvrez la file et filtrez sur « En retard » pour voir qui rappeler en priorité.",
        leadId: null,
        dedupeKey: `overdue-digest:${day}`,
      }, members);
      if (created) digests++;
    }
  }
  return { owners, digests, overdue: overdue.length };
}

const lastRun = new Map<string, number>();

/** Version limitée : au plus une exécution par minute et par organisation (affichage de l'application). */
export async function syncOverdueThrottled(repo: Repository, orgId: string): Promise<void> {
  const now = Date.now();
  if (now - (lastRun.get(orgId) ?? 0) < 60_000) return;
  lastRun.set(orgId, now);
  try {
    await syncOverdueNotifications(repo, orgId);
  } catch (e) {
    console.error("[priora] détection des retards :", e instanceof Error ? e.message : e);
  }
}
