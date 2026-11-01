import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { startTestApp } from './helpers.js';
import { blankPdf, blurred, corruptPng, cutOff, fakeEngine, fixture, jpg, png, textPdf, tiny, tooDark } from './doc-helpers.js';

const ALL = { history: true, documents: true, his_sharing: true, abha_linking: true };
let t, n = 0;
const q = (sql, params) => t.db.pool.query(sql, params).then((r) => r.rows);
before(async () => { t = await startTestApp(); });
after(async () => { await t.close(); });

async function patient(app = t, purposes = ALL) {
  const reg = await app.registerPatient({ fullName: `Doc Tester ${++n}`, mobile: `95000${String(10000 + n)}`, age: 44 });
  const consent = await app.call('POST', '/api/patient/consent', { cookie: reg.cookie, body: { purposes } });
  const cookie = reg.cookie;
  return {
    cookie, enc: consent.body.encounterId,
    upload: (buf, name = 'scan.png') => app.send('POST', '/api/patient/documents', buf, { cookie, name }),
    replace: (id, buf, name = 'retake.png') => app.send('PUT', `/api/patient/documents/${id}`, buf, { cookie, name }),
    list: async () => (await app.call('GET', '/api/patient/documents', { cookie })).body.documents,
    remove: (id) => app.call('DELETE', `/api/patient/documents/${id}`, { cookie }),
    order: (ids) => app.call('PUT', '/api/patient/documents/order', { cookie, body: { ids } }),
    settle: async () => { await app.docs.pipeline.idle(); },
  };
}

test('a patient adds five or more mixed files in one session and sees per-file status; each file is read, classified and extracted', async () => {
  const p = await patient();
  const pdf = await textPdf(['Prescription', 'Date: 12/03/2026', 'Tab Metformin 500 mg twice daily']);
  const sent = [
    await p.upload(png('en-rx-printed'), 'rx.png'), await p.upload(png('hi-lab-printed'), 'lab-hindi.png'), await p.upload(jpg('mr-rx-scan'), 'camera.jpg'),
    await p.upload(png('en-dis-printed'), 'discharge.png'), await p.upload(pdf, 'letter.pdf'), await p.upload(png('mr-other-printed'), 'other.png'),
  ];
  assert.deepEqual(sent.map((s) => s.status), [202, 202, 202, 202, 202, 202]);
  assert.ok(sent.every((s) => ['waiting', 'reading'].includes(s.body.document.status)), 'status is shown straight away');
  await p.settle();
  const docs = await p.list();
  assert.equal(docs.length, 6);
  assert.deepEqual(docs.map((d) => d.status), ['done', 'done', 'done', 'done', 'done', 'done']);
  assert.ok(docs.every((d) => d.progress === 100));
  const rows = await q('SELECT original_name, doc_type, document_date, ocr_confidence, page_count FROM documents WHERE encounter_id = $1 ORDER BY sort_order', [p.enc]);
  assert.deepEqual(rows.map((r) => r.doc_type), ['prescription', 'lab_report', 'prescription', 'discharge_summary', 'prescription', 'other']);
  assert.equal(rows[0].document_date, '2026-03-12');
  assert.ok(rows.every((r) => r.ocr_confidence > 0));
  const meds = await q('SELECT m.name, m.dose, m.frequency FROM medications m JOIN documents d ON d.id = m.document_id WHERE d.encounter_id = $1 AND d.original_name = $2', [p.enc, 'letter.pdf']);
  assert.deepEqual(meds, [{ name: 'Metformin', dose: '500 mg', frequency: 'twice daily' }]); // read from the PDF text layer
  assert.ok((await q('SELECT count(*)::int n FROM lab_results l JOIN documents d ON d.id = l.document_id WHERE d.encounter_id = $1', [p.enc]))[0].n >= 3);
  assert.ok((await q(`SELECT count(*)::int n FROM extracted_entities e JOIN documents d ON d.id = e.document_id WHERE d.encounter_id = $1 AND e.entity_type = 'diagnosis'`, [p.enc]))[0].n >= 3);
});

test('every extracted field has a confidence, a place on the original scan, and a review flag', async () => {
  const lowEngine = fakeEngine({ confidence: 0.5 });
  const low = await startTestApp({ ocrEngine: lowEngine });
  try {
    const p = await patient(low);
    await p.upload(png('en-lab-printed'));
    await p.upload(png('en-rx-printed'));
    await p.settle();
    const fields = [
      ...await low.db.pool.query('SELECT confidence, page, region, needs_review FROM lab_results').then((r) => r.rows),
      ...await low.db.pool.query('SELECT confidence, page, region, needs_review FROM medications').then((r) => r.rows),
      ...await low.db.pool.query('SELECT confidence, page, region, needs_review FROM extracted_entities').then((r) => r.rows),
    ];
    assert.ok(fields.length >= 8);
    for (const f of fields) {
      assert.ok(Number(f.confidence) > 0 && Number(f.confidence) <= 1);
      assert.equal(f.page, 1);
      for (const k of ['x0', 'y0', 'x1', 'y1']) assert.equal(typeof f.region[k], 'number');
      assert.equal(f.needs_review, true, 'a poor read is flagged for review, never shown as certain');
    }
  } finally { await low.close(); }
});

test('the Patient portal shows status only: no extracted values, document types, confidence or flags', async () => {
  const p = await patient();
  await p.upload(png('en-lab-printed'));
  await p.upload(png('en-rx-printed'));
  await p.settle();
  const body = JSON.stringify((await t.call('GET', '/api/patient/documents', { cookie: p.cookie })).body);
  for (const secret of ['Metformin', 'Hemoglobin', '10.2', 'prescription', 'lab_report', 'diabetes', 'confidence', 'flag', 'doc_type', 'ocr', 'region']) {
    assert.doesNotMatch(body, new RegExp(secret, 'i'), `leaked ${secret}`);
  }
  const keys = Object.keys(JSON.parse(body).documents[0]).sort();
  assert.deepEqual(keys, ['attentionReason', 'id', 'kind', 'name', 'order', 'progress', 'status']);
});

test('invalid files are rejected on arrival: wrong type, empty, too large, too many pages, too many files', async () => {
  const small = await startTestApp({ limits: { maxFiles: 3, maxBytes: 200 * 1024, maxPages: 2 } });
  try {
    const p = await patient(small);
    assert.deepEqual([(await p.upload(Buffer.from('MZ not a document at all, just some text'))).status, (await p.upload(Buffer.alloc(0))).status], [415, 400]);
    assert.equal((await p.upload(Buffer.from('<html><script>alert(1)</script></html>'))).status, 415);
    const big = Buffer.concat([png('en-rx-printed'), Buffer.alloc(300 * 1024)]);
    assert.equal((await p.upload(big)).status, 413);
    const three = await p.upload(await blankPdf(3));
    assert.deepEqual([three.status, three.body.error, three.body.maxPages], [422, 'too_many_pages', 2]);
    assert.equal((await p.upload(await blankPdf(2))).status, 202);
    for (let i = 0; i < 2; i++) assert.equal((await p.upload(png('en-rx-printed'))).status, 202);
    const fourth = await p.upload(png('en-rx-printed'));
    assert.deepEqual([fourth.status, fourth.body.error, fourth.body.maxFiles], [409, 'too_many_files', 3]);
    assert.equal((await p.list()).length, 3, 'rejected files leave no record');
  } finally { await small.close(); }
});

test('poor photos are flagged with a retake prompt: blurry, too dark, too small, cut off, and a PDF with no text', async () => {
  const p = await patient();
  const cases = [['blurry', await blurred()], ['too_dark', await tooDark()], ['low_resolution', await tiny()], ['cut_off_edges', await cutOff()]];
  for (const [, buf] of cases) assert.equal((await p.upload(buf)).status, 202);
  assert.equal((await p.upload(await blankPdf(1))).status, 202);
  await p.settle();
  const docs = await p.list();
  assert.deepEqual(docs.map((d) => [d.status, d.attentionReason]), [...cases.map(([r]) => ['needs_attention', r]), ['needs_attention', 'scanned_pdf']]);
});

test('a deliberately corrupted file ends in needs attention while the other files still complete', async () => {
  const p = await patient();
  await p.upload(png('en-rx-printed'));
  const bad = await p.upload(corruptPng(), 'broken.png');
  await p.upload(png('hi-lab-printed'));
  await p.upload(png('mr-dis-printed'));
  await p.settle();
  const docs = await p.list();
  assert.deepEqual(docs.map((d) => d.status), ['done', 'needs_attention', 'done', 'done']);
  assert.equal(docs[1].id, bad.body.document.id);
  assert.equal(docs[1].attentionReason, 'unreadable');
  assert.ok((await q('SELECT count(*)::int n FROM medications m JOIN documents d ON d.id = m.document_id WHERE d.encounter_id = $1', [p.enc]))[0].n >= 2, 'partial results are kept');
});

test('a failing engine is retried with back-off; a file that keeps failing ends in needs attention and the rest complete', async () => {
  const engine = fakeEngine({
    fail: async (buf, call) => {
      const id = buf.length;
      if (id === fixture('hi-lab-printed.png').length && call <= 2) throw new Error('engine hiccup');   // fails twice, then works
      if (id === fixture('mr-dis-printed.png').length) throw new Error('engine down for this file');     // never works
    },
  });
  const flaky = await startTestApp({ ocrEngine: engine });
  try {
    const p = await patient(flaky);
    await p.upload(png('en-rx-printed'));
    await p.upload(png('hi-lab-printed'));
    await p.upload(png('mr-dis-printed'));
    await p.upload(png('en-lab-printed'));
    await p.settle();
    const docs = await p.list();
    assert.deepEqual(docs.map((d) => [d.status, d.attentionReason]), [['done', null], ['done', null], ['needs_attention', 'processing_failed'], ['done', null]]);
    const attempts = (await flaky.db.pool.query('SELECT attempts FROM documents ORDER BY sort_order')).rows.map((r) => r.attempts);
    assert.deepEqual(attempts, [1, 3, 3, 1], 'retried up to three times');
  } finally { await flaky.close(); }
});

test('remove, retake and reorder work before submission', async () => {
  const p = await patient();
  const ids = [];
  for (const f of ['en-rx-printed', 'en-lab-printed', 'en-dis-printed']) ids.push((await p.upload(png(f), `${f}.png`)).body.document.id);
  await p.settle();

  // reorder
  const reordered = await p.order([ids[2], ids[0], ids[1]]);
  assert.deepEqual(reordered.body.documents.map((d) => d.id), [ids[2], ids[0], ids[1]]);
  assert.equal((await p.order([ids[0], ids[1]])).status, 400, 'must name every file');
  assert.equal((await p.order([ids[0], ids[1], '00000000-0000-0000-0000-000000000000'])).status, 400);

  // retake: a bad photo is replaced by a good one, keeps its place, and is read again
  const bad = (await p.upload(await blurred(), 'bad.png')).body.document.id;
  await p.settle();
  assert.equal((await p.list()).find((d) => d.id === bad).attentionReason, 'blurry');
  const before = await q('SELECT storage_ref FROM documents WHERE id = $1', [bad]);
  const retake = await p.replace(bad, png('hi-rx-printed'), 'good.png');
  assert.equal(retake.status, 202);
  assert.equal(retake.body.document.status, 'waiting');
  await p.settle();
  const after = (await p.list()).find((d) => d.id === bad);
  assert.deepEqual([after.status, after.attentionReason, after.name, after.order], ['done', null, 'good.png', 4]);
  assert.ok(!(await readdir(path.join(t.dir, 'files'))).includes(before[0].storage_ref), 'the old file is gone from the store');
  assert.equal((await q('SELECT doc_type FROM documents WHERE id = $1', [bad]))[0].doc_type, 'prescription');

  // remove: the record, its extracted data and its file are deleted
  const refs = await q('SELECT storage_ref FROM documents WHERE id = $1', [ids[1]]);
  assert.equal((await p.remove(ids[1])).status, 200);
  assert.equal((await p.list()).length, 3);
  assert.equal((await q('SELECT count(*)::int n FROM lab_results WHERE document_id = $1', [ids[1]]))[0].n, 0);
  assert.ok(!(await readdir(path.join(t.dir, 'files'))).includes(refs[0].storage_ref));
  assert.equal((await p.remove(ids[1])).status, 404);
});

test('one patient cannot read, change or remove another patient\'s files', async () => {
  const a = await patient();
  const b = await patient();
  const id = (await a.upload(png('en-rx-printed'))).body.document.id;
  assert.equal((await b.remove(id)).status, 404);
  assert.equal((await b.replace(id, png('en-lab-printed'))).status, 404);
  assert.equal((await b.list()).length, 0);
});

test('originals sit in the encrypted file store and database rows hold only a reference', async () => {
  const p = await patient();
  const original = png('en-rx-printed');
  await p.upload(original);
  await p.settle();
  const [row] = await q('SELECT storage_ref FROM documents WHERE encounter_id = $1', [p.enc]);
  assert.match(row.storage_ref, /^[0-9a-f-]{36}\.enc$/);
  const onDisk = await readFile(path.join(t.dir, 'files', row.storage_ref));
  assert.ok(!onDisk.includes(Buffer.from('PNG')) && !onDisk.subarray(0, 8).equals(original.subarray(0, 8)), 'the file on disk is not a readable PNG');
  assert.ok(onDisk.length > original.length, 'ciphertext plus nonce and tag');
  assert.ok((await t.docs.store.get(row.storage_ref)).equals(original), 'decrypts back to the exact original');
  const bytea = await q(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND data_type = 'bytea'`);
  assert.deepEqual(bytea, [], 'no table stores binary data');
  await assert.rejects(t.docs.store.get('../../etc/passwd'), /invalid storage ref/);
});

test('documents need the "documents" consent: with it refused nothing is stored', async () => {
  const p = await patient(t, { ...ALL, documents: false });
  const r = await p.upload(png('en-rx-printed'));
  assert.deepEqual([r.status, r.body.error, r.body.purpose], [403, 'consent_required', 'documents']);
  assert.equal((await q('SELECT count(*)::int n FROM documents WHERE encounter_id = $1', [p.enc]))[0].n, 0);
  assert.equal((await t.send('POST', '/api/patient/documents', png('en-rx-printed'))).status, 401);
});

test('files that were waiting when the server stopped are picked up again', async () => {
  const p = await patient();
  const ref = await t.docs.store.put(png('hi-rx-printed'));
  await q(`INSERT INTO documents (encounter_id, storage_ref, original_name, mime, size_bytes, status, sort_order) VALUES ($1, $2, 'left-over.png', 'image/png', 1, 'reading', 1)`, [p.enc, ref]);
  assert.equal(await t.docs.pipeline.recover(), 1);
  await p.settle();
  assert.deepEqual((await p.list()).map((d) => d.status), ['done']);
});

test('temporary working files are purged after their time-to-live', async () => {
  await t.docs.store.tempFile('page-1.png', Buffer.from('working copy'));
  assert.equal(await t.docs.store.purgeTemp(60_000), 0, 'recent files are kept');
  assert.equal(await t.docs.store.purgeTemp(-1), 1, 'expired files are removed');
});
