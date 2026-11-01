// Renders the synthetic documents (server/test/fixtures/synthetic-docs.js) to images in server/test/fixtures/docs/.
// Run once on a machine with Nirmala UI (Devanagari) and Ink Free (handwriting-style) fonts, e.g. Windows, and commit the images:
//   node server/scripts/make-synthetic-docs.mjs
// The images are committed so CI (Linux, without those fonts) can still run the OCR tests.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { SYNTHETIC } from '../test/fixtures/synthetic-docs.js';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'docs');
mkdirSync(out, { recursive: true });
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const FONT = { printed: 'Nirmala UI, Arial', scan: 'Nirmala UI, Arial', script: 'Ink Free, Segoe Script' };

async function render(doc) {
  const size = doc.style === 'script' ? 42 : 38;
  const gap = Math.round(size * 1.9);
  const width = 1200;
  const height = 90 + doc.lines.length * gap;
  const bg = doc.style === 'scan' ? '#efece4' : '#ffffff';
  const text = doc.lines.map((l, i) => `<text x="50" y="${80 + i * gap}" font-size="${size}" font-family="${FONT[doc.style]}" fill="#111">${esc(l)}</text>`).join('');
  let img = sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${bg}"/>${text}</svg>`)).png();
  if (doc.style !== 'scan') return { buf: await img.toBuffer(), ext: 'png' };

  // scan-like degradation: slight tilt, grain, softness and JPEG compression
  const tilted = await img.rotate(2.2, { background: bg }).blur(1.1).toBuffer();
  const meta = await sharp(tilted).metadata();
  const grain = await sharp({ create: { width: meta.width, height: meta.height, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 45 } } }).png().toBuffer();
  const buf = await sharp(tilted).composite([{ input: grain, blend: 'overlay' }]).modulate({ brightness: 0.97 }).jpeg({ quality: 45 }).toBuffer();
  return { buf, ext: 'jpg' };
}

const index = [];
for (const doc of SYNTHETIC) {
  const { buf, ext } = await render(doc);
  const file = `${doc.id}.${ext}`;
  writeFileSync(path.join(out, file), buf);
  index.push({ id: doc.id, file, lang: doc.lang, docType: doc.docType, style: doc.style });
  console.log('wrote', file, `${(buf.length / 1024).toFixed(0)} KB`);
}
writeFileSync(path.join(out, 'index.json'), JSON.stringify(index, null, 2));
