// Rejoue le parcours de démo et enregistre une vidéo sans voix (WebM, 1920x1080), à sonoriser ensuite avec docs/video-demo.md.
// Prérequis : l'appli tourne (npm run start avec PRIORA_PUBLIC_DEMO=true, ou npm run dev) ; Edge ou Chrome installé ;
// une fois : `npx playwright-core install ffmpeg` (petit binaire servant à l'encodage vidéo).
// Usage : node scripts/record-demo.mjs [http://localhost:3000]   ->   docs/video/demo-priora.webm
import { mkdir, rename, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "docs", "video");
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "msedge" });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: outDir, size: { width: 1920, height: 1080 } },
  locale: "fr-FR",
});
// La visite guidée est volontairement désactivée pendant l'enregistrement (elle se montre séparément si besoin).
await context.addInitScript(() => {
  try { localStorage.setItem("priora-tour-v2", JSON.stringify({ step: 0, done: true })); } catch { /* ignoré */ }
  // Curseur visible dans la vidéo : un point qui suit la souris.
  window.addEventListener("DOMContentLoaded", () => {
    const dot = document.createElement("div");
    dot.style.cssText = "position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(61,214,140,.45);border:2px solid #3dd68c;pointer-events:none;transition:transform .08s";
    document.body.appendChild(dot);
    window.addEventListener("mousemove", (e) => { dot.style.left = e.clientX + "px"; dot.style.top = e.clientY + "px"; }, true);
  });
});
const page = await context.newPage();
const pause = (ms) => page.waitForTimeout(ms);
async function moveClick(locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
  await pause(250);
  await locator.click();
}

// 1. Accueil (0:00)
await page.goto(base + "/");
await pause(6000);
await page.mouse.wheel(0, 700); await pause(2500);
await page.mouse.wheel(0, -700); await pause(1000);

// 2. Démo en un clic, file priorisée
await moveClick(page.getByRole("link", { name: "Essayer la démo" }).first());
await page.waitForURL("**/leads");
await pause(5000);

// 3. Fiche lead : score, verdict, script
await moveClick(page.locator('a[href^="/leads/"]:not([href="/leads/new"]):not([href="/leads/import"])').first());
await pause(4000);
await page.mouse.wheel(0, 500); await pause(3500);
await page.mouse.wheel(0, 700); await pause(3500);

// 4. Voir en tant que : commercial puis retour admin
await page.goto(base + "/leads"); await pause(1500);
// Le sélecteur « Voir en tant que » est une liste native (visible en barre latérale desktop).
async function viewAs(pattern) {
  const select = page.getByLabel("Voir en tant que").first();
  await select.scrollIntoViewIfNeeded();
  const label = (await select.locator("option").allTextContents()).find((t) => pattern.test(t));
  await select.selectOption({ label });
}
await viewAs(/Camille Rousset/);
await page.waitForURL("**/leads"); await pause(4000);
await viewAs(/Hélène Marchal/);
await page.waitForURL("**/leads"); await pause(1500);

// 5. Tableau de bord puis calibration
await moveClick(page.getByRole("link", { name: "Pilotage" }).first());
await page.waitForURL("**/dashboard"); await pause(5000);
await moveClick(page.getByRole("link", { name: "Calibration" }).first());
await page.waitForURL("**/calibration"); await pause(4000);
await page.mouse.wheel(0, 650); await pause(5000);
await page.mouse.wheel(0, 650); await pause(5000);

// 6. Cas Orus
await page.goto(base + "/"); await pause(1000);
await moveClick(page.getByRole("link", { name: "Voir le cas Orus" }).first());
await page.waitForURL("**/leads"); await pause(6000);

const video = page.video();
await context.close();
await browser.close();
const tmp = video ? await video.path() : null;
if (tmp) {
  const target = path.join(outDir, "demo-priora.webm");
  await rename(tmp, target);
  console.log("Vidéo enregistrée :", target);
} else {
  console.log("Aucune vidéo produite. Fichiers :", await readdir(outDir));
}
