import { NextResponse } from "next/server";
import { DEMO_COOKIE, DEMO_ORGS, DEMO_USER_COOKIE } from "@/lib/demo/orgs";
import { demoMemberSlot, memberId } from "@/lib/demo/team";
import { isDemoMode } from "@/lib/supabase/env";

/**
 * Bascule d'organisation en mode démo (Maintia, Cas Orus) : mémorise le choix dans un cookie puis ouvre la file de leads.
 * Le rôle simulé est conservé : le même poste (admin, manager, commercial 1 à 3) est repris dans l'autre organisation.
 * `?as=admin` force le poste administrateur (liens d'entrée de la page d'accueil). La valeur de l'organisation est
 * validée contre une liste fermée. Inactif hors mode démo.
 */
export async function GET(request: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const url = new URL(request.url);
  const target = new URL(isDemoMode() ? "/leads" : "/", request.url);
  const response = NextResponse.redirect(target, 303);
  if (!isDemoMode()) return response;
  const meta = DEMO_ORGS.find((o) => o.key === org);
  if (!meta) return NextResponse.redirect(new URL("/leads", request.url), 303);
  const cookieOptions = { path: "/", httpOnly: true, sameSite: "lax" as const, secure: url.protocol === "https:", maxAge: 60 * 60 * 24 * 30 };
  response.cookies.set(DEMO_COOKIE, meta.key, cookieOptions);

  if (url.searchParams.get("as") === "admin") {
    response.cookies.set(DEMO_USER_COOKIE, memberId(meta.key, "admin"), cookieOptions);
    return response;
  }
  const current = /(?:^|;\s*)priora_demo_user=([^;]+)/.exec(request.headers.get("cookie") ?? "")?.[1];
  const slot = current ? demoMemberSlot({ userId: current }) : null;
  if (slot) response.cookies.set(DEMO_USER_COOKIE, memberId(meta.key, slot), cookieOptions);
  else response.cookies.delete(DEMO_USER_COOKIE);
  return response;
}
