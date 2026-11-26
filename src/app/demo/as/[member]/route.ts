import { NextResponse } from "next/server";
import { DEMO_USER_COOKIE, demoOrgByKey } from "@/lib/demo/orgs";
import { DEMO_SID_COOKIE, isValidSid } from "@/lib/demo/sandbox-id";
import { demoMembers } from "@/lib/repo/demo";
import { isDemoMode, isPublicDemo } from "@/lib/supabase/env";

/**
 * "Voir en tant que" (mode démo) : mémorise le membre simulé dans un cookie puis revient sur la page d'origine.
 * L'identifiant est validé contre les membres actifs de l'organisation courante (dans le bac à sable du visiteur
 * en démo publique) ; la destination doit être un chemin interne. Inactif hors mode démo.
 */
export async function GET(request: Request, { params }: { params: Promise<{ member: string }> }) {
  const { member } = await params;
  const url = new URL(request.url);
  const next = url.searchParams.get("next") ?? "/leads";
  const safeNext = next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/leads";
  const response = NextResponse.redirect(new URL(isDemoMode() ? safeNext : "/", request.url), 303);
  if (!isDemoMode()) return response;

  const cookie = request.headers.get("cookie") ?? "";
  const orgKey = /(?:^|;\s*)priora_demo_org=([^;]+)/.exec(cookie)?.[1];
  const sidRaw = new RegExp(`(?:^|;\s*)${DEMO_SID_COOKIE}=([^;]+)`).exec(cookie)?.[1];
  const org = demoOrgByKey(orgKey);
  const found = demoMembers(org.id, isPublicDemo() ? (isValidSid(sidRaw) ? sidRaw : undefined) : undefined).find((m) => m.userId === member && m.active);
  if (!found) return NextResponse.redirect(new URL("/leads", request.url), 303);
  response.cookies.set(DEMO_USER_COOKIE, found.userId, { path: "/", httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", maxAge: 60 * 60 * 24 * 30 });
  return response;
}
