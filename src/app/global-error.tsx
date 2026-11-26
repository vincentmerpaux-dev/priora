"use client";

import "./globals.css";

/** Dernier filet : erreur dans le layout racine. Styles minimaux et autonomes, aucune dépendance au reste de l'application. */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="fr" data-theme="dark">
      <body style={{ minHeight: "100dvh", margin: 0, display: "grid", placeItems: "center", padding: "1.5rem" }}>
        <main id="contenu" role="alert" style={{ maxWidth: "26rem" }}>
          <p className="num" style={{ color: "var(--warn)", fontSize: 14, margin: 0 }}>Erreur</p>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: "0.5rem 0" }}>Priora est momentanément indisponible.</h1>
          <p style={{ color: "var(--muted)", margin: "0 0 1rem" }}>Réessayez dans un instant. Aucune donnée n&apos;a été perdue.</p>
          <button type="button" onClick={() => retry()} style={{ background: "var(--accent)", color: "var(--accent-fg)", border: 0, borderRadius: 6, padding: "0.6rem 1.1rem", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Réessayer</button>
        </main>
      </body>
    </html>
  );
}
