"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { appUrl, isDemoMode } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export interface AuthState {
  error?: string;
  message?: string;
}

const EmailSchema = z.string().trim().toLowerCase().pipe(z.email({ message: "Adresse email invalide" }));
const PasswordSchema = z.string().min(8, "8 caractères minimum").max(200);

function translate(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "Email ou mot de passe incorrect.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Un compte existe déjà avec cet email.";
  if (m.includes("email not confirmed")) return "Confirmez d'abord votre email grâce au message reçu.";
  if (m.includes("rate limit") || m.includes("too many")) return "Trop de tentatives. Réessayez dans quelques minutes.";
  return "Impossible de vous connecter pour le moment. Réessayez.";
}

export async function passwordAuth(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (isDemoMode()) redirect("/leads");
  const mode = formData.get("mode") === "signup" ? "signup" : "signin";
  const email = EmailSchema.safeParse(formData.get("email"));
  const password = PasswordSchema.safeParse(formData.get("password"));
  if (!email.success) return { error: email.error.issues[0]?.message };
  if (!password.success) return { error: password.error.issues[0]?.message };

  const supabase = await createClient();
  if (mode === "signup") {
    const { data, error } = await supabase.auth.signUp({
      email: email.data,
      password: password.data,
      options: { emailRedirectTo: `${appUrl()}/auth/callback` },
    });
    if (error) return { error: translate(error.message) };
    if (!data.session) return { message: "Compte créé. Ouvrez le message de confirmation envoyé par email pour finaliser l'inscription." };
    redirect("/onboarding");
  }
  const { error } = await supabase.auth.signInWithPassword({ email: email.data, password: password.data });
  if (error) return { error: translate(error.message) };
  redirect("/leads");
}

export async function magicLink(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (isDemoMode()) redirect("/leads");
  const email = EmailSchema.safeParse(formData.get("email"));
  if (!email.success) return { error: email.error.issues[0]?.message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: `${appUrl()}/auth/callback`, shouldCreateUser: true },
  });
  if (error) return { error: translate(error.message) };
  return { message: "Lien envoyé. Ouvrez votre boîte mail et cliquez sur le lien pour vous connecter." };
}

export async function signOut() {
  if (!isDemoMode()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  // Démo : « Accueil » ramène à la page produit ; mode réel : retour à la connexion.
  redirect(isDemoMode() ? "/" : "/login");
}
