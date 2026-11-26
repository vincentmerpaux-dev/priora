import "server-only";
import { analyzeLead, aiConfigured } from "@/lib/ai/analyze";
import { enrichLead } from "@/lib/enrichment";
import type { Repository } from "@/lib/repo/types";
import { scoreLead } from "@/lib/scoring/engine";
import { assignNewLead, type Creator } from "@/lib/team/service";
import type { Lead, LeadSourceType, Verdict } from "@/lib/types";
import type { LeadInput } from "@/lib/validation";

export interface IngestOptions {
  source: LeadSourceType;
  /** Enrichissement réseau (registre + site). Désactivable pour les imports volumineux. */
  enrich?: boolean;
  /** "auto" : IA si clé présente ET plafond quotidien non atteint. "never" : repli par règles. */
  ai?: "auto" | "never";
  /** Utilisateur qui saisit le lead (saisie manuelle, import) : sert au repli quand l'attribution automatique est désactivée. */
  creator?: Creator;
}

function aiDailyLimit(): number {
  const n = Number(process.env.AI_DAILY_LIMIT_PER_ORG);
  return Number.isFinite(n) && n >= 0 ? n : 50;
}

function startOfUtcDay(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Enrichit, score et analyse un lead. Le lead est toujours créé, même si une étape suivante échoue. */
export async function ingestLead(repo: Repository, orgId: string, input: LeadInput, opts: IngestOptions): Promise<Lead> {
  const enrichment = opts.enrich === false ? null : await enrichLead({ company: input.company, email: input.email, website: input.website });
  const lead = await repo.createLead(orgId, { ...input, orgId, source: opts.source, enrichment });
  let score: number | null = null;
  try {
    score = (await processLead(repo, lead, opts.ai ?? "auto")).total;
  } catch (e) {
    console.error("[priora] traitement du lead en échec (le lead est conservé) :", e instanceof Error ? e.message : e);
  }
  // Attribution automatique (toutes sources). Un échec ne doit jamais faire perdre le lead : il reste non attribué.
  try {
    const ownerId = await assignNewLead(repo, lead, score, opts.creator);
    if (ownerId) return { ...lead, ownerId, assignedAt: new Date().toISOString() };
  } catch (e) {
    console.error("[priora] attribution en échec (le lead reste non attribué) :", e instanceof Error ? e.message : e);
  }
  return lead;
}

/** Calcule le score et crée une analyse (version suivante). */
export async function processLead(repo: Repository, lead: Lead, ai: "auto" | "never" | "force"): Promise<{ total: number; verdict: Verdict }> {
  const [icp, objections] = await Promise.all([repo.getIcp(lead.orgId), repo.listObjections(lead.orgId)]);
  const result = scoreLead(lead, icp);
  const score = await repo.saveScore(lead.orgId, lead.id, result);

  let allowAi = ai !== "never" && aiConfigured();
  if (allowAi && ai === "auto") {
    allowAi = (await repo.countAiAnalysesSince(lead.orgId, startOfUtcDay())) < aiDailyLimit();
  }
  const out = await analyzeLead({ lead, score, icp, objections }, { allowAi });
  await repo.saveAnalysis(lead.orgId, lead.id, { origin: out.origin, model: out.model, content: out.content });
  return { total: result.total, verdict: out.content.verdict.decision };
}
