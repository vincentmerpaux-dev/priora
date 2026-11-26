import { describe, expect, it } from "vitest";
import { cleanBody, detectProvider, extractLead, extractPhone, parseInbound, parseRawEmail, skipReason, type InboundEmail } from "./email";

/** Tous les emails, noms et entreprises ci-dessous sont fictifs (domaines .example). */
const BODY = `Bonjour,

Nous cherchons un outil de GMAO pour nos 3 sites. Budget validé autour de 30 k€.
Pouvez-vous me rappeler cette semaine ?

Cordialement,

Sophie Martin
Directrice des opérations
Atelier Valdor SAS
Tél : 06 12 34 56 78
www.valdor.example

Le lundi 3 mars 2025 à 10:32, Support Maintia <support@maintia.example> a écrit :
> Merci pour votre message, voici notre brochure.
> Cordialement

Ce message et ses pièces jointes sont confidentiels. Si vous avez reçu ce message par erreur, merci de le supprimer.`;

const postmark = {
  FromName: "Sophie Martin", From: "sophie.martin@valdor.example", FromFull: { Email: "sophie.martin@valdor.example", Name: "Sophie Martin" },
  To: "leads@inbound.example", Subject: "Demande de démo GMAO", MessageID: "pm-1", TextBody: BODY, HtmlBody: "<p>ignoré</p>",
  Headers: [{ Name: "Message-ID", Value: "<abc@valdor.example>" }, { Name: "X-Spam-Status", Value: "No" }],
};
const mailgun = {
  sender: "sophie.martin@valdor.example", from: "Sophie Martin <sophie.martin@valdor.example>", recipient: "leads@inbound.example", subject: "Demande de démo GMAO",
  "body-plain": BODY, "stripped-text": "Bonjour, ...", "message-headers": JSON.stringify([["Subject", "Demande de démo GMAO"], ["Message-Id", "<mg-1@valdor.example>"]]),
};
const sendgrid = {
  from: '"Sophie Martin" <sophie.martin@valdor.example>', to: "leads@inbound.example", subject: "Demande de démo GMAO", text: BODY,
  headers: "Received: by mx.example\nMessage-ID: <sg-1@valdor.example>\nSubject: Demande de démo GMAO", envelope: '{"to":["leads@inbound.example"],"from":"sophie.martin@valdor.example"}', charsets: "{}",
};
const generic = { from: { name: "Sophie Martin", address: "sophie.martin@valdor.example" }, to: "leads@inbound.example", subject: "Demande de démo GMAO", text: BODY, headers: { "message-id": "<cf-1@valdor.example>" } };

describe("adaptateurs de format", () => {
  it.each([
    ["postmark", postmark],
    ["mailgun", mailgun],
    ["sendgrid", sendgrid],
    ["generic", generic],
  ] as const)("%s : détecte le format et extrait expéditeur, objet et corps", (provider, payload) => {
    expect(detectProvider(payload)).toBe(provider);
    const parsed = parseInbound(payload) as InboundEmail;
    expect(parsed.provider).toBe(provider);
    expect(parsed.fromEmail).toBe("sophie.martin@valdor.example");
    expect(parsed.fromName).toBe("Sophie Martin");
    expect(parsed.subject).toBe("Demande de démo GMAO");
    expect(parsed.text).toContain("GMAO");
    expect(parsed.messageId).toBeTruthy();
  });

  it("utilise le HTML en repli quand le corps texte est absent (Postmark)", () => {
    const p = parseInbound({ ...postmark, TextBody: "", HtmlBody: "<p>Besoin d'un <b>devis</b></p><p>Merci</p>" }) as InboundEmail;
    expect(p.text).toContain("Besoin d'un devis");
  });

  it("le paramètre provider prime sur la détection", () => {
    const p = parseInbound({ from: "a@b.example", text: "x", subject: "s" }, "generic") as InboundEmail;
    expect(p.provider).toBe("generic");
  });

  it("refuse un expéditeur absent ou invalide, et un format qui n'est pas un objet", () => {
    expect(parseInbound({ subject: "x", text: "y" })).toEqual({ error: "Expéditeur introuvable ou invalide." });
    expect(parseInbound({ from: "pas-une-adresse", text: "y" })).toEqual({ error: "Expéditeur introuvable ou invalide." });
    expect(parseInbound("texte")).toHaveProperty("error");
    expect(parseInbound([1, 2])).toHaveProperty("error");
  });

  it("lit les adresses de forme Nom <adresse> et normalise la casse", () => {
    const p = parseInbound({ from: "Éric DUPONT <Eric.Dupont@Ex.example>", text: "x" }) as InboundEmail;
    expect(p.fromEmail).toBe("eric.dupont@ex.example");
    expect(p.fromName).toBe("Éric DUPONT");
  });
});

describe("nettoyage du corps", () => {
  it("retire citation, disclaimer, et sépare la signature", () => {
    const { body, signature } = cleanBody(BODY);
    expect(body).toContain("Budget validé autour de 30 k€");
    expect(body).not.toContain("brochure");
    expect(body).not.toContain("a écrit");
    expect(body).not.toMatch(/confidentiels/);
    expect(body).not.toContain("Cordialement");
    expect(signature).toContain("Directrice des opérations");
    expect(signature).toContain("06 12 34 56 78");
    expect(signature).not.toContain("brochure");
  });

  it("coupe une citation dont l'introduction passe sur deux lignes", () => {
    const { body } = cleanBody("Oui, c'est d'accord.\n\nLe 3 mars 2025 à 10:32, Marc Durand\n<marc@x.example> a écrit :\n> ancien message");
    expect(body).toBe("Oui, c'est d'accord.");
  });

  it("coupe une citation anglaise, un bloc Outlook De/Envoyé et le séparateur de signature", () => {
    expect(cleanBody("Hello\n\nOn Mon, Mar 3, 2025 at 10:32 AM Bob <b@x.example> wrote:\n> hi").body).toBe("Hello");
    expect(cleanBody("Bonjour, besoin d'un devis.\n\nDe : Karim <k@x.example>\nEnvoyé : lundi 3 mars 2025 10:32\nÀ : moi\nObjet : devis\n\nancien texte").body).toBe("Bonjour, besoin d'un devis.");
    const sig = cleanBody("Je souhaite un rendez-vous.\n-- \nJean Petit\nGérant");
    expect(sig.body).toBe("Je souhaite un rendez-vous.");
    expect(sig.signature).toContain("Gérant");
  });

  it("retire 'Envoyé de mon iPhone' sans perdre le message", () => {
    expect(cleanBody("Pouvez-vous m'appeler demain ?\n\nEnvoyé de mon iPhone").body).toBe("Pouvez-vous m'appeler demain ?");
  });
});

describe("messages automatiques", () => {
  const base = { fromEmail: "client@valdor.example", subject: "Demande", headers: {} as Record<string, string> };
  it("ignore les réponses automatiques (Auto-Submitted, X-Autoreply, objet)", () => {
    expect(skipReason({ ...base, headers: { "auto-submitted": "auto-replied" } })).toBe("auto_reply");
    expect(skipReason({ ...base, headers: { "x-autoreply": "yes" } })).toBe("auto_reply");
    expect(skipReason({ ...base, headers: { precedence: "auto_reply" } })).toBe("auto_reply");
    expect(skipReason({ ...base, subject: "Réponse automatique : absence du bureau" })).toBe("auto_reply");
    expect(skipReason({ ...base, subject: "Out of office until Monday" })).toBe("auto_reply");
  });
  it("ignore les newsletters (List-Unsubscribe, Precedence bulk, expéditeur noreply)", () => {
    expect(skipReason({ ...base, headers: { "list-unsubscribe": "<mailto:u@x.example>" } })).toBe("newsletter");
    expect(skipReason({ ...base, headers: { precedence: "bulk" } })).toBe("newsletter");
    expect(skipReason({ ...base, fromEmail: "no-reply@promo.example" })).toBe("newsletter");
  });
  it("ignore les bounces (mailer-daemon, postmaster, objet d'erreur de remise)", () => {
    expect(skipReason({ ...base, fromEmail: "MAILER-DAEMON@mx.example" })).toBe("bounce");
    expect(skipReason({ ...base, fromEmail: "postmaster@mx.example" })).toBe("bounce");
    expect(skipReason({ ...base, subject: "Undeliverable: Votre message" })).toBe("bounce");
  });
  it("laisse passer un vrai message, y compris avec Auto-Submitted: no", () => {
    expect(skipReason(base)).toBeNull();
    expect(skipReason({ ...base, headers: { "auto-submitted": "no" } })).toBeNull();
  });
  it("applique le filtre sur chaque format : en-têtes Postmark (liste), Mailgun (paires), SendGrid (texte brut)", () => {
    const pm = parseInbound({ ...postmark, Headers: [{ Name: "Auto-Submitted", Value: "auto-generated" }] }) as InboundEmail;
    const mg = parseInbound({ ...mailgun, "message-headers": JSON.stringify([["List-Unsubscribe", "<http://x.example/u>"]]) }) as InboundEmail;
    const sg = parseInbound({ ...sendgrid, headers: "Received: x\nAuto-Submitted: auto-replied\n" }) as InboundEmail;
    expect([skipReason(pm), skipReason(mg), skipReason(sg)]).toEqual(["auto_reply", "newsletter", "auto_reply"]);
  });
});

describe("extraction du lead", () => {
  it("trouve nom, téléphone, fonction, entreprise et domaine pro", () => {
    const lead = extractLead(parseInbound(postmark) as InboundEmail);
    expect(lead).toMatchObject({ firstName: "Sophie", lastName: "Martin", email: "sophie.martin@valdor.example", phone: "06 12 34 56 78", jobTitle: "Directrice des opérations", company: "Atelier Valdor SAS", proDomain: true, domain: "valdor.example" });
    expect(lead.message).toContain("Demande de démo GMAO");
    expect(lead.message).toContain("GMAO pour nos 3 sites");
    expect(lead.message).not.toContain("brochure");
    expect(lead.sourceDetail).toBe("Email : Demande de démo GMAO");
  });

  it("déduit l'entreprise du domaine professionnel quand la signature n'en dit rien", () => {
    const lead = extractLead(parseInbound({ from: "Paul Roche <paul@fonderie-aubrac.example>", subject: "Tarifs", text: "Bonjour, quels sont vos tarifs ?" }) as InboundEmail);
    expect(lead.company).toBe("Fonderie Aubrac");
    expect(lead.proDomain).toBe(true);
    expect(lead.phone).toBeNull();
  });

  it("messagerie grand public : pas de domaine pro, l'entreprise reprend le nom", () => {
    const lead = extractLead(parseInbound({ from: "Léa Fournier <lea.fournier.demo@gmail.com>", subject: "Devis", text: "Je veux un devis." }) as InboundEmail);
    expect(lead.proDomain).toBe(false);
    expect(lead.company).toBe("Léa Fournier");
  });

  it("déduit le nom de l'adresse quand l'en-tête n'en donne pas", () => {
    const lead = extractLead(parseInbound({ from: "marie.durand@x-corp.example", text: "Bonjour" }) as InboundEmail);
    expect([lead.firstName, lastNameOf(lead)]).toEqual(["Marie", "Durand"]);
  });

  it("reconnaît les formats de téléphone français et internationaux", () => {
    expect(extractPhone("Appelez-moi au 06.12.34.56.78")).toBe("06.12.34.56.78");
    expect(extractPhone("+33 6 12 34 56 78")).toBe("+33 6 12 34 56 78");
    expect(extractPhone("Mobile : 0033612345678")).toBe("0033612345678");
    expect(extractPhone("Réf 2025-0312")).toBeNull();
  });
});

function lastNameOf(l: { lastName: string }) {
  return l.lastName;
}

describe("email collé à la main (simulateur)", () => {
  it("lit les en-têtes (anglais ou français) puis le corps", () => {
    const p = parseRawEmail("De : Paul Roche <paul@fonderie-aubrac.example>\nObjet : Demande de devis\n\nBonjour, je voudrais un devis.") as InboundEmail;
    expect(p.fromEmail).toBe("paul@fonderie-aubrac.example");
    expect(p.subject).toBe("Demande de devis");
    expect(p.text).toBe("Bonjour, je voudrais un devis.");
  });
  it("lit les en-têtes d'automatisme du message collé", () => {
    const p = parseRawEmail("From: robot@x.example\nSubject: Absence\nAuto-Submitted: auto-replied\n\nJe suis absent.") as InboundEmail;
    expect(skipReason(p)).toBe("auto_reply");
  });
  it("refuse un texte sans expéditeur, ou vide", () => {
    expect(parseRawEmail("Bonjour, je voudrais un devis.")).toHaveProperty("error");
    expect(parseRawEmail("   ")).toHaveProperty("error");
  });
});
