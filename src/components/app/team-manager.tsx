"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changeMemberRoleAction, inviteMemberAction, setMemberActiveAction } from "@/app/actions/team";
import { Tag } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { ROLE_LABEL, ROLES, type Member, type Role } from "@/lib/types";
import { cn } from "@/lib/utils";

type Notice = { ok: boolean; text: string } | null;

export function TeamManager({ members, currentUserId, canEdit, demo }: { members: Member[]; currentUserId: string; canEdit: boolean; demo: boolean }) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("commercial");

  function run(fn: () => Promise<{ ok: boolean; error?: string; text?: string }>) {
    start(async () => {
      const r = await fn();
      setNotice(r.ok ? { ok: true, text: r.text ?? "Modification enregistrée." } : { ok: false, text: r.error ?? "Action impossible." });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {notice ? <p role={notice.ok ? "status" : "alert"} className={cn("rounded-[var(--radius)] border px-3 py-2 text-[13px]", notice.ok ? "border-accent-line bg-accent-soft" : "border-danger/40 bg-danger-soft text-danger")}>{notice.text}</p> : null}

      <ul className="divide-y divide-line rounded-[var(--radius)] border border-line bg-surface">
        {members.map((m) => {
          const self = m.userId === currentUserId;
          return (
            <li key={m.userId} className={cn("grid grid-cols-1 items-center gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,1.4fr)_11rem_9rem_auto]", !m.active && "opacity-60")}>
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium">{m.name}{self ? <span className="ml-2 text-[12px] font-normal text-muted">(vous)</span> : null}</p>
                <p className="truncate text-[12px] text-muted">{m.email}</p>
              </div>
              <div>
                {canEdit && !self ? (
                  <>
                    <label htmlFor={`role-${m.userId}`} className="sr-only">Rôle de {m.name}</label>
                    <Select id={`role-${m.userId}`} value={m.role} disabled={pending} className="h-8" onChange={(e) => run(() => changeMemberRoleAction(m.userId, e.target.value))}>
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </Select>
                  </>
                ) : <span className="text-[13px]">{ROLE_LABEL[m.role]}</span>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {!m.active ? <Tag tone="danger">Désactivé</Tag> : m.status === "invited" ? <Tag tone="warn">{demo ? "Invité (simulé)" : "Invité"}</Tag> : <Tag tone="accent">Actif</Tag>}
              </div>
              <div className="md:text-right">
                {canEdit && !self ? (
                  <Button
                    variant={m.active ? "ghost" : "secondary"}
                    size="sm"
                    disabled={pending}
                    onClick={() => run(async () => {
                      const r = await setMemberActiveAction(m.userId, !m.active);
                      if (!r.ok) return r;
                      return { ok: true, text: !m.active ? `${m.name} est réactivé.` : r.openLeads > 0 ? `${m.name} est désactivé. ${r.openLeads} lead${r.openLeads > 1 ? "s ouverts restent attribués" : " ouvert reste attribué"} : réattribuez-${r.openLeads > 1 ? "les" : "le"} depuis la file.` : `${m.name} est désactivé.` };
                    })}
                  >
                    {m.active ? "Désactiver" : "Réactiver"}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {canEdit ? (
        <form
          className="rounded-[var(--radius)] border border-line bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const r = await inviteMemberAction({ email, name, role });
              if (!r.ok) return r;
              setEmail(""); setName("");
              return { ok: true, text: r.simulated ? `Invitation simulée pour ${email} (mode démo : aucun email n'est envoyé).` : `Invitation envoyée à ${email}.` };
            });
          }}
        >
          <h3 className="text-[13px] font-semibold">Inviter un membre</h3>
          <p className="mt-1 text-[12px] text-muted">
            {demo ? "En mode démo, l'invitation est simulée : le membre apparaît dans la liste et dans « Voir en tant que », sans envoi d'email." : "Le membre reçoit un email d'invitation Supabase et rejoint l'organisation avec le rôle choisi."}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_11rem_auto] sm:items-end">
            <Field label="Email" htmlFor="inv-email"><Input id="inv-email" type="email" required value={email} maxLength={254} autoComplete="off" onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Nom (facultatif)" htmlFor="inv-name"><Input id="inv-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Rôle" htmlFor="inv-role">
              <Select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </Select>
            </Field>
            <Button type="submit" variant="primary" disabled={pending || email.trim() === ""}>Inviter</Button>
          </div>
        </form>
      ) : <p className="text-[13px] text-muted">Seuls les administrateurs peuvent inviter, changer un rôle ou désactiver un membre.</p>}
    </div>
  );
}
