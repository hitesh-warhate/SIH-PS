import { readFileSync } from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import { SYNTHETIC } from './fixtures/synthetic-docs.js';

export const fixture = (name) => readFileSync(new URL(`./fixtures/docs/${name}`, import.meta.url));
export const index = JSON.parse(readFileSync(new URL('./fixtures/docs/index.json', import.meta.url), 'utf8'));
const byBytes = index.map((e) => ({ buf: fixture(e.file), doc: SYNTHETIC.find((d) => d.id === e.id) }));

// A stand-in OCR engine: returns the known text of a fixture image (as if read perfectly) without running Tesseract, so API tests
// are fast. `fail(buf, call)` may throw to simulate an engine failure; `confidence` simulates a poor read.
export function fakeEngine({ fail, confidence = 0.95 } = {}) {
  const calls = new Map();
  return {
    name: 'fake',
    calls,
    async recognizeImage(buf) {
      const key = buf.subarray(0, 64).toString('hex') + buf.length;
      calls.set(key, (calls.get(key) ?? 0) + 1);
      if (fail) await fail(buf, calls.get(key));
      const hit = byBytes.find((x) => x.buf.equals(buf));
      const texts = hit ? hit.doc.lines : ['Unrecognised document'];
      return { pages: [{ page: 1, width: 1200, height: 800, lines: texts.map((text, i) => ({ text, confidence, bbox: { x0: 50, y0: 40 + i * 70, x1: 900, y1: 90 + i * 70 } })) }] };
    },
  };
}

export const png = (id) => fixture(`${id}.png`);
export const jpg = (id) => fixture(`${id}.jpg`);
export const blurred = async () => sharp(fixture('en-rx-printed.png')).blur(6).png().toBuffer();
export const tooDark = async () => sharp(fixture('en-rx-printed.png')).modulate({ brightness: 0.15 }).png().toBuffer();
export const tiny = async () => sharp(fixture('en-rx-printed.png')).resize({ width: 300 }).png().toBuffer();
export const cutOff = async () => sharp(fixture('en-rx-printed.png')).extract({ left: 55, top: 0, width: 1100, height: 400 }).png().toBuffer();
// A file that has the right first bytes for a PNG but is not an image: it passes the type check and fails on reading.
export const corruptPng = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(2000, 7)]);

export async function textPdf(lines, pages = 1) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let p = 0; p < pages; p++) {
    const page = doc.addPage([595, 842]);
    lines.forEach((t, i) => page.drawText(t, { x: 50, y: 780 - i * 24, size: 13, font }));
  }
  return Buffer.from(await doc.save());
}
export async function blankPdf(pages = 1) {
  const doc = await PDFDocument.create();
  for (let p = 0; p < pages; p++) doc.addPage([595, 842]);
  return Buffer.from(await doc.save());
}
