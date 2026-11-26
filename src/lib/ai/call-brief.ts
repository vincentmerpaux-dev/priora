import type { Analysis } from "@/lib/types";

/** Les trois lignes lues avant de décrocher. Tout est tiré de l'analyse existante, rien n'est inventé. */
export interface CallBrief {
  hook: string;
  question: string;
  objection: { objection: string; answer: string } | null;
}

/** Découpe en phrases, sans couper à l'intérieur d'une citation « ... ». */
export function splitSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]!;
    if (c === "«") depth++;
    else if (c === "»") depth = Math.max(0, depth - 1);
    else if (depth === 0 && /[.!?…]/.test(c) && (i === clean.length - 1 || /\s/.test(clean[i + 1]!) )) {
      out.push(clean.slice(start, i + 1).trim());
      start = i + 1;
    }
  }
  if (start < clean.length) out.push(clean.slice(start).trim());
  return out.filter(Boolean);
}

/** Première phrase du texte, coupée proprement (sur un mot) si elle dépasse `max` caractères. */
export function firstSentence(text: string, max: number): string {
  const sentence = splitSentences(text)[0] ?? "";
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, "")}…`;
}

/**
 * 1. Accroche : première phrase utile du script d'ouverture (on saute la salutation courte et celles qui contiennent un
 *    champ à compléter entre crochets, comme « [votre prénom] »).
 * 2. Question clé : première question de découverte.
 * 3. Objection probable : la première, avec le début de sa réponse.
 */
export function buildCallBrief(a: Pick<Analysis, "openingScript" | "discoveryQuestions" | "objections">): CallBrief {
  const sentences = splitSentences(a.openingScript);
  const words = (x: string) => x.split(/\s+/).length;
  const meaningful = sentences.find((x) => words(x) > 3 && !/\[[^\]]+\]/.test(x)) ?? sentences.find((x) => words(x) > 3) ?? sentences[0] ?? "";
  const o = a.objections[0];
  return {
    hook: firstSentence(meaningful, 170),
    question: firstSentence(a.discoveryQuestions[0] ?? "", 170),
    objection: o ? { objection: firstSentence(o.objection, 110), answer: firstSentence(o.response, 150) } : null,
  };
}
