// Génère les icônes PWA (PNG) sans dépendance : fond sombre, trois barres de score vertes.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, maskable) {
  const bg = [11, 13, 16], accent = [61, 214, 140], dim = [38, 44, 54];
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const pad = maskable ? size * 0.22 : size * 0.14;
  const inner = size - pad * 2;
  const bars = [0.45, 0.72, 1];
  const bw = inner / 5;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let col = bg;
      if (!maskable) {
        const r = size * 0.18; // coins arrondis
        const dx = Math.min(x, size - 1 - x), dy = Math.min(y, size - 1 - y);
        if (dx < r && dy < r && Math.hypot(r - dx, r - dy) > r) col = null;
      }
      if (col) {
        for (let i = 0; i < 3; i++) {
          const x0 = pad + i * bw * 2 - (i === 0 ? 0 : 0) + (inner - bw * 5) / 2;
          const h = inner * bars[i];
          const y0 = pad + inner - h;
          if (x >= x0 && x < x0 + bw && y >= y0 && y < pad + inner) col = i === 2 ? accent : dim;
        }
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      if (col) { raw[o] = col[0]; raw[o + 1] = col[1]; raw[o + 2] = col[2]; raw[o + 3] = 255; }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", png(192, false));
writeFileSync("public/icons/icon-512.png", png(512, false));
writeFileSync("public/icons/icon-maskable-512.png", png(512, true));
writeFileSync("public/icons/apple-touch-icon.png", png(180, true));
console.log("Icônes générées dans public/icons");
