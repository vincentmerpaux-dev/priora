// Limiteur en mémoire (par instance serveur). Protège le budget et la base contre les rafales ;
// pour une protection forte en production, ajouter un limiteur partagé (Upstash, Vercel Firewall).
// Fichier sans dépendance serveur : utilisable depuis le proxy comme depuis les actions.
const buckets = new Map<string, number[]>();

export function rateLimit(bucket: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(bucket) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(bucket, hits);
    return false;
  }
  hits.push(now);
  buckets.set(bucket, hits);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
  }
  return true;
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
