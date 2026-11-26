import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_SID_COOKIE, isValidSid } from "@/lib/demo/sandbox-id";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Rafraîchit la session Supabase et protège les pages privées.
 * Mode démo (variables Supabase absentes) : aucune redirection.
 * La vraie vérification d'accès reste faite côté serveur dans chaque page (requireOrg) et par le RLS.
 */
const PUBLIC_PREFIXES = ["/sitemap.xml", "/robots.txt", "/opengraph-image", "/twitter-image", "/login", "/auth", "/f/", "/api/webhooks", "/api/inbound", "/api/cron", "/legal", "/offline", "/account-disabled", "/manifest", "/sw.js"];

/**
 * Démo publique (PRIORA_PUBLIC_DEMO=true) : chaque visiteur reçoit un cookie de session démo (UUID aléatoire) qui désigne
 * son bac à sable en mémoire. Les visiteurs sans cookie sont limités par IP, pour qu'un script ne puisse pas saturer la mémoire.
 */
function publicDemo(request: NextRequest): NextResponse {
  // Pages publiques (accueil, légal, SEO, API externes) : pas de bac à sable, donc pas de cookie.
  const path = request.nextUrl.pathname;
  if (path === "/" || PUBLIC_PREFIXES.some((p) => path.startsWith(p))) return NextResponse.next();
  const existing = request.cookies.get(DEMO_SID_COOKIE)?.value;
  if (isValidSid(existing)) return NextResponse.next();
  if (!rateLimit(`demo-new:${clientIp(request.headers)}`, 40, 10 * 60_000)) {
    return new NextResponse("Trop de visites depuis votre réseau en peu de temps. Réessayez dans quelques minutes.", {
      status: 429, headers: { "Retry-After": "300", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const sid = crypto.randomUUID();
  // Le cookie est aussi posé sur la requête : la page en cours de rendu le voit tout de suite.
  request.cookies.set(DEMO_SID_COOKIE, sid);
  const response = NextResponse.next({ request });
  response.cookies.set(DEMO_SID_COOKIE, sid, { path: "/", httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", maxAge: 60 * 60 * 24 });
  return response;
}

export async function proxy(request: NextRequest) {
  if (process.env.PRIORA_PUBLIC_DEMO === "true") return publicDemo(request);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = path === "/" || PUBLIC_PREFIXES.some((p) => path.startsWith(p));
  if (!data.user && !isPublic) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|webmanifest)$).*)"],
};
