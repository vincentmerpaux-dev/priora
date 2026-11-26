import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/supabase/env";

/** Seule la page d'accueil est à indexer : la démo (bacs à sable par visiteur) et les API n'ont rien à faire dans un moteur de recherche. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/demo/", "/leads", "/pipeline", "/dashboard", "/calibration", "/objections", "/team", "/settings", "/f/", "/login", "/onboarding"] },
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
