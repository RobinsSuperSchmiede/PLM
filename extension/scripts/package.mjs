#!/usr/bin/env node
// Erstellt das ZIP der Erweiterung: dist/anamnesies-web-notes-<version>.zip
// Ohne Abhängigkeiten – nur Node.js (>= 18).  Aufruf:  node scripts/package.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Nur diese Dateien gehören in die Erweiterung
const FILES = [
  'manifest.json',
  'background.js',
  'api.js',
  'ds.css',
  'md.js',
  'content.js',
  'popup.html', 'popup.css', 'popup.js',
  'manager.html', 'manager.css', 'manager.js',
  'icons/icon16.png', 'icons/icon32.png', 'icons/icon48.png', 'icons/icon128.png',
  'LICENSE'
];

function fail(msg) {
  console.error('✗ ' + msg);
  process.exit(1);
}

// ---------- Prüfungen ----------

const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
if (!/^\d+(\.\d+){0,3}$/.test(manifest.version)) fail(`Ungültige Version im Manifest: ${manifest.version}`);

for (const f of FILES) if (!existsSync(join(root, f))) fail(`Datei fehlt: ${f}`);

// Alle im Manifest und in den HTML-Seiten referenzierten Dateien müssen im Paket sein
const referenced = new Set([
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  manifest.options_page,
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
  ...(manifest.content_scripts || []).flatMap((c) => [...(c.js || []), ...(c.css || [])])
].filter(Boolean));
for (const html of FILES.filter((f) => f.endsWith('.html'))) {
  const src = readFileSync(join(root, html), 'utf8');
  for (const m of src.matchAll(/(?:src|href)="([^":#]+?)"/g)) referenced.add(m[1].replace(/^\.?\//, ''));
}
for (const r of referenced) if (!FILES.includes(r)) fail(`Referenziert, aber nicht im Paket: ${r}`);

// ---------- ZIP schreiben ----------

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function dosDateTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  };
}

const locals = [];
const centrals = [];
let offset = 0;

for (const name of FILES) {
  const data = readFileSync(join(root, name));
  const deflated = deflateRawSync(data, { level: 9 });
  const useDeflate = deflated.length < data.length;
  const body = useDeflate ? deflated : data;
  const crc = crc32(data);
  const { time, date } = dosDateTime(statSync(join(root, name)).mtime);
  const nameBuf = Buffer.from(name, 'utf8');

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);              // version needed
  local.writeUInt16LE(0x0800, 6);          // UTF-8-Dateinamen
  local.writeUInt16LE(useDeflate ? 8 : 0, 8);
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(date, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  locals.push(local, nameBuf, body);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);            // version made by
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(useDeflate ? 8 : 0, 10);
  central.writeUInt16LE(time, 12);
  central.writeUInt16LE(date, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, nameBuf);

  offset += local.length + nameBuf.length + body.length;
}

const centralSize = centrals.reduce((s, b) => s + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(FILES.length, 8);
end.writeUInt16LE(FILES.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

const outDir = join(root, 'dist');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `anamnesies-web-notes-${manifest.version}.zip`);
const zip = Buffer.concat([...locals, ...centrals, end]);
writeFileSync(outFile, zip);

console.log(`✓ ${FILES.length} Dateien gepackt → dist/anamnesies-web-notes-${manifest.version}.zip (${(zip.length / 1024).toFixed(1)} KB)`);
