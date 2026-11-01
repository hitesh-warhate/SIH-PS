import sharp from 'sharp';
import { OCR_LANGS } from './config.js';
import { pdfTextLines } from './files.js';

// A document read is { pages: [{ page, width, height, lines: [{ text, confidence (0..1), bbox: {x0,y0,x1,y1} }] }] }.
// The engine is replaceable (Bhashini, a cloud OCR, or a model tuned on Indian prescriptions) behind recognizeImage().
export class AttentionError extends Error {
  constructor(reason, message) { super(message ?? reason); this.reason = reason; }
}

export function createTesseractEngine({ cachePath = '.data/tessdata', workers = 2, langs = OCR_LANGS } = {}) {
  let scheduler = null;
  const ready = async () => {
    if (scheduler) return scheduler;
    scheduler = (async () => {
      const { createScheduler, createWorker } = await import('tesseract.js');
      const s = createScheduler();
      for (let i = 0; i < workers; i++) s.addWorker(await createWorker(langs, 1, { cachePath }));
      return s;
    })().catch((err) => { scheduler = null; throw err; }); // a failed start is retried on the next call, not remembered
    return scheduler;
  };
  return {
    name: 'tesseract',
    async recognizeImage(buf) {
      // normalise orientation and format, and cap the size so a 12-megapixel photo does not take a minute
      const png = await sharp(buf).rotate().resize({ width: 2400, withoutEnlargement: true }).png().toBuffer();
      const { width, height } = await sharp(png).metadata();
      const s = await ready();
      const { data } = await s.addJob('recognize', png, {}, { blocks: true });
      const lines = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
        .map((l) => ({ text: l.text.replace(/\s+/g, ' ').trim(), confidence: Math.max(0, Math.min(1, l.confidence / 100)), bbox: l.bbox }))
        .filter((l) => l.text);
      return { pages: [{ page: 1, width, height, lines }] };
    },
    // Used by the monitor: can the engine start (models present, workers running)?
    async health() {
      try { const s = await ready(); return { ok: true, workers: s.getNumWorkers?.() ?? workers }; } catch (err) { return { ok: false, error: String(err.message).slice(0, 200) }; }
    },
    async close() { if (scheduler) await (await scheduler).terminate(); scheduler = null; },
  };
}

// Reads any accepted file: photos and scans through the OCR engine, PDFs through their own text layer.
export function createDocumentReader({ engine }) {
  return {
    engine: engine.name,
    async read({ buffer, kind }) {
      if (kind === 'pdf') {
        let pages;
        try { pages = await pdfTextLines(buffer); } catch { throw new AttentionError('unreadable'); }
        if (pages.reduce((n, p) => n + p.lines.reduce((m, l) => m + l.text.length, 0), 0) < 20) {
          // a scanned PDF has pictures, not text. Rasterising pages for OCR is not built yet (known limitation).
          throw new AttentionError('scanned_pdf');
        }
        return { pages };
      }
      try { await sharp(buffer).metadata(); } catch { throw new AttentionError('unreadable'); }
      const out = await engine.recognizeImage(buffer);
      if (!out.pages.some((p) => p.lines.length)) throw new AttentionError('no_text_found');
      return out;
    },
    health: async () => (engine.health ? engine.health() : { ok: true, standIn: true }),
    close: () => engine.close?.(),
  };
}
