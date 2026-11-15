// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

// Genera iconos (bandeja de macOS e icono de la app) sin dependencias: PNG RGBA con zlib.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = (crcTable[(c ^ b) & 0xff] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Supermuestreo 4×4 para bordes suaves.
const ss = (size, inside) => (x, y) => {
  let hit = 0;
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) if (inside((x + (i + 0.5) / 4) / size, (y + (j + 0.5) / 4) / size)) hit++;
  return hit / 16;
};

function trayIcon(size, [r, g, b]) {
  const cover = ss(size, (u, v) => Math.hypot(u - 0.5, v - 0.5) <= 0.38);
  return png(size, (x, y) => [r, g, b, Math.round(255 * cover(x, y))]);
}

function appIcon(size) {
  const bg = ss(size, (u, v) => {
    const du = Math.abs(u - 0.5) - 0.38;
    const dv = Math.abs(v - 0.5) - 0.38;
    return Math.hypot(Math.max(du, 0), Math.max(dv, 0)) <= 0.12;
  });
  const head = ss(size, (u, v) => Math.hypot(u - 0.56, v - 0.34) <= 0.11);
  const spine = ss(size, (u, v) => {
    // curva cervical: arco suave de la cabeza al tronco
    const t = (v - 0.45) / 0.3;
    if (t < 0 || t > 1) return false;
    const cx = 0.5 - 0.06 * Math.sin(Math.PI * t) + 0.04 * t;
    return Math.abs(u - cx) <= 0.028;
  });
  return png(size, (x, y) => {
    const b = bg(x, y);
    if (b === 0) return [0, 0, 0, 0];
    const t = y / size;
    const base = [Math.round(20 + 20 * t), Math.round(120 + 60 * (1 - t)), Math.round(200 - 40 * t)];
    const fg = Math.max(head(x, y), spine(x, y));
    const mix = (c, w) => Math.round(c * (1 - fg) + w * fg);
    return [mix(base[0], 255), mix(base[1], 255), mix(base[2], 255), Math.round(255 * b)];
  });
}

const trayDir = join(root, 'assets', 'tray');
mkdirSync(trayDir, { recursive: true });
const colors = { ok: [48, 209, 88], warn: [255, 214, 10], bad: [255, 69, 58], off: [142, 142, 147] };
for (const [name, rgb] of Object.entries(colors)) {
  writeFileSync(join(trayDir, `${name}.png`), trayIcon(22, rgb));
  writeFileSync(join(trayDir, `${name}@2x.png`), trayIcon(44, rgb));
}
mkdirSync(join(root, 'build'), { recursive: true });
writeFileSync(join(root, 'build', 'icon.png'), appIcon(1024));
console.log('[icons] generados en assets/tray y build/icon.png');
