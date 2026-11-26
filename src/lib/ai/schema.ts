import { z } from "zod";
import type { Analysis } from "@/lib/types";

const text = (max: number) => z.string().trim().min(1).transform((s) => s.slice(0, max));

/** Schéma de la sortie JSON attendue du modèle. Toute réponse non conforme déclenche le repli par règles. */
export const AnalysisSchema = z
  .object({
    summary: text(700),
    probable_need: text(500),
    verdict: z.object({
      decision: z.enum(["call_now", "nurture", "disqualify"]),
      reason: text(500),
    }),
    objections: z
      .array(z.object({ objection: text(240), response: text(600), from_library: z.boolean().default(false) }))
      .min(1)
      .transform((a) => a.slice(0, 4)),
    risks: z
      .array(
        z.object({
          type: z.enum(["budget", "decision_maker", "competitor", "timing"]),
          level: z.enum(["low", "medium", "high"]),
          detail: text(400),
        }),
      )
      .min(1)
      .transform((a) => a.slice(0, 4)),
    discovery_questions: z.array(text(300)).min(2).transform((a) => a.slice(0, 8)),
    opening_script: text(1200),
    persona: z.object({ name: text(100), reason: text(300) }).nullable().optional(),
  })
  .transform(
    (v): Analysis => ({
      summary: v.summary,
      probableNeed: v.probable_need,
      verdict: v.verdict,
      objections: v.objections.map((o) => ({ objection: o.objection, response: o.response, fromLibrary: o.from_library })),
      risks: v.risks,
      discoveryQuestions: v.discovery_questions,
      openingScript: v.opening_script,
      persona: v.persona ?? null,
    }),
  );

/** Extrait le premier objet JSON d'un texte (le modèle peut entourer sa réponse de balises). */
export function extractJson(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Aucun JSON dans la réponse du modèle.");
  return JSON.parse(raw.slice(start, end + 1));
}

export function parseAnalysis(raw: string): Analysis {
  return AnalysisSchema.parse(extractJson(raw));
}
