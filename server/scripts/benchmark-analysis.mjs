// Measures the time from "upload complete" (the last file received) to "analysis ready" (all five results stored) for a 5-file and a
// 15-file set, with the real Tesseract engine on the synthetic documents. Run: node --env-file=.env scripts/benchmark-analysis.mjs
// Uses a throw-away database (TEST_ADMIN_DATABASE_URL). Results go into docs/analysis-report.md.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestApp } from '../test/helpers.js';
import { fixture, index } from '../test/doc-helpers.js';
import { createTesseractEngine } from '../src/documents/ocr.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPEATS = Number(process.env.REPEATS ?? 3);
const engine = createTesseractEngine({ cachePath: path.join(here, '..', '.data', 'tessdata'), workers: 2 });
const t = await startTestApp({ ocrEngine: engine, docWorkers: 2 });
const ALL = { history: true, documents: true, his_sharing: true, abha_linking: true };
let n = 0;

async function oneRun(count) {
  const reg = await t.registerPatient({ fullName: 'Bench Patient', mobile: `95500${String(10000 + n++)}`, age: 50 });
  const consent = await t.call('POST', '/api/patient/consent', { cookie: reg.cookie, body: { purposes: ALL } });
  const files = Array.from({ length: count }, (_, i) => fixture(index[i % index.length].file));
  for (const [i, f] of files.entries()) await t.send('POST', '/api/patient/documents', f, { cookie: reg.cookie, name: `f${i}.png` });
  await t.settle();
  const { rows } = await t.db.pool.query(
    `SELECT ready_ms, compute_ms, document_count FROM analysis_runs WHERE encounter_id = $1 ORDER BY finished_at DESC LIMIT 1`, [consent.body.encounterId]);
  return rows[0];
}

console.log('warming up the OCR engine (first use loads the language models)...');
const warm = performance.now();
await oneRun(1);
console.log(`warm-up done in ${Math.round(performance.now() - warm)} ms\n`);

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
for (const count of [5, 15]) {
  const ready = [], compute = [];
  for (let r = 0; r < REPEATS; r++) { const x = await oneRun(count); ready.push(x.ready_ms); compute.push(x.compute_ms); }
  console.log(`${count} files x${REPEATS}: ready median ${median(ready)} ms, max ${Math.max(...ready)} ms (runs: ${ready.join(', ')}); analysis compute median ${median(compute)} ms`);
}
await engine.close?.();
await t.close();
process.exit(0);
