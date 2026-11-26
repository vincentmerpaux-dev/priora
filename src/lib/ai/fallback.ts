import { DEFAULT_OBJECTIONS } from "@/lib/scoring/defaults";
import { verdictFromScore } from "@/lib/scoring/engine";
import type { Analysis, CriterionKey, IcpConfig, Lead, LeadScore, ObjectionItem } from "@/lib/types";
import { normalize } from "@/lib/text";
import { detectProducts } from "@/lib/scoring/insurance";
import { matchPersona } from "./persona";
import { playbookObjections, renderOpeningScript } from "./playbook";

export interface AnalysisContext {
  lead: Pick<Lead, "firstName" | "lastName" | "email" | "company" | "jobTitle" | "message" | "source" | "location" | "enrichment"> &
    Partial<Pick<Lead, "sourceDetail" | "createdAt">>;
  score: Pick<LeadScore, "total" | "details">;
  icp: Pick<IcpConfig, "offer" | "idealCustomer" | "playbook"> & Partial<Pick<IcpConfig, "personas">>;
  objections: Pick<ObjectionItem, "objection" | "response" | "category">[];
}

function ratio(score: AnalysisContext["score"], key: CriterionKey): number | null {
  const d = score.details.find((x) => x.key === key);
  return d && d.max > 0 ? d.points / d.max : null;
}

function level(r: number | null): "low" | "medium" | "high" {
  if (r === null) return "medium";
  return r >= 0.7 ? "low" : r >= 0.35 ? "medium" : "high";
}

/** Analyse déterministe, utilisée quand la clé Anthropic est absente ou que l'appel échoue. */
export function rulesAnalysis(ctx: AnalysisContext): Analysis {
  const { lead, score, icp } = ctx;
  const decision = verdictFromScore(score.total, score.details);
  const c = lead.enrichment?.company;
  const sorted = [...score.details].filter((d) => d.max > 0).sort((a, b) => b.points / b.max - a.points / a.max);
  const best = sorted.slice(0, 2);
  const worst = sorted.slice(-2).reverse();

  const who = `${lead.firstName} ${lead.lastName}`.trim() || "Le contact";
  const profile = [
    lead.jobTitle ? `${lead.jobTitle} chez ${lead.company}` : lead.company,
    c?.sectorLabel,
    c?.employees?.label,
    c?.city,
  ].filter(Boolean);
  const products = detectProducts([lead.sourceDetail, lead.message].filter(Boolean).join(" "));
  const channel = lead.sourceDetail ? `${lead.source} (${lead.sourceDetail})` : lead.source;
  const summary =
    `${who} : ${profile.join(", ")}. Contact arrivé par ${channel}.` +
    (icp.playbook && products.length > 0 ? ` Produit évoqué : ${products.map((p) => p.short).join(", ")}.` : "") +
    ` Score ${score.total}/100.`;

  const firstSentence = lead.message.trim().split(/(?<=[.!?])\s+/)[0]?.slice(0, 220);
  const needSentence = pickNeedSentence(lead.message);
  const probableNeed = needSentence
    ? `D'après son message : ${needSentence}`
    : icp.offer
      ? `Aucun message exploitable. Besoin probable à vérifier autour de : ${icp.offer.slice(0, 160)}`
      : "Aucun message exploitable : le besoin est à qualifier lors du premier échange.";

  const reason =
    decision === "call_now"
      ? `Score élevé. Points forts : ${best.map((d) => d.label.toLowerCase()).join(" et ")}.`
      : decision === "nurture"
        ? `Score moyen. À confirmer : ${worst.map((d) => d.label.toLowerCase()).join(" et ")}.`
        : `Score faible. Points faibles : ${worst.map((d) => d.label.toLowerCase()).join(" et ")}.`;

  // Objections : bibliothèque de l'organisation d'abord, modèles génériques sinon.
  const library = ctx.objections.length > 0 ? ctx.objections : DEFAULT_OBJECTIONS;
  const fromLibrary = ctx.objections.length > 0;
  const msg = normalize(lead.message);
  const wanted: string[] = [];
  if ((ratio(score, "budget_signal") ?? 0) < 0.5) wanted.push("prix");
  if ((ratio(score, "urgency") ?? 0) < 0.5) wanted.push("timing");
  if ((ratio(score, "decision_role") ?? 0) < 0.7) wanted.push("decision");
  if (/(deja|actuel|concurren|fournisseur|outil en place)/.test(msg)) wanted.push("concurrence");
  const picked: typeof library = icp.playbook ? playbookObjections(icp.playbook, library, lead, 3) : [];
  if (!icp.playbook) for (const w of wanted) {
    const hit = library.find((o) => normalize(o.category).includes(w) && !picked.includes(o));
    if (hit) picked.push(hit);
  }
  const minPicks = icp.playbook ? 2 : 3;
  for (const o of library) if (picked.length < minPicks && !picked.includes(o)) picked.push(o);
  const objections = picked.slice(0, 3).map((o) => ({ objection: o.objection, response: fillPrice(o.response, products[0]), fromLibrary }));

  const detail = (key: CriterionKey, fallback: string) => score.details.find((d) => d.key === key)?.reason ?? fallback;
  const sensitive = /(cher|prix|tarif|budget|augmente|moins cher|hausse)/.test(msg);
  const insuranceRisks: Analysis["risks"] = [
    {
      type: "budget",
      level: sensitive || (ratio(score, "past_claims") ?? 1) < 0.5 ? "medium" : "low",
      detail: (ratio(score, "past_claims") ?? 1) < 0.5 ? detail("past_claims", "") + " Le tarif peut s'en ressentir." : sensitive ? "Sensibilité au prix exprimée : donner un prix à partir de, retirer les options inutiles, ne jamais promettre de remise." : "Pas de sensibilité au prix exprimée : à vérifier en découverte.",
    },
    {
      type: "decision_maker",
      level: /(associe|comptable|expert-comptable|mon epoux|mon epouse|conjoint|en parler)/.test(msg) ? "medium" : "low",
      detail: /(associe|comptable|expert-comptable|mon epoux|mon epouse|conjoint|en parler)/.test(msg) ? "Un associé, un comptable ou un proche intervient dans la décision : l'inviter au prochain échange." : "Le dirigeant décide seul le plus souvent : confirmer en découverte.",
    },
    { type: "competitor", level: level(ratio(score, "comparing")), detail: detail("comparing", "Comparaison non évoquée.") },
    { type: "timing", level: level(Math.max(ratio(score, "attestation_need") ?? 0, ratio(score, "contract_expiry") ?? 0)), detail: `${detail("attestation_need", "Échéance inconnue.")} ${detail("contract_expiry", "")}`.trim() },
  ];
  const risks: Analysis["risks"] = icp.playbook ? insuranceRisks : [
    { type: "budget", level: level(ratio(score, "budget_signal")), detail: (score.details.find((d) => d.key === "budget_signal")?.reason) ?? "Budget non vérifié." },
    { type: "decision_maker", level: level(ratio(score, "decision_role")), detail: (score.details.find((d) => d.key === "decision_role")?.reason) ?? "Pouvoir de décision non vérifié." },
    {
      type: "competitor",
      level: /(deja|actuel|concurren|fournisseur|comparer|comparatif)/.test(msg) ? "medium" : "low",
      detail: /(deja|actuel|concurren|fournisseur|comparer|comparatif)/.test(msg) ? "Le message évoque une solution actuelle ou une comparaison." : "Aucun concurrent mentionné, à explorer en découverte.",
    },
    { type: "timing", level: level(ratio(score, "urgency")), detail: (score.details.find((d) => d.key === "urgency")?.reason) ?? "Échéance non connue." },
  ];

  const questions = icp.playbook ? icp.playbook.discoveryQuestions : [
    "Quel problème précis voulez-vous résoudre, et depuis quand ?",
    "Comment gérez-vous ce sujet aujourd'hui, et qu'est-ce qui ne fonctionne plus ?",
    "Qui d'autre intervient dans la décision, et quel est le calendrier envisagé ?",
    "Avez-vous une enveloppe budgétaire ou un ordre de grandeur en tête ?",
    "Qu'est-ce qui vous ferait dire que le projet est réussi dans six mois ?",
  ];

  const hello = lead.firstName ? `Bonjour ${lead.firstName}` : "Bonjour";
  const hook = firstSentence ? `Vous nous avez écrit : « ${clip(firstSentence, 120)} ».` : `Vous avez pris contact avec nous.`;
  const openingScript = icp.playbook
    ? renderOpeningScript(icp.playbook, lead)
    :
    `${hello}, c'est [votre prénom] de [votre entreprise]. Je vous appelle suite à votre demande, vous avez 30 secondes ? ` +
    `${hook} ` +
    `${icp.offer ? `Nous aidons des entreprises comme ${lead.company} sur ce sujet : ${endSentence(clip(icp.offer, 200))} ` : ""}` +
    `Pour être utile tout de suite, j'ai deux questions : quel est l'enjeu principal pour vous en ce moment, et pour quand vous aimeriez avoir une solution en place ?`;

  return {
    summary,
    probableNeed,
    verdict: { decision, reason },
    objections,
    risks,
    discoveryQuestions: questions,
    openingScript,
    persona: (() => {
      const m = matchPersona(lead, icp.personas ?? []);
      return m ? { name: m.persona.name, reason: m.reason } : null;
    })(),
  };
}

/** Raccourcit un texte sans couper un mot et sans ponctuation finale (le gabarit ajoute la sienne). */
export function clip(text: string, max: number): string {
  const clean = text.trim().replace(/[\s.!?;:,]+$/, "");
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.!?;:,]+$/, "")}…`;
}

/** Termine une phrase par un point, sauf si elle finit déjà par des points de suspension. */
export function endSentence(text: string): string {
  return text.endsWith("…") ? text : `${text}.`;
}

const NEED_RE = /(besoin|cherch|recherch|souhait|voudr|aimerai|dois |doit |faut|demande|exige|attestation|souscri|devis|rappel|urgent|au plus vite|probl|budget|echeance|remplacer|changer)/;

/** La phrase du message qui exprime le mieux le besoin (et pas la présentation "je suis plaquiste"). */
export function pickNeedSentence(message: string): string {
  const sentences = message.trim().split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length === 0) return "";
  const hit = sentences.find((s) => NEED_RE.test(normalize(s)));
  return (hit ?? sentences[0]!).slice(0, 220);
}

/** Remplace {prix} par le prix d'appel du produit demandé, toujours en "à partir de". */
export function fillPrice(text: string, product?: { short: string; priceFrom: string }): string {
  if (!text.includes("{prix}")) return text;
  const prix = product
    ? `${product.short} à partir de ${product.priceFrom}`
    : "prix du produit demandé, par exemple RC Pro à partir de 13 €/mois";
  return text.replaceAll("{prix}", prix);
}
