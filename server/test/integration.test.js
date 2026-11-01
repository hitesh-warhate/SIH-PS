import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startTestApp } from './helpers.js';
import { png } from './doc-helpers.js';
import { createHisConnector } from '../src/integration/connectors.js';
import { buildBundle } from '../src/integration/fhir.js';
import { validateBundle } from '../src/integration/validate.js';

const CONFIRM = { visual: true, audio: true };
const ALL = { history: true, documents: true, his_sharing: true, abha_linking: true };
const ABHA = '12345678901234';
let t, his, doctor, staff, n = 0;
const received = [];
let failNext = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (sql, params) => t.db.pool.query(sql, params).then((r) => r.rows);

// A stand-in hospital system on a real local HTTP port, so the connector's real network path is used.
before(async () => {
  his = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (failNext > 0) { failNext--; res.writeHead(500).end('down'); return; }
      received.push({ headers: req.headers, bundle: JSON.parse(body) });
      res.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify({ id: `HIS-${received.length}` }));
    });
  }).listen(0);
  const url = `http://127.0.0.1:${his.address().port}/fhir`;
  t = await startTestApp({ his: createHisConnector({ mode: 'http', url, token: 'secret-token' }) });
  doctor = await t.login('doctor');
  staff = await t.login('staff');
});
after(async () => { await t.close(); his.close(); });

async function confirmedCase({ purposes = ALL, abha = true, name = 'Integration Tester', decide = 'accept' } = {}) {
  const mobile = `92000${String(10000 + n++)}`;
  const reg = await t.registerPatient({ fullName: name, mobile, age: 50, sex: 'female' });
  const consent = await t.call('POST', '/api/patient/consent', { cookie: reg.cookie, body: { purposes } });
  const enc = consent.body.encounterId;
  if (abha) {
    const { rows: [e] } = await t.db.pool.query('SELECT patient_id FROM encounters WHERE id = $1', [enc]);
    await t.db.pool.query(`INSERT INTO patient_identifiers (patient_id, type, value_encrypted) VALUES ($1, 'abha', $2)`, [e.patient_id, t.crypto.encrypt(ABHA)]);
  }
  const answer = (k, v) => t.call('POST', '/api/patient/interview/answer', { cookie: reg.cookie, body: { questionKey: k, value: v, modality: 'tap', confirmation: CONFIRM } });
  await answer('emergency.screen', ['none']); await answer('cc.main', 'fever'); await answer('cc.duration', 'd1_3');
  await answer('drug.current_any', 'yes'); await answer('drug.current_list', 'Metformin 500 mg'); await answer('allergy.any', 'yes'); await answer('allergy.list', 'Penicillin');
  await t.send('POST', '/api/patient/documents', png('en-lab-printed'), { cookie: reg.cookie, name: 'lab.png' });
  await t.settle();
  await t.call('POST', '/api/patient/submit', { cookie: reg.cookie });
  await t.call('POST', `/api/doctor/encounters/${enc}/consult`, { cookie: doctor });
  const r = await t.call('POST', `/api/doctor/encounters/${enc}/summary/${decide}`, { cookie: doctor, body: decide === 'amend' ? { edits: [{ id: 'cc.duration', text: 'Two days' }] } : undefined });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { enc, cookie: reg.cookie, mobile };
}
const deliveries = (enc) => q('SELECT target, purpose, status, reason, attempts, ack, last_error FROM deliveries WHERE encounter_id = $1 ORDER BY target', [enc]);

// ---- the FHIR mapping and its checks ----
test('the FHIR bundle for a confirmed summary is a document Bundle that passes the structural checks', async () => {
  const c = await confirmedCase();
  const [row] = await q('SELECT bundle, validation FROM fhir_bundles WHERE encounter_id = $1', [c.enc]);
  assert.equal(row.validation.valid, true, JSON.stringify(row.validation.errors));
  assert.equal(row.validation.abdmProfiles.checked, false, 'says plainly that the ABDM profiles were not checked');
  const b = row.bundle;
  assert.equal(b.type, 'document');
  assert.equal(b.entry[0].resource.resourceType, 'Composition');
  const types = b.entry.map((e) => e.resource.resourceType);
  for (const x of ['Composition', 'Patient', 'Practitioner', 'Encounter', 'MedicationStatement', 'Observation', 'AllergyIntolerance', 'DocumentReference']) assert.ok(types.includes(x), x);
  const patient = b.entry.find((e) => e.resource.resourceType === 'Patient').resource;
  assert.equal(patient.identifier[0].value, ABHA, 'the ABHA identifier is included because the patient consented to ABHA linking');
  assert.equal(patient.gender, 'female');
  const obs = b.entry.filter((e) => e.resource.resourceType === 'Observation').map((e) => e.resource);
  assert.ok(obs.every((o) => typeof o.valueQuantity.value === 'number' && !('interpretation' in o)), 'values only, no interpretation');
  assert.ok(b.entry.find((e) => e.resource.resourceType === 'Practitioner').resource.name[0].text.includes('Doctor'));
  const text = JSON.stringify(b);
  assert.equal(/diagnos|likely|suggest/i.test(JSON.stringify(b.entry[0].resource.section.map((s) => s.text.div).join(' ').replace(/Diagnoses written/g, ''))), false);
  assert.ok(text.includes('Metformin') || text.includes('metformin'));
  assert.equal('meta' in b.entry[0].resource, false, 'no ABDM profile is claimed');
});

test('the structural checker catches a broken reference, a missing Composition, bad dates and missing fields', () => {
  const ok = JSON.parse(JSON.stringify(buildBundle({
    patient: { id: 'p1', name: 'A B', sex: 'male', dob: '1980-01-01' }, encounter: { id: 'e1', startedAt: '2026-05-01T10:00:00.000Z' }, practitioner: { id: 'd1', name: 'Dr X' },
    summary: { lang: 'en', content: { sections: [{ id: 's', title: ['T', 'T', 'T'], items: [{ id: 'i', status: 'answered', label: ['Q', 'Q', 'Q'], text: { en: 'A', hi: 'A', mr: 'A' } }] }] }, version: 1, decidedAt: '2026-05-01T11:00:00.000Z' },
    medications: [{ name: 'metformin', dose: '500 mg', frequency: 'twice daily' }], labs: [{ test: 'Hemoglobin', value: 10.2, unit: 'g/dL', date: '2026-02-20', refLow: 12, refHigh: 15.5 }], allergies: [{ term: 'penicillin' }], documents: [],
  })));
  assert.equal(validateBundle(ok).valid, true, JSON.stringify(validateBundle(ok).errors));

  const broken = (mutate) => { const b = JSON.parse(JSON.stringify(ok)); mutate(b); return validateBundle(b); };
  assert.equal(broken((b) => { b.entry.find((e) => e.resource.resourceType === 'Observation').resource.subject.reference = 'urn:uuid:nobody'; }).valid, false);
  assert.equal(broken((b) => { b.entry.reverse(); }).valid, false, 'Composition must come first');
  assert.equal(broken((b) => { b.timestamp = 'yesterday'; }).valid, false);
  assert.equal(broken((b) => { delete b.entry[0].resource.author; }).valid, false);
  assert.equal(broken((b) => { b.entry.find((e) => e.resource.resourceType === 'Observation').resource.valueQuantity.value = '10.2'; }).valid, false);
  assert.equal(broken((b) => { b.entry.push({ ...b.entry[1] }); }).valid, false, 'duplicate resource');
  assert.equal(broken((b) => { b.type = 'collection'; }).valid, false);
  assert.equal(validateBundle({ resourceType: 'Patient' }).valid, false);
});

// ---- delivery ----
test('a confirmed summary reaches the HIS over HTTP and the ABHA record, and the delivery acknowledgements are stored', async () => {
  received.length = 0;
  const c = await confirmedCase();
  assert.equal((await deliveries(c.enc)).every((d) => d.status === 'pending' || d.status === 'delivered'), true);
  await t.integration.settle();
  const rows = await deliveries(c.enc);
  assert.deepEqual(rows.map((d) => [d.target, d.status]), [['abha', 'delivered'], ['his', 'delivered']]);
  const hisRow = rows.find((d) => d.target === 'his');
  assert.match(hisRow.ack.id, /^HIS-\d+$/, 'the HIS acknowledgement id is stored');
  assert.ok(hisRow.ack.receivedAt);
  assert.equal(rows.find((d) => d.target === 'abha').ack.stub, true, 'the ABHA push is the stub until sandbox access exists');
  const sent = received.at(-1);
  assert.equal(sent.headers.authorization, 'Bearer secret-token');
  assert.equal(sent.headers['content-type'], 'application/fhir+json');
  assert.equal(sent.bundle.type, 'document');
  assert.equal(sent.bundle.identifier.value.startsWith(c.enc), true);
  const audits = (await q(`SELECT action FROM audit_logs WHERE object_id = $1 AND action LIKE 'push_%'`, [c.enc])).map((a) => a.action);
  assert.equal(audits.filter((a) => a === 'push_delivered').length, 2);
  // running again sends nothing twice
  const before = received.length;
  await t.integration.settle();
  assert.equal(received.length, before);
});

test('a failing HIS is retried with back-off, ends in a visible failed state, and staff can retry it', async () => {
  received.length = 0;
  failNext = 100;
  const c = await confirmedCase({ purposes: { ...ALL, abha_linking: false }, abha: false });
  await t.integration.settle();
  const hisOf = async () => (await deliveries(c.enc)).find((x) => x.target === 'his');
  let d = await hisOf();
  assert.equal(d.target, 'his');
  assert.equal(d.status, 'pending', 'first failure: waiting for a retry');
  assert.equal(d.attempts, 1);
  assert.match(d.last_error, /HIS responded 500/);
  for (let i = 0; i < 6 && d.status === 'pending'; i++) { await sleep(120); await t.integration.settle(); d = await hisOf(); }
  assert.equal(d.status, 'failed');
  assert.equal(d.attempts, 3);
  assert.equal(received.length, 0);

  const list = (await t.call('GET', '/api/staff/deliveries', { cookie: staff })).body.deliveries;
  const mine = list.find((x) => x.encounterId === c.enc && x.target === 'his');
  assert.equal(mine.status, 'failed');
  assert.equal(list[0].status, 'failed', 'failures are listed first');
  assert.equal(mine.lastError.includes('500'), true);

  failNext = 0;
  assert.equal((await t.call('POST', `/api/staff/deliveries/${mine.id}/retry`, { cookie: staff })).status, 200);
  await sleep(50);
  await t.integration.settle();
  assert.equal((await deliveries(c.enc)).find((x) => x.target === 'his').status, 'delivered');
  assert.equal(received.length, 1);
  assert.equal((await t.call('POST', `/api/staff/deliveries/${mine.id}/retry`, { cookie: staff })).status, 409, 'a delivered one cannot be retried');
  assert.equal((await t.call('POST', '/api/staff/deliveries/nope/retry', { cookie: staff })).status, 400);
});

test('a purpose without consent is never sent, and the record says why', async () => {
  received.length = 0;
  const none = await confirmedCase({ purposes: { history: true, documents: true, his_sharing: false, abha_linking: false } });
  await t.integration.settle();
  assert.deepEqual((await deliveries(none.enc)).map((d) => [d.target, d.status, d.reason]), [['abha', 'not_sent', 'no_consent'], ['his', 'not_sent', 'no_consent']]);
  assert.equal(received.length, 0, 'nothing reached the hospital system');
  const [bundle] = await q('SELECT bundle FROM fhir_bundles WHERE encounter_id = $1', [none.enc]);
  assert.equal(JSON.stringify(bundle.bundle).includes(ABHA), false, 'no ABHA identifier without ABHA consent');
  assert.equal((await q(`SELECT count(*)::int n FROM audit_logs WHERE object_id = $1 AND action = 'push_skipped_no_consent'`, [none.enc]))[0].n, 2);

  const hisOnly = await confirmedCase({ purposes: { ...ALL, abha_linking: false } });
  await t.integration.settle();
  assert.deepEqual((await deliveries(hisOnly.enc)).map((d) => [d.target, d.status, d.reason]), [['abha', 'not_sent', 'no_consent'], ['his', 'delivered', null]]);

  const noAbha = await confirmedCase({ abha: false });
  await t.integration.settle();
  assert.deepEqual((await deliveries(noAbha.enc)).map((d) => [d.target, d.status, d.reason]), [['abha', 'not_sent', 'no_abha_identifier'], ['his', 'delivered', null]]);
});

test('withdrawing consent before a pending push stops it', async () => {
  received.length = 0;
  failNext = 100; // the first attempt fails, so the delivery is still waiting when consent is withdrawn
  const c = await confirmedCase({ abha: false });
  await t.integration.settle();
  assert.equal((await deliveries(c.enc)).find((d) => d.target === 'his').status, 'pending');
  const revoked = await t.call('POST', '/api/patient/consent/revoke', { cookie: c.cookie, body: { purposes: ['his_sharing'] } });
  assert.equal(revoked.status, 200);
  await sleep(60);
  await t.integration.settle();
  const his = (await deliveries(c.enc)).find((d) => d.target === 'his');
  assert.equal(his.status, 'cancelled');
  assert.equal(received.length, 0);
  failNext = 0;
});

test('a rejected draft sends nothing until the doctor documents the history, and the manual note is what is sent', async () => {
  received.length = 0;
  const mobile = `92000${String(10000 + n++)}`;
  const reg = await t.registerPatient({ fullName: 'Reject Tester', mobile, age: 40 });
  const consent = await t.call('POST', '/api/patient/consent', { cookie: reg.cookie, body: { purposes: ALL } });
  const enc = consent.body.encounterId;
  await t.call('POST', '/api/patient/submit', { cookie: reg.cookie });
  await t.call('POST', `/api/doctor/encounters/${enc}/consult`, { cookie: doctor });
  await t.call('POST', `/api/doctor/encounters/${enc}/summary/reject`, { cookie: doctor });
  await t.integration.settle();
  assert.equal((await deliveries(enc)).length, 0, 'a rejected draft is not sent');
  await t.call('POST', `/api/doctor/encounters/${enc}/summary/manual`, { cookie: doctor, body: { note: 'History taken in person: fever for two days.' } });
  await t.integration.settle();
  const sent = received.at(-1).bundle;
  const sections = sent.entry[0].resource.section;
  assert.ok(sections.some((s) => s.text.div.includes('fever for two days')));
  assert.equal(JSON.stringify(sections).includes('AI draft'), false);
});

test('only staff can see deliveries or retry them', async () => {
  for (const cookie of [doctor, undefined]) assert.ok([401, 403].includes((await t.call('GET', '/api/staff/deliveries', { cookie })).status));
  const patientCookie = (await t.registerPatient({ fullName: 'Nobody', mobile: '9100000001', age: 30 })).cookie;
  assert.equal((await t.call('GET', '/api/staff/deliveries', { cookie: patientCookie })).status, 403);
  assert.equal((await t.call('POST', '/api/staff/deliveries/00000000-0000-4000-8000-000000000000/retry', { cookie: doctor })).status, 403);
});

test('the HIS connector refuses to start without an address, and the mock acknowledges', async () => {
  assert.throws(() => createHisConnector({ mode: 'http' }), /HIS_URL/);
  const mock = createHisConnector();
  assert.match((await mock.send({ id: 'x' })).id, /^mock-his-1$/);
  assert.equal(mock.received.length, 1);
});
