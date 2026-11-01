import { PDFDocument } from 'pdf-lib';

// File type is decided by the first bytes, never by the name or the Content-Type the client claims (FR-B2).
export function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: 'image', mime: 'image/jpeg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: 'image', mime: 'image/png' };
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { kind: 'image', mime: 'image/webp' };
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return { kind: 'pdf', mime: 'application/pdf' };
  return null;
}

// Page count of a PDF, or null when the file cannot be parsed (the worker then marks it unreadable).
export async function pdfPageCount(buf) {
  try {
    return (await PDFDocument.load(buf, { updateMetadata: false })).getPageCount();
  } catch {
    return null;
  }
}

// Lines of text from a PDF's own text layer, grouped by position, with their place on the page (points, origin top-left).
export async function pdfTextLines(buf) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false, verbosity: 0 });
  const doc = await task.promise;
  const pages = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const { width, height } = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const rows = new Map();
      for (const it of content.items) {
        if (!it.str?.trim()) continue;
        const y = Math.round(it.transform[5] / 3); // items on the same baseline share a row
        const row = rows.get(y) ?? [];
        row.push(it);
        rows.set(y, row);
      }
      const lines = [...rows.values()].sort((a, b) => b[0].transform[5] - a[0].transform[5]).map((items) => {
        items.sort((a, b) => a.transform[4] - b.transform[4]);
        const x0 = items[0].transform[4];
        const x1 = Math.max(...items.map((i) => i.transform[4] + i.width));
        const baseline = items[0].transform[5];
        const h = Math.max(...items.map((i) => i.height || 10));
        return {
          text: items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim(),
          confidence: 1, // embedded text is exact, not recognised
          bbox: { x0, y0: height - baseline - h, x1, y1: height - baseline + h * 0.25 },
        };
      });
      pages.push({ page: p, width, height, lines });
    }
  } finally {
    await task.destroy();
  }
  return pages;
}
