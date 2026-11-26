import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Politique de sécurité du contenu, compatible avec l'appli :
 * - scripts : 'self' + inline (hydratation Next.js et script de données structurées) ; 'unsafe-eval' seulement en développement ;
 * - styles inline (attributs style de React, balises de style générées par Next.js) ;
 * - images : propres, data: et blob: (captures, icônes) ; polices : propres (fontsource, fichiers locaux) ;
 * - connect-src 'self' : le navigateur n'appelle que Priora (tous les appels externes, HubSpot, IA, registre, partent du serveur) ;
 * - object, base et form-action verrouillés.
 * Une CSP à nonce serait plus stricte mais rendrait toutes les pages dynamiques sans cache ; compromis assumé, à revoir en V2.
 */
function csp(frameAncestors: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'" + (isProd ? "" : " ws: wss:"),
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
  ].join("; ");
}

const baseHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Permet forbidden() (403) dans les pages réservées à certains rôles.
  experimental: { authInterrupts: true },
  // Adresses déduites du menu (Pilotage, Réglages et ses onglets) : renvoyées vers les vraies pages.
  async redirects() {
    return [
      { source: "/pilotage", destination: "/dashboard", permanent: false },
      { source: "/reglages", destination: "/settings", permanent: false },
      { source: "/settings/team", destination: "/team", permanent: false },
      { source: "/settings/objections", destination: "/objections", permanent: false },
    ];
  },
  async headers() {
    return [
      // Tout le produit refuse d'être intégré dans une iframe...
      {
        source: "/((?!f/).*)",
        headers: [...baseHeaders, { key: "X-Frame-Options", value: "DENY" }, { key: "Content-Security-Policy", value: csp("'none'") }],
      },
      // ...sauf le formulaire public, conçu pour être intégré chez le client (pas de X-Frame-Options).
      {
        source: "/f/:path*",
        headers: [...baseHeaders, { key: "Content-Security-Policy", value: csp("*") }],
      },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      // Captures de la page d'accueil : contenu immuable (le nom change si l'image change).
      { source: "/shots/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
};

export default nextConfig;
