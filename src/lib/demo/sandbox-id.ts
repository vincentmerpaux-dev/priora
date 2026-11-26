/** Identifiant de session démo : un UUID, rien d'autre (la valeur du cookie vient du client, elle est validée). */
export const SID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DEMO_SID_COOKIE = "priora_demo_sid";
export const isValidSid = (v: string | undefined | null): v is string => typeof v === "string" && SID_PATTERN.test(v);
