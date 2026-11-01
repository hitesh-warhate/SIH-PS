// Runs the real OCR engine (Tesseract) over the committed synthetic documents. Slower than the other tests, and the first run
// downloads the English, Hindi and Marathi language data, so it needs internet once. Skip with SKIP_OCR=1.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addScores, score } from '../src/documents/accuracy.js';
import { classify } from '../src/documents/classify.js';
import { extract } from '../src/documents/extract.js';
import { createDocumentReader, createTesseractEngine } from '../src/documents/ocr.js';
import { SYNTHETIC } from './fixtures/synthetic-docs.js';
import { index } from './doc-helpers.js';

const skip = process.env.SKIP_OCR === '1' ? 'SKIP_OCR=1' : false;
const here = path.dirname(fileURLToPath(import.meta.url));
let reader;
const results = [];

before(async () => {
  if (skip) return;
  reader = createDocumentReader({ engine: createTesseractEngine({ cachePath: path.join(here, '..', '.data', 'tessdata'), workers: 2 }) });
  await Promise.all(index.map(async (entry) => {
    const doc = SYNTHETIC.find((d) => d.id === entry.id);
    const read = await reader.read({ buffer: readFileSync(path.join(here, 'fixtures', 'docs', entry.file)), kind: 'image' });
    const r = extract(read.pages);
    const cls = classify(r.text);
    results.push({
      doc, r, cls,
      s: score({ ...doc.truth, docType: doc.docType }, {
        docType: cls.type, date: r.documentDate, diagnoses: r.entities.filter((e) => e.entity_type === 'diagnosis').map((e) => e.value),
        procedures: r.entities.filter((e) => e.entity_type === 'procedure').map((e) => e.value), meds: r.medications, labs: r.labs,
      }),
    });
  }));
});
after(async () => { await reader?.close(); });

const totals = (filter) => results.filter(filter).reduce((acc, x) => addScores(acc, x.s), null);
const ratio = ([c, t]) => (t ? c / t : 1);

test('the synthetic set covers three languages and four document types, printed, scan-like and handwriting-style', { skip }, () => {
  assert.ok(results.length >= 15);
  assert.deepEqual([...new Set(results.map((x) => x.doc.lang))].sort(), ['en', 'hi', 'mr']);
  assert.deepEqual([...new Set(results.map((x) => x.doc.docType))].sort(), ['discharge_summary', 'lab_report', 'other', 'prescription']);
  assert.deepEqual([...new Set(results.map((x) => x.doc.style))].sort(), ['printed', 'scan', 'script']);
});

test('every document is classified correctly, in every language', { skip }, () => {
  const wrong = results.filter((x) => x.cls.type !== x.doc.docType).map((x) => `${x.doc.id}: ${x.cls.type}`);
  assert.deepEqual(wrong, []);
});

test('printed documents in all three languages: every date, diagnosis, procedure, medication with dose, and lab value is extracted', { skip }, () => {
  for (const lang of ['en', 'hi', 'mr']) {
    const s = totals((x) => x.doc.lang === lang && x.doc.style === 'printed');
    for (const k of ['date', 'diagnoses', 'procedures', 'medications', 'labs']) assert.equal(ratio(s[k]), 1, `${lang} printed ${k}: ${s[k]}`);
    assert.equal(s.extra.medications + s.extra.labs + s.extra.diagnoses + s.extra.procedures, 0, `${lang}: nothing invented`);
  }
});

test('degraded scans and handwriting-style text are measured honestly: most fields still correct, and wrong ones are not shown as certain', { skip }, () => {
  const hard = results.filter((x) => x.doc.style !== 'printed');
  const s = totals((x) => x.doc.style !== 'printed');
  assert.ok(ratio(s.class) === 1);
  assert.ok(ratio(s.medications) >= 0.6, `scan and script medications ${s.medications}`);

  // Any lab result or medication that is not fully right must be held for review.
  for (const { doc, r } of hard) {
    for (const lab of r.labs) {
      const truth = doc.truth.labs.find((l) => l.test_name.toLowerCase() === lab.test_name.toLowerCase());
      const right = truth && Number(lab.value) === truth.value && lab.unit === truth.unit && lab.flag === truth.flag;
      if (!right) assert.equal(lab.needs_review, true, `${doc.id}: wrong lab "${lab.test_name}" was not flagged for review`);
    }
    for (const med of r.medications) {
      const truth = doc.truth.meds.find((m) => m.name.toLowerCase() === med.name.toLowerCase());
      const right = truth && med.dose === truth.dose && med.frequency?.startsWith(truth.frequency);
      if (!right) assert.equal(med.needs_review, true, `${doc.id}: wrong medication "${med.name}" was not flagged for review`);
    }
  }
});

test('every extracted field links to its place on the scan and carries a confidence', { skip }, () => {
  for (const { doc, r } of results) {
    for (const f of [...r.entities, ...r.medications, ...r.labs]) {
      assert.ok(f.confidence > 0 && f.confidence <= 1, doc.id);
      assert.ok(f.region.x1 > f.region.x0 && f.region.y1 > f.region.y0, `${doc.id}: region`);
    }
  }
});
