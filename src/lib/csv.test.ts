import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { guessField, normalizeWebhookPayload } from "./validation";

describe("parseCsv", () => {
  it("gère les guillemets, les virgules dans les champs et le BOM", () => {
    const r = parseCsv('﻿nom,email,message\n"Dupont, Jean",jean@x.test,"Il dit ""bonjour"""\n');
    expect(r.headers).toEqual(["nom", "email", "message"]);
    expect(r.rows[0]).toEqual(["Dupont, Jean", "jean@x.test", 'Il dit "bonjour"']);
  });

  it("détecte le point-virgule et ignore les lignes vides", () => {
    const r = parseCsv("a;b\r\n1;2\r\n\r\n3;4");
    expect(r.delimiter).toBe(";");
    expect(r.rows).toEqual([["1", "2"], ["3", "4"]]);
  });
});

describe("mapping de colonnes", () => {
  it("reconnaît les en-têtes français et anglais", () => {
    expect(guessField("Prénom")).toBe("firstName");
    expect(guessField("E-mail")).toBe("email");
    expect(guessField("Société")).toBe("company");
    expect(guessField("inconnu")).toBeNull();
  });

  it("normalise un payload de webhook et sépare le nom complet", () => {
    const out = normalizeWebhookPayload({ full_name: "Marie Curie", Email: "m@x.test", entreprise: "Labo", extra: "ignoré" });
    expect(out).toMatchObject({ firstName: "Marie", lastName: "Curie", email: "m@x.test", company: "Labo" });
    expect(out).not.toHaveProperty("extra");
  });
});
