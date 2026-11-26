import { z } from "zod";
import { SOURCE_TYPES, type LeadSourceType } from "@/lib/types";

/** Tout ce qui entre dans Priora (formulaire public, webhook, CSV, saisie) passe par ce schéma, côté serveur. */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null));

const websiteField = z
  .string()
  .trim()
  .max(300)
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine((v) => v === null || /^(https?:\/\/)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(\/\S*)?$/i.test(v), {
    message: "Adresse de site web invalide",
  });

export const LeadInputSchema = z.object({
  firstName: z.string().trim().max(100).default(""),
  lastName: z.string().trim().max(100).default(""),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email({ message: "Adresse email invalide" })),
  phone: optionalText(40),
  company: z.string().trim().min(2, "Entreprise requise").max(200),
  jobTitle: optionalText(150),
  website: websiteField,
  location: optionalText(200),
  message: z.string().trim().max(5000).default(""),
  sourceDetail: optionalText(200),
});
export type LeadInput = z.infer<typeof LeadInputSchema>;

/** Alias acceptés par le webhook et l'import CSV (snake_case, camelCase, français). */
const ALIASES: Record<keyof LeadInput | "name", string[]> = {
  firstName: ["firstname", "first_name", "prenom", "given_name"],
  lastName: ["lastname", "last_name", "nom", "surname", "family_name"],
  name: ["name", "full_name", "fullname", "nom_complet", "contact"],
  email: ["email", "e-mail", "mail", "courriel", "email_address"],
  phone: ["phone", "telephone", "tel", "mobile", "phone_number"],
  company: ["company", "entreprise", "societe", "organisation", "organization", "company_name", "raison_sociale"],
  jobTitle: ["jobtitle", "job_title", "title", "fonction", "poste", "role"],
  website: ["website", "site", "site_web", "url", "web"],
  location: ["location", "ville", "city", "localisation", "adresse", "zone"],
  message: ["message", "commentaire", "comment", "besoin", "notes", "description", "body"],
  sourceDetail: ["sourcedetail", "source_detail", "origine", "campagne", "campaign", "utm_campaign"],
};

const key = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9_-]/g, "");

export function guessField(header: string): keyof typeof ALIASES | null {
  const k = key(header);
  for (const [field, names] of Object.entries(ALIASES)) {
    if (names.map(key).includes(k)) return field as keyof typeof ALIASES;
  }
  return null;
}

/** Normalise un objet JSON libre (webhook) vers l'entrée Priora. */
export function normalizeWebhookPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const field = guessField(k);
    if (!field || typeof v !== "string" && typeof v !== "number") continue;
    out[field] = String(v);
  }
  if (!out.firstName && !out.lastName && typeof out.name === "string") {
    const [first, ...rest] = out.name.trim().split(/\s+/);
    out.firstName = first ?? "";
    out.lastName = rest.join(" ");
  }
  delete out.name;
  return out;
}

export const SourceSchema = z.enum(SOURCE_TYPES as [LeadSourceType, ...LeadSourceType[]]);

export const SlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Utilisez des minuscules, chiffres et tirets")
  .min(3, "3 caractères minimum")
  .max(48);

export const OrgNameSchema = z.string().trim().min(2, "2 caractères minimum").max(120);

export const CriterionSchema = z.object({
  key: z.enum(["sector", "size", "zone", "decision_role", "message_intent", "budget_signal", "source_quality", "contactability", "urgency", "freshness", "trade_covered", "company_age", "product_request", "quote_progress", "callback_request", "attestation_need", "contract_expiry", "company_creation", "past_claims", "target_activity", "comparing"]),
  label: z.string().trim().min(1).max(80),
  category: z.enum(["fit", "intent", "timing", "risk"]),
  weight: z.number().int().min(0).max(100),
  enabled: z.boolean(),
  description: z.string().trim().max(300),
});

export const PersonaSchema = z.object({
  name: z.string().trim().min(1, "Donnez un nom à chaque persona").max(100),
  role: z.string().trim().max(100).default(""),
  challenges: z.string().trim().max(600).default(""),
  objections: z.array(z.string().trim().min(1).max(200)).max(8).default([]),
});

const list = (maxItems: number, maxLen: number) =>
  z.array(z.string().trim().min(1).max(maxLen)).max(maxItems);

export const IcpSchema = z
  .object({
    offer: z.string().trim().max(1500),
    idealCustomer: z.string().trim().max(1500),
    sectors: list(30, 80),
    sizeMin: z.number().int().min(0).max(1_000_000).nullable(),
    sizeMax: z.number().int().min(0).max(1_000_000).nullable(),
    zones: list(30, 80),
    decisionRoles: list(30, 80),
    criteria: z.array(CriterionSchema).max(20),
    personas: z.array(PersonaSchema).max(10),
  })
  .refine((v) => v.sizeMin === null || v.sizeMax === null || v.sizeMin <= v.sizeMax, {
    message: "L'effectif minimum doit être inférieur au maximum",
    path: ["sizeMin"],
  });

export const ObjectionSchema = z.object({
  id: z.string().uuid().optional(),
  objection: z.string().trim().min(3, "Objection trop courte").max(400),
  response: z.string().trim().min(3, "Réponse trop courte").max(1500),
  category: z.string().trim().min(1).max(60).default("Autre"),
});

/* ---------- Équipe et attribution (S2) ---------- */

export const RoleSchema = z.enum(["admin", "manager", "commercial"]);

export const InviteSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email({ message: "Adresse email invalide" })),
  name: z.string().trim().max(100).default(""),
  role: RoleSchema,
});

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Identifiant invalide");
export const UuidSchema = uuid;

export const OrgSettingsSchema = z.object({
  assignment: z.object({
    mode: z.enum(["off", "round_robin", "segments"]),
    rules: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(60),
          label: z.string().trim().min(1, "Donnez un nom à chaque règle").max(80),
          sources: z.array(SourceSchema).max(6),
          keywords: z.array(z.string().trim().min(1).max(60)).max(20),
          minScore: z.number().int().min(0).max(100).nullable(),
          assigneeId: uuid,
        }),
      )
      .max(20),
  }),
  commercialsSeeAll: z.boolean(),
  speedTargets: z.object({
    callNowMinutes: z.number().int().min(1, "1 minute minimum").max(1440, "24 h maximum"),
    nurtureMinutes: z.number().int().min(1, "1 minute minimum").max(10_080, "7 jours maximum"),
  }),
});
