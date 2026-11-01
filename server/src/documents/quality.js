import sharp from 'sharp';
import { QUALITY } from './config.js';

// Reasons a photo or scan is asked to be retaken (PRD 6.4). Each is a stable code the screen turns into a clear prompt:
//   unreadable | low_resolution | too_dark | blank_or_overexposed | blurry | cut_off_edges
// All measures are computed on the decoded pixels (a grey copy at most 800 px wide), so they are quick and need no OCR.
export async function checkImageQuality(buf) {
  let meta;
  let grey;
  try {
    meta = await sharp(buf).metadata();
    if (!meta.width || !meta.height) throw new Error('no size');
    grey = await sharp(buf).rotate().resize({ width: 800, withoutEnlargement: true }).greyscale().raw().toBuffer({ resolveWithObject: true });
  } catch {
    return { ok: false, issues: ['unreadable'], metrics: {} };
  }
  const { data, info } = grey;
  const { width: w, height: h } = info;
  const at = (x, y) => data[y * w + x];

  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  const mean = sum / data.length;
  let sq = 0;
  for (let i = 0; i < data.length; i++) sq += (data[i] - mean) ** 2;
  const contrast = Math.sqrt(sq / data.length);

  // sharpness: how strongly the page changes from pixel to pixel (Laplacian). Crisp text has hard edges; blur removes them.
  let lap = 0, lapSq = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const v = at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1) - 4 * at(x, y);
      lap += v; lapSq += v * v; n++;
    }
  }
  const sharpness = Math.sqrt(Math.max(0, lapSq / n - (lap / n) ** 2));

  // ink in the outer edge strips: a page with margins has none; text running off the picture means it was cropped
  const strip = Math.max(2, Math.round(w * 0.012));
  const inked = (cells) => cells.filter((c) => c).length / cells.length;
  const rows = (x0) => Array.from({ length: h }, (_, y) => { for (let x = x0; x < x0 + strip; x++) if (at(x, y) < 90) return true; return false; });
  const cols = (y0) => Array.from({ length: w }, (_, x) => { for (let y = y0; y < y0 + strip; y++) if (at(x, y) < 90) return true; return false; });
  const borderInk = Math.max(inked(rows(0)), inked(rows(w - strip)), inked(cols(0)), inked(cols(h - strip)));

  const issues = [];
  if (meta.width < QUALITY.minWidth) issues.push('low_resolution');
  if (mean < QUALITY.minMean) issues.push('too_dark');
  else if (mean > QUALITY.blankMean && contrast < 10) issues.push('blank_or_overexposed');
  else {
    if (sharpness < QUALITY.minSharpness) issues.push('blurry');
    if (borderInk > QUALITY.borderInkRatio) issues.push('cut_off_edges');
  }
  return { ok: issues.length === 0, issues, metrics: { width: meta.width, height: meta.height, mean: +mean.toFixed(1), contrast: +contrast.toFixed(1), sharpness: +sharpness.toFixed(1), borderInk: +borderInk.toFixed(3) } };
}
