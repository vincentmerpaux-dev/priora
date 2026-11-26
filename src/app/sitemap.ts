import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/supabase/env";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = appUrl();
  return [
    { url: `${base}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/legal/confidentialite`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/legal/cgu`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
