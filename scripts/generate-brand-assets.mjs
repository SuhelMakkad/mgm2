/**
 * Renders the raster icons in public/ from public/favicon.svg:
 * favicon.ico, apple-touch-icon.png, icon-192.png and icon-512.png.
 *
 * Run it again after changing the logo:  bun run assets
 * The outputs are committed, so the site build never depends on this script.
 *
 * The social card (public/og.jpg) is a 1200x630 capture of the home page hero,
 * so it always matches the live typography. Re-capture it after changing the hero.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

const publicDir = path.resolve(import.meta.dirname, '../public');

/** Wraps a PNG in a single-image ICO container (ICO files may embed PNG data directly). */
function pngToIco(png, size) {
  const header = Buffer.alloc(6);

  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);

  entry.writeUInt8(size, 0);
  entry.writeUInt8(size, 1);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  return Buffer.concat([header, entry, png]);
}

const favicon = await readFile(path.join(publicDir, 'favicon.svg'));

const sizes = [
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
];

for (const { file, size } of sizes) {
  await sharp(favicon, { density: 600 }).resize(size, size).png().toFile(path.join(publicDir, file));
}

const small = await sharp(favicon, { density: 600 }).resize(32, 32).png().toBuffer();

await writeFile(path.join(publicDir, 'favicon.ico'), pngToIco(small, 32));

console.log('Icons written to public/');
