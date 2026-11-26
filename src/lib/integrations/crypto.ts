import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Chiffrement des jetons d'intégration au repos : AES-256-GCM, clé INTEGRATIONS_ENCRYPTION_KEY (32 octets en base64).
 * Générer une clé : `openssl rand -base64 32`. Le contexte (organisation + fournisseur) est authentifié avec le texte :
 * un jeton recopié dans la ligne d'une autre organisation ne se déchiffre pas.
 * Format : v1.<iv>.<tag>.<texte chiffré>, en base64url.
 */

export class EncryptionKeyError extends Error {}

export function loadEncryptionKey(material: string | undefined = process.env.INTEGRATIONS_ENCRYPTION_KEY): Buffer {
  if (!material) throw new EncryptionKeyError("INTEGRATIONS_ENCRYPTION_KEY manquante : impossible de stocker un jeton de façon sûre.");
  const key = Buffer.from(material.trim(), "base64");
  if (key.length !== 32) throw new EncryptionKeyError("INTEGRATIONS_ENCRYPTION_KEY doit être 32 octets en base64 (openssl rand -base64 32).");
  return key;
}

export function encryptSecret(plain: string, context: string, key: Buffer = loadEncryptionKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(blob: string, context: string, key: Buffer = loadEncryptionKey()): string {
  const [version, iv, tag, data] = blob.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Jeton chiffré illisible.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  try {
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Jeton chiffré invalide (clé de chiffrement changée ou données altérées). Reconnectez HubSpot.");
  }
}
