import type { Metadata } from "next";
import { About, Calibration, DemoBand, Features, Hero, HowItWorks, Problem, SiteFooter, SiteHeader, Stack } from "@/components/landing/sections";
import { SITE } from "@/config/site";
import { appUrl, isDemoMode } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: { absolute: `Priora : ${SITE.tagline.toLowerCase()}` },
  description: SITE.description,
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: SITE.locale, siteName: SITE.name, title: `Priora : ${SITE.tagline.toLowerCase()}`, description: SITE.description, url: "/" },
  twitter: { card: "summary_large_image", title: `Priora : ${SITE.tagline.toLowerCase()}`, description: SITE.description },
};

/** Données structurées : aucune note, aucun avis, aucun prix (Priora n'a ni clients ni offre commerciale). */
function jsonLd() {
  const url = appUrl();
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE.name,
    description: SITE.description,
    url,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "fr",
    author: { "@type": "Person", name: SITE.author.name },
  };
}

export default function Home() {
  const demo = isDemoMode();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()).replace(/</g, "\u003c") }} />
      <SiteHeader demo={demo} />
      <main id="contenu">
        <Hero demo={demo} />
        <Problem />
        <HowItWorks />
        <Features />
        <Calibration demo={demo} />
        <DemoBand demo={demo} />
        <Stack />
        <About />
      </main>
      <SiteFooter demo={demo} />
    </>
  );
}
