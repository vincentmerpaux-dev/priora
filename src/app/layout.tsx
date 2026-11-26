import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "@fontsource-variable/inter-tight";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { PwaRegister } from "@/components/app/pwa-register";
import { SITE } from "@/config/site";
import { appUrl } from "@/lib/supabase/env";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: { default: "Priora", template: "%s | Priora" },
  description: SITE.description,
  openGraph: { type: "website", locale: SITE.locale, siteName: SITE.name },
  applicationName: "Priora",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Priora", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0B0D10" },
    { media: "(prefers-color-scheme: light)", color: "#F5F6F8" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("priora-theme")?.value === "light" ? "light" : "dark";
  return (
    <html lang="fr" data-theme={theme} suppressHydrationWarning>
      <body className="min-h-[100dvh]">
        <a href="#contenu" className="sr-only z-[100] rounded-[var(--radius)] bg-accent px-3 py-2 text-[13px] font-medium text-accent-fg focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Aller au contenu</a>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
