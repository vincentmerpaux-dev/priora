// Captures réelles de l'application (Edge ou Chrome installé, via playwright-core) pour la page d'accueil.
// Usage : lancer l'appli (npm run start, ou npm run dev) puis `node scripts/capture-screenshots.mjs [http://localhost:3000]`.
// Sortie : public/shots/<écran>-<thème>.webp (1280x800, WebP optimisé). Données de démonstration uniquement.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { chromium } from "playwright-core";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "shots");
await mkdir(out, { recursive: true });

const SCREENS = [
  { name: "calibration", path: "/calibration" },
  { name: "dashboard", path: "/dashboard" },
];

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "msedge" });
try {
  for (const theme of ["dark", "light"]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: "fr-FR", reducedMotion: "reduce" });
    // Visite guidée déjà « terminée » : elle ne doit pas apparaître sur les captures.
    await context.addInitScript(() => { try { localStorage.setItem("priora-tour-v1", JSON.stringify({ step: 0, done: true })); } catch { /* ignoré */ } });
    await context.addCookies([{ name: "priora-theme", value: theme, url: base }]);
    const page = await context.newPage();
    await page.goto(`${base}/demo/maintia?as=admin`, { waitUntil: "networkidle" });
    for (const s of SCREENS) {
      await page.goto(`${base}${s.path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      const png = await page.screenshot({ type: "png" });
      const file = path.join(out, `${s.name}-${theme}.webp`);
      const info = await sharp(png).webp({ quality: 80, effort: 6 }).toFile(file);
      console.log(`${file} ${info.width}x${info.height} ${(info.size / 1024).toFixed(0)} Ko`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
