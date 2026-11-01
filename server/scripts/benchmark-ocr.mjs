// First OCR and extraction accuracy benchmark. Runs the real reader, classifier and extractor over the synthetic documents and
// prints field accuracy per document type, per language and per style as markdown (paste into docs/ocr-accuracy-report.md).
//   node server/scripts/benchmark-ocr.mjs            (needs internet the first time, to fetch the Tesseract language data)
// To score your own scans, add them to server/test/fixtures/docs with an entry in index.json and synthetic-docs.js.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addScores, pct, score } from '../src/documents/accuracy.js';
import { classify } from '../src/documents/classify.js';
import { extract } from '../src/documents/extract.js';
import { createDocumentReader, createTesseractEngine } from '../src/documents/ocr.js';
import { SYNTHETIC } from '../test/fixtures/synthetic-docs.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'docs');
const index = JSON.parse(readFileSync(path.join(dir, 'index.json'), 'utf8'));
const engine = createTesseractEngine({ cachePath: path.join(dir, '..', '..', '..', '.data', 'tessdata'), workers: 2 });
const reader = createDocumentReader({ engine });

const groups = { 'document type': {}, language: {}, style: {}, overall: {} };
const confs = [];
const rows = [];
const started = Date.now();
await Promise.all(index.map(async (entry) => {
  const doc = SYNTHETIC.find((d) => d.id === entry.id);
  const read = await reader.read({ buffer: readFileSync(path.join(dir, entry.file)), kind: 'image' });
  const r = extract(read.pages);
  const cls = classify(r.text);
  const s = score({ ...doc.truth, docType: doc.docType }, {
    docType: cls.type, date: r.documentDate, diagnoses: r.entities.filter((e) => e.entity_type === 'diagnosis').map((e) => e.value),
    procedures: r.entities.filter((e) => e.entity_type === 'procedure').map((e) => e.value), meds: r.medications, labs: r.labs,
  });
  confs.push(r.confidence);
  rows.push({ id: entry.id, s });
  if (process.env.VERBOSE && ['class', 'date', 'diagnoses', 'procedures', 'medications', 'labs'].some((k) => s[k][0] < s[k][1])) {
    console.log(`--- ${entry.id} classified as ${cls.type}\n${read.pages[0].lines.map((l) => `  [${(l.confidence * 100).toFixed(0)}] ${l.text}`).join('\n')}\n  meds: ${JSON.stringify(r.medications.map((m) => [m.name, m.dose, m.frequency]))}\n  labs: ${JSON.stringify(r.labs.map((l) => [l.test_name, l.value, l.unit, l.flag]))}\n  dx: ${JSON.stringify(r.entities.map((e) => e.value))}`);
  }
  for (const [g, key] of [['document type', doc.docType], ['language', doc.lang], ['style', doc.style], ['overall', 'all']]) groups[g][key] = addScores(groups[g][key], s);
}));
await reader.close();

console.log(`Run ${new Date().toISOString().slice(0, 10)}, engine tesseract.js (eng+hin+mar), ${index.length} documents, ${((Date.now() - started) / 1000).toFixed(0)} s, mean line confidence ${(confs.reduce((a, b) => a + b, 0) / confs.length * 100).toFixed(0)}%\n`);
for (const [g, byKey] of Object.entries(groups)) {
  console.log(`### By ${g}\n\n| ${g} | classified | date | diagnoses | procedures | medications | lab values | extra meds / labs / diagnoses |\n|---|---|---|---|---|---|---|---|`);
  for (const [k, s] of Object.entries(byKey).sort()) console.log(`| ${k} | ${pct(s.class)} | ${pct(s.date)} | ${pct(s.diagnoses)} | ${pct(s.procedures)} | ${pct(s.medications)} | ${pct(s.labs)} | ${s.extra.medications} / ${s.extra.labs} / ${s.extra.diagnoses} |`);
  console.log('');
}
const misses = rows.filter(({ s }) => ['class', 'date', 'diagnoses', 'procedures', 'medications', 'labs'].some((k) => s[k][0] < s[k][1])).map(({ id, s }) => `${id}: ${['class', 'date', 'diagnoses', 'procedures', 'medications', 'labs'].filter((k) => s[k][0] < s[k][1]).join(', ')}`);
console.log('Documents with at least one miss:\n' + (misses.length ? misses.map((m) => `- ${m}`).join('\n') : '- none'));
