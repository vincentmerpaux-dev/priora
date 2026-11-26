"use client";

import { useActionState, useState } from "react";
import { magicLink, passwordAuth, type AuthState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup" | "magic";

const TABS: { id: Mode; label: string }[] = [
  { id: "signin", label: "Connexion" },
  { id: "signup", label: "Créer un compte" },
  { id: "magic", label: "Lien magique" },
];

export function LoginForm({ initialError }: { initialError?: string }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [pwState, pwAction, pwPending] = useActionState(passwordAuth, {} as AuthState);
  const [mlState, mlAction, mlPending] = useActionState(magicLink, {} as AuthState);
  const state = mode === "magic" ? mlState : pwState;
  const pending = mode === "magic" ? mlPending : pwPending;
  const error = state.error ?? initialError;

  return (
    <div>
      <div role="tablist" aria-label="Mode de connexion" className="mb-6 grid grid-cols-3 gap-1 rounded-[var(--radius)] border border-line bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={mode === t.id}
            onClick={() => setMode(t.id)}
            className={cn(
              "h-8 rounded-[var(--radius-sm)] text-[12px] font-medium transition-colors",
              mode === t.id ? "bg-surface-3 text-fg" : "text-muted hover:text-fg",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form action={mode === "magic" ? mlAction : pwAction} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="mode" value={mode} />
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required placeholder="vous@entreprise.fr" />
        </Field>
        {mode !== "magic" ? (
          <Field label="Mot de passe" htmlFor="password" hint={mode === "signup" ? "8 caractères minimum." : undefined}>
            <Input id="password" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={8} />
          </Field>
        ) : (
          <p className="text-[12px] text-muted">Nous vous envoyons un lien de connexion à usage unique. Aucun mot de passe à retenir.</p>
        )}

        {error ? <p role="alert" className="rounded-[var(--radius)] border border-danger/40 bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p> : null}
        {state.message ? <p role="status" className="rounded-[var(--radius)] border border-accent-line bg-accent-soft px-3 py-2 text-[13px]">{state.message}</p> : null}

        <Button type="submit" variant="primary" size="lg" disabled={pending}>
          {pending ? "Un instant" : mode === "signin" ? "Se connecter" : mode === "signup" ? "Créer mon compte" : "Recevoir le lien"}
        </Button>
      </form>
    </div>
  );
}
