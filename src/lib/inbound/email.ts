import { emailDomain, isProEmail } from "@/lib/text";

/**
 * Email entrant -> lead. Module pur (aucune dépendance serveur, testé) :
 * adaptateurs de format par fournisseur, nettoyage du corps, détection des messages automatiques, extraction.
 * Les fournisseurs ne partagent pas de format : chacun est converti vers `InboundEmail`.
 */

export type EmailProvider = "postmark" | "mailgun" | "sendgrid" | "generic";
export const EMAIL_PROVIDERS: EmailProvider[] = ["postmark", "mailgun", "sendgrid", "generic"];
export const PROVIDER_LABEL: Record<EmailProvider, string> = {
  postmark: "Postmark (Inbound)", mailgun: "Mailgun (Routes)", sendgrid: "SendGrid (Inbound Parse)", generic: "Générique (Cloudflare Email Worker, autre)",
};

export interface InboundEmail {
  provider: EmailProvider;
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  /** Corps texte brut tel que reçu (citations et signature comprises). */
  text: string;
  messageId: string | null;
  /** En-têtes en minuscules. */
  headers: Record<string, string>;
}

type Dict = Record<string, unknown>;
const isDict = (v: unknown): v is Dict => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const MAX_TEXT = 60_000;

/* ---------- Adresses ---------- */

/** "Prénom Nom" <a@b.fr>, a@b.fr, Prénom Nom <a@b.fr>. Retourne la première adresse. */
export function parseAddress(raw: string): { name: string; email: string } {
  const value = raw.trim();
  const angle = /^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>/.exec(value);
  if (angle) return { name: cleanName(angle[1] ?? ""), email: angle[2]!.toLowerCase() };
  const bare = /([^\s<>",;]+@[^\s<>",;]+)/.exec(value);
  return { name: "", email: bare ? bare[1]!.toLowerCase() : "" };
}

function cleanName(raw: string): string {
  return raw.replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, " ").trim();
}

/* ---------- En-têtes ---------- */

/** Accepte un objet, une liste [{Name, Value}] (Postmark), une liste de paires (Mailgun) ou un texte brut (SendGrid). */
export function normalizeHeaders(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const set = (k: string, v: string) => {
    const key = k.trim().toLowerCase();
    if (key && !(key in out)) out[key] = v.trim();
  };
  let value = input;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try { value = JSON.parse(trimmed); } catch { /* texte brut ci-dessous */ }
    }
  }
  if (typeof value === "string") {
    for (const h of unfoldHeaders(value)) set(h.name, h.value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      if (Array.isArray(item) && item.length >= 2) set(str(item[0]), str(item[1]));
      else if (isDict(item)) set(str(item.Name ?? item.name), str(item.Value ?? item.value));
    }
  } else if (isDict(value)) {
    for (const [k, v] of Object.entries(value)) set(k, Array.isArray(v) ? v.map(str).join(", ") : str(v));
  }
  return out;
}

/** Texte brut d'en-têtes : les lignes qui commencent par un espace prolongent la précédente. */
export function unfoldHeaders(block: string): { name: string; value: string }[] {
  const list: { name: string; value: string }[] = [];
  for (const line of block.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^[ \t]+\S/.test(line) && list.length > 0) {
      list[list.length - 1]!.value += ` ${line.trim()}`;
      continue;
    }
    const m = /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9-]*)\s?:\s*(.*)$/.exec(line);
    if (m) list.push({ name: m[1]!, value: m[2]! });
  }
  return list;
}

/* ---------- Adaptateurs ---------- */

function build(provider: EmailProvider, p: { from: string; fromName?: string; to: string; subject: string; text: string; messageId?: string; headers: Record<string, string> }): InboundEmail {
  const addr = parseAddress(p.from);
  return {
    provider,
    fromName: cleanName(p.fromName || addr.name),
    fromEmail: addr.email,
    to: p.to,
    subject: p.subject.replace(/\s+/g, " ").trim().slice(0, 300),
    text: p.text.slice(0, MAX_TEXT),
    messageId: p.messageId?.trim() || p.headers["message-id"] || null,
    headers: p.headers,
  };
}

/** Postmark Inbound : https://postmarkapp.com/developer/webhooks/inbound-webhook (JSON). */
export function parsePostmark(p: Dict): InboundEmail {
  const full = isDict(p.FromFull) ? p.FromFull : {};
  return build("postmark", {
    from: str(full.Email) || str(p.From),
    fromName: str(full.Name) || str(p.FromName),
    to: str(p.OriginalRecipient) || str(p.To),
    subject: str(p.Subject),
    text: str(p.TextBody) || htmlToText(str(p.HtmlBody)),
    messageId: str(p.MessageID),
    headers: normalizeHeaders(p.Headers),
  });
}

/** Mailgun Routes (forward) : champs "sender", "from", "subject", "body-plain", "message-headers". */
export function parseMailgun(p: Dict): InboundEmail {
  const headers = normalizeHeaders(p["message-headers"]);
  return build("mailgun", {
    from: str(p.from) || str(p.sender),
    to: str(p.recipient) || str(p.To) || str(p.to),
    subject: str(p.subject) || str(p.Subject),
    text: str(p["body-plain"]) || str(p["stripped-text"]) || htmlToText(str(p["body-html"])),
    messageId: str(p["Message-Id"]) || str(p["message-id"]),
    headers,
  });
}

/** SendGrid Inbound Parse : champs "from", "to", "subject", "text", "html", "headers" (texte brut). */
export function parseSendgrid(p: Dict): InboundEmail {
  return build("sendgrid", {
    from: str(p.from),
    to: str(p.to),
    subject: str(p.subject),
    text: str(p.text) || htmlToText(str(p.html)),
    headers: normalizeHeaders(p.headers),
  });
}

/**
 * Format générique (Cloudflare Email Worker, Zapier, n8n...) :
 * { from, fromName?, to, subject, text, html?, headers?, messageId? }. "from" peut être une chaîne ou { name, address|email }.
 */
export function parseGeneric(p: Dict): InboundEmail {
  const from = p.from;
  let fromStr = "";
  let fromName = str(p.fromName ?? p.from_name);
  if (isDict(from)) {
    fromStr = str(from.address) || str(from.email);
    fromName = fromName || str(from.name);
  } else fromStr = str(from) || str(p.sender);
  return build("generic", {
    from: fromStr,
    fromName,
    to: isDict(p.to) ? str(p.to.address) || str(p.to.email) : Array.isArray(p.to) ? str(p.to[0]) : str(p.to),
    subject: str(p.subject),
    text: str(p.text) || str(p.body) || htmlToText(str(p.html)),
    messageId: str(p.messageId ?? p.message_id),
    headers: normalizeHeaders(p.headers),
  });
}

/** Reconnaît le format à partir de ses champs caractéristiques (le paramètre ?provider= prime s'il est fourni). */
export function detectProvider(p: Dict): EmailProvider {
  if ("TextBody" in p || "FromFull" in p || "MessageID" in p) return "postmark";
  if ("body-plain" in p || "stripped-text" in p || "message-headers" in p) return "mailgun";
  if ("envelope" in p || ("headers" in p && typeof p.headers === "string" && ("charsets" in p || "dkim" in p || "SPF" in p))) return "sendgrid";
  return "generic";
}

export function parseInbound(payload: unknown, provider?: EmailProvider | null): InboundEmail | { error: string } {
  if (!isDict(payload)) return { error: "Un objet JSON ou un formulaire est attendu." };
  const kind = provider ?? detectProvider(payload);
  const email = { postmark: parsePostmark, mailgun: parseMailgun, sendgrid: parseSendgrid, generic: parseGeneric }[kind](payload);
  if (!email.fromEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.fromEmail)) return { error: "Expéditeur introuvable ou invalide." };
  return email;
}

/** Email collé à la main (simulateur) : en-têtes, ligne vide, corps. Sans en-tête, tout est considéré comme du corps. */
export function parseRawEmail(raw: string): InboundEmail | { error: string } {
  const text = raw.replace(/\r\n?/g, "\n").replace(/^﻿/, "").trim();
  if (!text) return { error: "Collez un email (en-têtes et corps)." };
  const split = text.search(/\n\s*\n/);
  const first = text.split("\n", 1)[0] ?? "";
  const looksLikeHeaders = /^[A-Za-zÀ-ÿ-]{2,30}\s?:/.test(first);
  const headBlock = looksLikeHeaders ? (split === -1 ? text : text.slice(0, split)) : "";
  const body = looksLikeHeaders ? (split === -1 ? "" : text.slice(split).trim()) : text;

  const headers = normalizeHeaders(headBlock);
  // Le français ("De :", "Objet :", "À :") est accepté en plus des en-têtes standards.
  const alias = (...names: string[]) => names.map((n) => headers[n]).find(Boolean) ?? "";
  const from = alias("from", "de");
  const subject = alias("subject", "objet", "sujet");
  if (!from) return { error: "Expéditeur introuvable : ajoutez une ligne « From: Prénom Nom <adresse@entreprise.fr> » avant le corps." };
  return build("generic", { from, to: alias("to", "à", "a"), subject, text: body, messageId: alias("message-id"), headers });
}

/* ---------- HTML -> texte (repli quand aucun corps texte n'est fourni) ---------- */

export function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ---------- Messages automatiques ---------- */

export type SkipReason = "auto_reply" | "newsletter" | "bounce";
export const SKIP_LABEL: Record<SkipReason, string> = {
  auto_reply: "Réponse automatique (absence, accusé de réception)",
  newsletter: "Newsletter ou envoi en masse (en-tête List-Unsubscribe ou Precedence: bulk)",
  bounce: "Message d'erreur de remise (bounce, mailer-daemon)",
};

const BOUNCE_LOCAL = /^(mailer-daemon|postmaster|mail-daemon|bounces?|bounce[-+_].*|delivery|no-?reply-?bounce)$/;
const NOREPLY_LOCAL = /^(no-?reply|do-?not-?reply|donotreply|ne-?pas-?repondre|notifications?|newsletter|mailer|news)$/;
const BOUNCE_SUBJECT = /^(undeliverable|delivery status notification|delivery failure|failure notice|mail delivery (failed|subsystem)|returned mail|non remis|échec de (la )?remise|message non distribu)/i;
const AUTO_SUBJECT = /^(r[ée]ponse automatique|automatic reply|auto(matic)?[- ]?reply|autoreply|out of office|absence du bureau|absent(e)? du bureau|accus[ée] de r[ée]ception automatique)/i;

/** Retourne la raison pour laquelle le message ne doit pas devenir un lead, ou null. */
export function skipReason(email: Pick<InboundEmail, "fromEmail" | "subject" | "headers">): SkipReason | null {
  const h = email.headers;
  const local = email.fromEmail.split("@")[0]?.toLowerCase() ?? "";
  const contentType = (h["content-type"] ?? "").toLowerCase();
  if (BOUNCE_LOCAL.test(local) || BOUNCE_SUBJECT.test(email.subject) || /report-type=delivery-status/.test(contentType) || (h["return-path"] ?? "").replace(/\s/g, "") === "<>") return "bounce";

  const autoSubmitted = (h["auto-submitted"] ?? "").toLowerCase();
  if ((autoSubmitted && autoSubmitted !== "no") || "x-autoreply" in h || "x-autorespond" in h || /auto[_-]?reply|auto_reply/.test((h["precedence"] ?? "").toLowerCase()) || "x-auto-response-suppress" in h || AUTO_SUBJECT.test(email.subject)) {
    return "auto_reply";
  }
  if ("list-unsubscribe" in h || "list-id" in h || /^(bulk|list|junk)$/.test((h["precedence"] ?? "").toLowerCase()) || NOREPLY_LOCAL.test(local) || "x-campaign" in h || "x-mailchimp-id" in h) return "newsletter";
  return null;
}

/* ---------- Nettoyage du corps ---------- */

const QUOTE_INTRO = [
  /^(le|on)\b.{0,300}\b(a écrit|a ecrit|écrit|wrote)\s*:?\s*$/i,
  /^-{2,}\s*(message d'origine|original message|message transféré|forwarded message)\s*-{2,}$/i,
  /^_{5,}$/,
  /^(de|from)\s*:\s*.+$/i, // début d'un bloc d'en-têtes cité (De : ... Envoyé : ...)
];
const SIGNATURE_SENT = /^(envoy[ée]|sent) (de mon|from my|depuis|via)\b/i;
const DISCLAIMER = /(ce message (électronique )?et ses pièces jointes|ce courriel (est|et)|le contenu de ce message|this (e-?mail|message) (is|and any)|confidentiality notice|avis de confidentialité|si vous avez reçu ce (message|mail|courriel) par erreur|if you have received this (e-?mail|message) in error|avant d'imprimer|please consider the environment|pensez à l'environnement)/i;
const CLOSING = /^(cordialement|bien cordialement|très cordialement|bien à vous|bien a vous|salutations|sincères salutations|cdt|bcdt|bonne journée|bonne soirée|bien à toi|merci(?: d'avance| beaucoup)?[ ,.!]*|best regards|kind regards|regards|sincerely|thanks|thank you|many thanks)\b[ ,.!]*$/i;

export interface CleanedBody {
  /** Message de l'expéditeur, sans citation, signature ni disclaimer. */
  body: string;
  /** Lignes de signature (sert à trouver téléphone, fonction, entreprise). */
  signature: string;
}

export function cleanBody(raw: string): CleanedBody {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const t = line.trim();
    // "Le lundi 3 mars 2025 à 10:32, X <x@y.fr> a écrit :" peut être coupé sur deux ou trois lignes.
    const joined = [t, `${t} ${(lines[i + 1] ?? "").trim()}`, `${t} ${(lines[i + 1] ?? "").trim()} ${(lines[i + 2] ?? "").trim()}`];
    if (QUOTE_INTRO.slice(0, 3).some((re) => joined.some((j) => re.test(j)))) break;
    // Bloc d'en-têtes cités : "De :" suivi d'"Envoyé :", "À :" ou "Objet :" dans les lignes voisines.
    if (/^(de|from)\s*:/i.test(t) && lines.slice(i + 1, i + 6).some((l) => /^(envoy[ée]|sent|date|à|to|objet|subject)\s*:/i.test(l.trim()))) break;
    if (t.startsWith(">")) continue;
    if (/^--\s?$/.test(line)) {
      // Séparateur de signature standard : tout ce qui suit est signature (citations déjà écartées ci-dessus).
      kept.push("-- ");
      continue;
    }
    kept.push(line);
  }

  // Disclaimer : tout ce qui suit le premier paragraphe de mentions légales est retiré.
  const discIdx = kept.findIndex((l) => DISCLAIMER.test(l));
  const withoutDisclaimer = discIdx >= 0 ? kept.slice(0, discIdx) : kept;

  // "Envoyé de mon iPhone" et assimilés.
  const lines2 = withoutDisclaimer.filter((l) => !SIGNATURE_SENT.test(l.trim()));

  // Signature : après "-- " ou après la dernière formule de politesse (dans les 12 dernières lignes non vides).
  let sigStart = lines2.findIndex((l) => l === "-- ");
  if (sigStart < 0) {
    for (let i = lines2.length - 1; i >= Math.max(0, lines2.length - 14); i--) {
      if (CLOSING.test(lines2[i]!.trim())) { sigStart = i; break; }
    }
  }
  const bodyLines = sigStart >= 0 ? lines2.slice(0, sigStart) : lines2;
  // Une formule de politesse ("Merci,") suivie du seul prénom reste dans la signature, pas dans le message.
  const signatureLines = sigStart >= 0 ? lines2.slice(sigStart).filter((l) => l !== "-- ") : [];
  const squash = (l: string[]) => l.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { body: squash(bodyLines), signature: squash(signatureLines) };
}

/* ---------- Extraction ---------- */

const PHONE_FR = /(?:(?:\+|00)33[\s.-]?(?:\(0\)[\s.-]?)?|0)[1-9](?:[\s.-]?\d{2}){4}\b/;
const PHONE_INTL = /\+\d{1,3}[\s.-]?\d(?:[\s.-]?\d){7,11}\b/;

export function extractPhone(text: string): string | null {
  const m = PHONE_FR.exec(text) ?? PHONE_INTL.exec(text);
  if (!m) return null;
  return m[0].replace(/\s+/g, " ").trim();
}

const JOB_WORDS = /\b(directeur|directrice|dirigeant|responsable|gérant|gerant|gérante|g[ée]rant|fondateur|fondatrice|pr[ée]sident|présidente|ceo|cto|coo|cfo|daf|dg|head of|manager|chef de|charg[ée]e? de|acheteu(?:r|se)|consultant|ing[ée]nieur|technicien|commercial|assistant|office manager|propri[ée]taire|artisan)\b/i;
const LEGAL_SUFFIX = /\b(sas|sasu|sarl|eurl|sa|sci|snc|scop|gmbh|ltd|inc|llc|sca|selarl|association|groupe|ets|établissements|etablissements)\b/i;

function titleCase(s: string): string {
  return s.split(/[\s-]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** Entreprise : ligne de signature avec forme juridique, sinon ligne suivant la fonction, sinon domaine professionnel. */
export function guessCompany(signature: string, fromEmail: string, fromName: string, jobLine: string | null): string {
  const lines = signature.split("\n").map((l) => l.trim()).filter(Boolean);
  const legal = lines.find((l) => l.length <= 80 && LEGAL_SUFFIX.test(l) && !/@|https?:|www\./i.test(l) && !PHONE_FR.test(l));
  if (legal) return legal.replace(/^(société|societe|entreprise)\s*:?\s*/i, "").slice(0, 120);
  if (jobLine) {
    const idx = lines.indexOf(jobLine);
    const next = lines[idx + 1];
    if (next && next.length <= 80 && !/@|https?:|www\.|\d{2}[\s.]\d{2}/.test(next) && !JOB_WORDS.test(next)) return next.slice(0, 120);
  }
  const domain = emailDomain(fromEmail);
  if (domain && isProEmail(fromEmail)) {
    const label = domain.split(".").slice(0, -1).join(" ").split(" ").pop() ?? domain;
    return titleCase(label.replace(/[-_]+/g, " "));
  }
  return fromName || fromEmail.split("@")[0] || "Inconnue";
}

export function guessJobTitle(signature: string): string | null {
  const lines = signature.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.find((l) => l.length <= 70 && JOB_WORDS.test(l) && !/@|https?:/.test(l)) ?? null;
}

export function splitName(fromName: string, fromEmail: string): { firstName: string; lastName: string } {
  let name = fromName.replace(/\(.*?\)/g, "").trim();
  if (name.includes(",") && name.split(",").length === 2) {
    const [last, first] = name.split(",").map((s) => s.trim());
    name = `${first} ${last}`;
  }
  if (!name || name.includes("@")) {
    // Repli sur la partie locale : prenom.nom@ -> Prenom Nom.
    const local = fromEmail.split("@")[0] ?? "";
    if (/^[a-z]+[._-][a-z]+$/i.test(local)) name = local.replace(/[._-]/g, " ");
    else return { firstName: "", lastName: "" };
  }
  const parts = name.split(/\s+/).filter(Boolean).map((w) => (w === w.toUpperCase() || w === w.toLowerCase() ? titleCase(w) : w));
  if (parts.length === 1) return { firstName: parts[0]!, lastName: "" };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

export interface ExtractedLead {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  company: string;
  jobTitle: string | null;
  message: string;
  sourceDetail: string;
  proDomain: boolean;
  domain: string | null;
  subject: string;
}

export function extractLead(email: InboundEmail): ExtractedLead {
  const { body, signature } = cleanBody(email.text);
  const { firstName, lastName } = splitName(email.fromName, email.fromEmail);
  const jobTitle = guessJobTitle(signature) ?? guessJobTitle(body.split("\n").slice(-4).join("\n"));
  const phone = extractPhone(`${signature}\n${body}`);
  const company = guessCompany(signature, email.fromEmail, email.fromName, jobTitle);
  const subject = email.subject;
  // Le message du lead reprend l'objet puis le corps : le moteur de score lit les deux.
  const message = [subject && !/^(re|tr|fwd?)\s*:/i.test(subject) ? subject : subject.replace(/^((re|tr|fwd?)\s*:\s*)+/i, ""), body].filter(Boolean).join("\n\n").slice(0, 5000);
  return {
    firstName, lastName, email: email.fromEmail, phone, company, jobTitle, message,
    sourceDetail: subject ? `Email : ${subject}`.slice(0, 200) : "Email entrant",
    proDomain: isProEmail(email.fromEmail), domain: emailDomain(email.fromEmail), subject,
  };
}

