/**
 * Renders the raster brand assets in public/ from SVG sources:
 * favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png and the Open Graph card og.png.
 *
 * Run it again after changing the logo or the tagline:  node scripts/generate-brand-assets.mjs
 * The outputs are committed, so the site build never depends on this script or on system fonts.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

const publicDir = path.resolve(import.meta.dirname, '../public');

const INK = '#0b1a20';
const BRASS = '#c8a35f';
const BRASS_LIGHT = '#dcc08a';
const PAPER = '#e9ece8';
const MUTED = '#a0b0b5';

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

async function renderIcons() {
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
}

/** A reduced version of the hero elevation, used as the artwork on the social card. */
function elevation() {
  const slabs = [400, 360, 320, 280, 240, 200, 160];

  const tower = [
    ...[150, 240, 330].map((x) => `<path d="M${x} 440V124"/>`),
    ...slabs.map((y) => `<rect x="144" y="${y}" width="192" height="5"/>`),
  ].join('');

  const lowBlock = `
    <path d="M420 440V341M510 440V341"/>
    <rect x="330" y="376" width="186" height="5"/>
    <rect x="330" y="336" width="186" height="5"/>
    <path d="M349 440v-28a26 26 0 0 1 52 0v28M439 440v-28a26 26 0 0 1 52 0v28"/>
    <path d="M336 336v-10h180v10M401 326a22 22 0 0 1 44 0M423 304v-11"/>`;

  const crane = `
    <path d="M84 440V76M96 440V76M80 64h20v12H80zM84 64l6-34 6 34M36 64h264M102 56h186l12 8"/>
    <path d="M36 64h22v18H36zM285 68v30M281.5 98h7v6h-7z"/>`;

  const grid = [150, 240, 330, 420, 510]
    .map((x, index) => {
      const letter = 'ABCDE'[index];

      return `
        <path d="M${x} 92V463" stroke-dasharray="10 3 2 3" opacity="0.45"/>
        <circle cx="${x}" cy="476" r="13"/>
        <text x="${x}" y="480" text-anchor="middle" font-size="10" font-weight="600" fill="${BRASS_LIGHT}" stroke="none">${letter}</text>`;
    })
    .join('');

  return `
    <g fill="none" stroke="${PAPER}" stroke-width="1.4" stroke-opacity="0.85">
      <path d="M70 440h542"/>
      ${tower}
      ${lowBlock}
      ${crane}
    </g>

    <g fill="none" stroke="${BRASS}" stroke-width="1">
      <circle cx="430" cy="230" r="132" opacity="0.45"/>
      <circle cx="528" cy="142" r="3.5" fill="${BRASS}" stroke="none"/>
      ${grid}
      <rect x="261" y="116" width="48" height="4"/>
    </g>`;
}

async function renderSocialCard() {
  const font = "Georgia, 'Times New Roman', serif";
  const sans = "'Helvetica Neue', Helvetica, Arial, sans-serif";

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
      <rect width="1200" height="630" fill="${INK}"/>

      <g transform="translate(640 84) scale(0.86)">${elevation()}</g>

      <g font-family="${sans}" font-weight="600" letter-spacing="3.5">
        <path d="M80 104h34M80 99v10M114 99v10" stroke="${BRASS}" fill="none"/>
        <text x="130" y="110" font-size="17" fill="${BRASS_LIGHT}">AL MADAR MGM CONSTRUCTION LLC</text>
      </g>

      <g font-family="${font}" font-size="68" letter-spacing="-1.2">
        <text x="78" y="232" fill="${PAPER}">47 Years of</text>
        <text x="78" y="306" fill="${PAPER}">Building Trust.</text>
        <text x="78" y="380" fill="${BRASS_LIGHT}">A Future of</text>
        <text x="78" y="454" fill="${BRASS_LIGHT}">Building Excellence.</text>
      </g>

      <path d="M80 512h470" stroke="${PAPER}" stroke-opacity="0.25"/>
      <text x="80" y="552" font-family="${sans}" font-size="20" fill="${MUTED}">Construction company in Dubai, UAE · Established 1979</text>
    </svg>`;

  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(path.join(publicDir, 'og.png'));
}

await renderIcons();
await renderSocialCard();

console.log('Brand assets written to public/');
