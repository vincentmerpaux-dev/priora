"use server";

import { headers } from "next/headers";
import { ingestLead } from "@/lib/pipeline";
import { PUBLIC_DEMO_DISABLED_MESSAGE } from "@/lib/demo/public";
import { isPublicDemo } from "@/lib/supabase/env";
import { getPublicRepo } from "@/lib/repo";
import { clientIp, rateLimit } from "@/lib/security";
import { LeadInputSchema } from "@/lib/validation";

export interface PublicFormState {
  status: "idle" | "sent" | "error";
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
}

/** Soumission du formulaire public : tout est revalidé côté serveur, l'organisation vient du slug (jamais du client). */
export async function submitPublicLead(slug: string, _prev: PublicFormState, formData: FormData): Promise<PublicFormState> {
  // Champ piège : invisible pour un humain, rempli par les robots. On simule un succès sans rien enregistrer.
  if ((formData.get("company_fax") as string | null)?.trim()) return { status: "sent" };

  if (isPublicDemo()) return { status: "error", error: PUBLIC_DEMO_DISABLED_MESSAGE };
  const h = await headers();
  const ip = clientIp(h);
  if (!rateLimit(`form-ip:${ip}`, 5, 10 * 60_000)) {
    return { status: "error", error: "Trop de demandes envoyées. Réessayez dans quelques minutes." };
  }
  if (formData.get("consent") !== "on") {
    return { status: "error", values: Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>, fieldErrors: { consent: "Votre accord est nécessaire pour être recontacté." } };
  }

  const pub = getPublicRepo();
  if (!pub) return { status: "error", error: "Le formulaire n'est pas disponible pour le moment." };
  const org = await pub.getOrganizationBySlug(slug.toLowerCase().slice(0, 48));
  if (!org) return { status: "error", error: "Formulaire introuvable." };
  if (!rateLimit(`form-org:${org.id}`, 200, 60 * 60_000)) {
    return { status: "error", error: "Ce formulaire reçoit beaucoup de demandes. Réessayez plus tard." };
  }

  const raw = Object.fromEntries(formData.entries());
  const parsed = LeadInputSchema.safeParse({
    firstName: raw.firstName, lastName: raw.lastName, email: raw.email, phone: raw.phone, company: raw.company,
    jobTitle: raw.jobTitle, message: raw.message, sourceDetail: "Demande de contact",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { status: "error", error: "Vérifiez les champs signalés.", fieldErrors, values: Object.fromEntries([...formData.entries()].filter(([k, v]) => typeof v === "string" && k !== "company_fax")) as Record<string, string> };
  }
  try {
    await ingestLead(pub.repoForOrg(), org.id, parsed.data, { source: "formulaire", enrich: true, ai: "auto" });
  } catch (e) {
    console.error("[priora] formulaire public :", e instanceof Error ? e.message : e);
    return { status: "error", error: "Une erreur est survenue. Réessayez dans un instant." };
  }
  return { status: "sent" };
}
