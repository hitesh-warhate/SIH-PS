import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './helpers.js';
import { fakeEngine, fixture, index, jpg, png } from './doc-helpers.js';
import { KINDS } from '../src/analysis/service.js';

// An OCR stand-in that returns known lines per image, so a document can claim to belong to someone else.
function scriptedEngine(byImage) {
  const base = fakeEngine();
  return {
    name: 'scripted',
    async recognizeImage(buf) {
      for (const [image, extra] of byImage) {
        if (buf.equals(image)) {
          const real = await base.recognizeImage(buf);
          const lines = [...extra, ...real.pages[0].lines.map((l) => l.text)];
          return { pages: [{ ...real.pages[0], lines: lines.map((text, i) => ({ text, confidence: 0.95, bbox: { x0: 50, y0: 40 + i * 70, x1: 900, y1: 90 + i * 70 } })) }] };
        }
      }
      return base.recognizeImage(buf);
    },
  };
}

const ALL = { history: true, documents: true, his_sharing: true, abha_linking: true };
const CONFIRM = { visual: true, audio: true };
const WRONG = jpg('en-rx-scan'); // this one is made to carry another person's name
let t, n = 0, doctor;
const q = (sql, params) => t.db.pool.query(sql, params).then((r) => r.rows);
before(async () => {
  t = await startTestApp({ ocrEngine: scriptedEngine([[WRONG, ['Patient Name: Sunita Devi Age: 34 Sex: Female']]]) });
  doctor = await t.login('doctor');
});
after(async () => { await t.close(); });

async function patient(name = 'Rakesh Kumar') {
  const reg = await t.registerPatient({ fullName: name, mobile: `96000${String(10000 + n++)}`, age: 58, sex: 'male' });
  const consent = await t.call('POST', '/api/patient/consent', { cookie: reg.cookie, body: { purposes: ALL } });
  const cookie = reg.cookie;
  return {
    cookie, enc: consent.body.encounterId,
    upload: (buf, file = 'scan.png') => t.send('POST', '/api/patient/documents', buf, { cookie, name: file }),
    remove: (id) => t.call('DELETE', `/api/patient/documents/${id}`, { cookie }),
    order: (ids) => t.call('PUT', '/api/patient/documents/order', { cookie, body: { ids } }),
    docs: async () => (await t.call('GET', '/api/patient/documents', { cookie })).body.documents,
    answer: (questionKey, value) => t.call('POST', '/api/patient/interview/answer', { cookie, body: { questionKey, value, modality: 'tap', confirmation: CONFIRM } }),
  };
}
const stored = async (enc) => Object.fromEntries((await q('SELECT kind, payload FROM analysis_results WHERE encounter_id = $1 ORDER BY kind', [enc])).map((r) => [r.kind, r.payload]));
const seen = (enc) => t.call('GET', `/api/doctor/encounters/${enc}/analysis`, { cookie: doctor });
const runs = (enc) => q('SELECT trigger, outcome, document_count, ready_ms, compute_ms FROM analysis_runs WHERE encounter_id = $1 ORDER BY finished_at', [enc]);

// Definition of Done 2: all five kinds are saved and reload identically.
test('all five result kinds are saved in analysis_results and reload identically', async () => {
  const p = await patient();
  await p.upload(png('en-rx-printed'), 'rx.png');
  await p.upload(png('en-lab-printed'), 'lab.png');
  await t.settle();
  const rows = await q('SELECT kind FROM analysis_results WHERE encounter_id = $1 ORDER BY kind', [p.enc]);
  assert.deepEqual(rows.map((r) => r.kind), [...KINDS].sort());
  const saved = await stored(p.enc);
  const api = await seen(p.enc);
  assert.equal(api.status, 200);
  assert.deepEqual(api.body.results, saved, 'what the doctor reads is what was stored');
  assert.deepEqual(saved.timeline.events.map((e) => e.name), ['lab.png', 'rx.png'], 'the lab report (20 Feb) came before the prescription (12 Mar)');
  assert.equal(saved.med_reconciliation.medications.length, 3, 'metformin, amlodipine, omeprazole');
  assert.equal(saved.lab_table.tests.length, 4);
  // a forced re-run of the same data gives the same stored payloads
  const before = JSON.stringify(saved);
  await t.analysis.run(p.enc, { force: true });
  assert.equal(JSON.stringify(await stored(p.enc)), before);
  assert.equal((await q('SELECT count(*)::int n FROM analysis_results WHERE encounter_id = $1', [p.enc]))[0].n, 5, 'a re-run replaces, it does not pile up');
});

test('an unchanged input is recognised and nothing is rewritten', async () => {
  const p = await patient();
  await p.upload(png('en-rx-printed'));
  await t.settle();
  const [first] = await q('SELECT computed_at FROM analysis_results WHERE encounter_id = $1 AND kind = $2', [p.enc, 'timeline']);
  const r = await t.analysis.run(p.enc, { trigger: 'again' });
  assert.equal(r.stored, false);
  const [second] = await q('SELECT computed_at FROM analysis_results WHERE encounter_id = $1 AND kind = $2', [p.enc, 'timeline']);
  assert.deepEqual(first.computed_at, second.computed_at);
  assert.equal((await runs(p.enc)).at(-1).outcome, 'unchanged');
});

// Definition of Done 3: adding, removing or reordering a file triggers a correct re-run.
test('adding, reordering and removing a file each re-run the analysis with the right result', async () => {
  const p = await patient();
  const a = (await p.upload(png('en-rx-printed'), 'first.png')).body.document.id; // dated 2026-03-12
  await t.settle();
  assert.deepEqual((await stored(p.enc)).timeline.events.map((e) => e.documentId), [a]);

  const b = (await p.upload(jpg('en-rx-scan'), 'second.jpg')).body.document.id; // dated 2025-11-02
  await t.settle();
  let s = await stored(p.enc);
  assert.deepEqual(s.timeline.events.map((e) => e.documentId), [b, a], 'ordered by date');
  assert.equal(s.med_reconciliation.medications.length, 6);
  assert.deepEqual(s.timeline.events.map((e) => e.sortOrder), [2, 1]);

  await p.order([b, a]);
  await t.settle();
  s = await stored(p.enc);
  assert.deepEqual(s.timeline.events.map((e) => e.sortOrder), [1, 2], 'the new order is reflected');

  await p.remove(a);
  await t.settle();
  s = await stored(p.enc);
  assert.deepEqual(s.timeline.events.map((e) => e.documentId), [b]);
  assert.equal(s.med_reconciliation.medications.length, 3, 'the removed file no longer contributes');

  const triggers = (await runs(p.enc)).map((r) => r.trigger);
  assert.ok(triggers.includes('documents_reordered'), 'a reorder is its own trigger');
  assert.ok(triggers.includes('document_removed'), 'so is a removal');
});

test('a medicine or allergy answer re-runs the analysis and joins the file data', async () => {
  const p = await patient();
  await p.upload(png('en-rx-printed'));
  await t.settle();
  assert.equal((await p.answer('drug.current_any', 'yes')).status, 200);
  assert.equal((await p.answer('drug.current_list', 'Metformin, Warfarin 3 mg')).status, 200);
  assert.equal((await p.answer('allergy.any', 'no')).status, 200);
  await t.settle();
  const s = await stored(p.enc);
  const names = s.med_reconciliation.medications.map((m) => [m.name, m.status]);
  assert.deepEqual(names, [['amlodipine', 'documents_only'], ['metformin', 'documents_and_patient'], ['omeprazole', 'documents_only'], ['warfarin', 'patient_only']]);
  assert.equal(s.med_reconciliation.patientReport.takingAny, true);
  assert.equal((await runs(p.enc)).some((r) => r.trigger === 'answers_changed'), true);

  // changing the first answer to "no" removes the list (a pruned follow-up) and the patient entries with it
  await p.answer('drug.current_any', 'no');
  await t.settle();
  const after = await stored(p.enc);
  assert.ok(after.med_reconciliation.medications.every((m) => m.status === 'documents_only'));
  assert.equal(after.consistency.issues.some((i) => i.code === 'patient_reports_no_medicines'), true);
});

test('a document carrying another person\'s name is flagged end to end', async () => {
  const p = await patient();
  await p.upload(png('en-rx-printed'), 'mine.png');
  await p.upload(WRONG, 'not-mine.png');
  await t.settle();
  const s = await stored(p.enc);
  const flagged = s.consistency.issues.filter((i) => i.code === 'possible_wrong_patient');
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].params.likelihood, 'high');
  const docs = await q('SELECT id, original_name FROM documents WHERE encounter_id = $1', [p.enc]);
  assert.equal(docs.find((d) => d.id === flagged[0].documentId).original_name, 'not-mine.png');
  const ent = await q(`SELECT entity_type, value FROM extracted_entities WHERE document_id = $1 AND entity_type LIKE 'patient_%' ORDER BY entity_type`, [flagged[0].documentId]);
  assert.deepEqual(ent, [{ entity_type: 'patient_age', value: '34' }, { entity_type: 'patient_name', value: 'Sunita Devi' }, { entity_type: 'patient_sex', value: 'Female' }]);
});

// Definition of Done 7: time from upload complete to analysis ready.
for (const count of [5, 15]) {
  test(`time from upload complete to analysis ready is measured for a ${count}-file set`, async () => {
    const p = await patient();
    const files = index.slice(0, count).map((e) => fixture(e.file));
    for (const [i, f] of files.entries()) assert.equal((await p.upload(f, `f${i}.png`)).status, 202);
    await t.settle();
    const last = (await runs(p.enc)).at(-1);
    assert.equal(last.document_count, count);
    assert.ok(last.ready_ms != null && last.ready_ms >= 0, 'ready_ms is recorded once every file is read');
    assert.ok(last.ready_ms < 15000, `${count} files: ${last.ready_ms} ms (fake OCR)`);
    console.log(`  analysis ready ${last.ready_ms} ms after the last upload for ${count} files (compute ${last.compute_ms} ms; fake OCR engine)`);
  });
}

// Definition of Done 8: nothing from the analysis reaches the Patient portal.
test('nothing from the analysis appears in the Patient portal', async () => {
  const p = await patient();
  await p.upload(png('en-lab-printed'));
  await p.answer('drug.current_any', 'no');
  await t.settle();
  const secret = /analysis|reconciliation|lab_table|interactions|allergyConflicts|possible_wrong_patient|doseChanges|consistency|outOfRange|direction/i;
  const paths = ['/api/patient/documents', '/api/patient/interview/next', '/api/patient/interview/state', '/api/patient/interview/review', '/api/patient/interview/history', `/api/patient/responses/drug.current_any`];
  for (const path of paths) {
    const r = await t.call('GET', path, { cookie: p.cookie });
    assert.ok(r.status < 500, path);
    assert.equal(secret.test(JSON.stringify(r.body)), false, path);
  }
  assert.equal((await t.call('GET', `/api/doctor/encounters/${p.enc}/analysis`, { cookie: p.cookie })).status, 403, 'a patient session cannot read it');
  assert.equal((await t.call('GET', '/api/doctor/encounters', { cookie: p.cookie })).status, 403);
  assert.equal((await t.call('POST', `/api/doctor/encounters/${p.enc}/analysis/rerun`, { cookie: p.cookie })).status, 403);
  assert.equal((await t.call('GET', `/api/doctor/encounters/${p.enc}/analysis`, { cookie: await t.login('staff') })).status, 403, 'staff cannot either');
  assert.equal((await t.call('GET', `/api/doctor/encounters/${p.enc}/analysis`)).status, 401);
});

test('the doctor sees the encounter list and the analysis, and the access is audited', async () => {
  const p = await patient('Meena Joshi');
  await p.upload(png('en-rx-printed'));
  await t.settle();
  const list = await t.call('GET', '/api/doctor/encounters', { cookie: doctor });
  const mine = list.body.items.find((e) => e.id === p.enc);
  assert.equal(mine.name, 'Meena Joshi');
  assert.equal(mine.documents, 1);
  assert.ok(Math.abs(mine.age - 58) <= 1, 'registered at 58; the date of birth is an estimate');
  const r = await seen(p.enc);
  assert.equal(r.body.encounter.name, 'Meena Joshi');
  assert.deepEqual(r.body.documents, { total: 1, done: 1, needsAttention: 0, pending: 0 });
  assert.ok(r.body.computedAt);
  assert.equal((await q(`SELECT count(*)::int n FROM audit_logs WHERE action = 'analysis_viewed' AND object_id = $1`, [p.enc]))[0].n, 1);
  assert.equal((await t.call('GET', '/api/doctor/encounters/not-an-id/analysis', { cookie: doctor })).status, 400);
  assert.equal((await t.call('GET', '/api/doctor/encounters/00000000-0000-4000-8000-000000000000/analysis', { cookie: doctor })).status, 404);
  const rerun = await t.call('POST', `/api/doctor/encounters/${p.enc}/analysis/rerun`, { cookie: doctor });
  assert.equal(rerun.status, 200);
  assert.deepEqual(rerun.body.results, r.body.results);
});

test('an encounter with no files still gets all five results', async () => {
  const p = await patient();
  const r = await seen(p.enc);
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body.results).sort(), [...KINDS].sort());
  assert.deepEqual(r.body.results.timeline.events, []);
});

// FR-B15: each digitized document is linked to the structured history and to the patient's identifiers.
test('each document is linked to the history sections and to the patient with a FHIR-ready reference', async () => {
  const p = await patient();
  const { rows: [pat] } = await t.db.pool.query('SELECT patient_id FROM encounters WHERE id = $1', [p.enc]);
  await t.db.pool.query(`INSERT INTO patient_identifiers (patient_id, type, value_encrypted) VALUES ($1, 'abha', 'v1:encrypted-placeholder')`, [pat.patient_id]);
  const rx = (await p.upload(png('en-rx-printed'), 'rx.png')).body.document.id;
  const lab = (await p.upload(png('en-lab-printed'), 'lab.png')).body.document.id;
  await t.settle();
  const links = await q('SELECT * FROM document_links WHERE encounter_id = $1', [p.enc]);
  assert.equal(links.length, 2);
  const byDoc = Object.fromEntries(links.map((l) => [l.document_id, l]));
  assert.deepEqual(byDoc[rx].history_sections, ['drug_allergy', 'past_history']);
  assert.deepEqual(byDoc[lab].history_sections, ['past_history']);
  assert.deepEqual(byDoc[rx].identifier_types, ['abha']);
  const ref = byDoc[rx].fhir;
  assert.equal(ref.resourceType, 'DocumentReference');
  assert.equal(ref.subject.reference, `Patient/${pat.patient_id}`);
  assert.equal(ref.context.encounter[0].reference, `Encounter/${p.enc}`);
  assert.equal(ref.type.coding[0].code, '57833-6');
  assert.equal(ref.docStatus, 'preliminary', 'machine-read and not yet reviewed');
  assert.equal(JSON.stringify(ref).includes('encrypted-placeholder'), false, 'no identifier value is copied into the reference');
  const api = await seen(p.enc);
  assert.equal(api.body.links.length, 2);
  // removing a document removes its link
  await p.remove(lab);
  await t.settle();
  assert.equal((await q('SELECT count(*)::int n FROM document_links WHERE encounter_id = $1', [p.enc]))[0].n, 1);
});

test('a file that cannot be read is shown as needing attention and does not break the analysis', async () => {
  const p = await patient();
  await p.upload(png('en-rx-printed'), 'good.png');
  await p.upload(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(2000, 7)]), 'bad.png');
  await t.settle();
  const s = await stored(p.enc);
  assert.equal(s.timeline.events.length, 2);
  assert.equal(s.consistency.issues.filter((i) => i.code === 'document_needs_attention').length, 1);
  assert.equal(s.med_reconciliation.medications.length, 3);
  assert.equal((await p.docs()).length, 2);
});
