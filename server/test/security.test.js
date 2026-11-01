import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { startTestApp } from './helpers.js';
import { png } from './doc-helpers.js';

// Role-boundary and input-handling checks (Phase 8). This is the project's own automated review, NOT an independent penetration test:
// docs/security-report.md says what an independent test must still cover.
const ID = '00000000-0000-4000-8000-000000000000';
const CONFIRM = { visual: true, audio: true };
let t, staff, doctor, patientA, patientB, n = 0;
before(async () => {
  t = await startTestApp();
  staff = await t.login('staff');
  doctor = await t.login('doctor');
  const mk = async (name) => {
    const reg = await t.registerPatient({ fullName: name, mobile: `90000${String(10000 + n++)}`, age: 41 });
    const consent = await t.call('POST', '/api/patient/consent', { cookie: reg.cookie, body: { purposes: { history: true, documents: true, his_sharing: true, abha_linking: true } } });
    return { cookie: reg.cookie, enc: consent.body.encounterId };
  };
  patientA = await mk('Patient A');
  patientB = await mk('Patient B');
});
after(async () => { await t.close(); });

const STAFF = [['GET', '/api/staff/alerts'], ['GET', '/api/staff/queue'], ['GET', '/api/staff/help-requests'], ['GET', '/api/staff/departments'], ['GET', '/api/staff/deliveries'],
  ['POST', '/api/staff/patients'], ['POST', `/api/staff/alerts/${ID}/ack`], ['POST', `/api/staff/help-requests/${ID}/ack`], ['PUT', `/api/staff/encounters/${ID}/mode`], ['POST', `/api/staff/deliveries/${ID}/retry`]];
const DOCTOR = [['GET', '/api/doctor/alerts'], ['GET', '/api/doctor/encounters'], ['GET', `/api/doctor/encounters/${ID}/analysis`], ['GET', `/api/doctor/encounters/${ID}/summary`],
  ['GET', `/api/doctor/encounters/${ID}/documents/${ID}/file`], ['POST', `/api/doctor/encounters/${ID}/consult`], ['POST', `/api/doctor/encounters/${ID}/summary/accept`],
  ['POST', `/api/doctor/encounters/${ID}/summary/amend`], ['POST', `/api/doctor/encounters/${ID}/summary/reject`], ['POST', `/api/doctor/encounters/${ID}/summary/manual`],
  ['POST', `/api/doctor/encounters/${ID}/analysis/rerun`]];
const PATIENT = [['GET', '/api/patient/interview/next'], ['GET', '/api/patient/interview/state'], ['GET', '/api/patient/interview/review'], ['GET', '/api/patient/interview/history'],
  ['GET', '/api/patient/documents'], ['GET', '/api/patient/summary'], ['POST', '/api/patient/submit'], ['POST', '/api/patient/consent/revoke'], ['POST', '/api/patient/interview/answer']];

test('every staff route refuses no session (401) and every other role (403)', async () => {
  for (const [m, p] of STAFF) {
    assert.equal((await t.call(m, p)).status, 401, `${m} ${p} anonymous`);
    for (const [who, cookie] of [['patient', patientA.cookie], ['doctor', doctor]]) assert.equal((await t.call(m, p, { cookie })).status, 403, `${m} ${p} as ${who}`);
  }
});

test('every doctor route refuses no session (401) and every other role (403)', async () => {
  for (const [m, p] of DOCTOR) {
    assert.equal((await t.call(m, p)).status, 401, `${m} ${p} anonymous`);
    for (const [who, cookie] of [['patient', patientA.cookie], ['staff', staff]]) assert.equal((await t.call(m, p, { cookie })).status, 403, `${m} ${p} as ${who}`);
  }
});

test('every patient route needs a patient session; staff and doctor sessions do not open them', async () => {
  for (const [m, p] of PATIENT) {
    assert.equal((await t.call(m, p)).status, 401, `${m} ${p} anonymous`);
    for (const [who, cookie] of [['staff', staff], ['doctor', doctor]]) assert.ok([401, 403].includes((await t.call(m, p, { cookie })).status), `${m} ${p} as ${who}`);
  }
});

test('the portal gateway keeps each role to its own portal', async () => {
  assert.equal((await t.call('GET', '/api/portal/doctor/ping', { cookie: staff })).status, 403);
  assert.equal((await t.call('GET', '/api/portal/staff/ping', { cookie: doctor })).status, 403);
  assert.equal((await t.call('GET', '/api/portal/staff/ping', { cookie: patientA.cookie })).status, 403);
  assert.equal((await t.call('GET', '/api/portal/doctor/ping')).status, 401);
  assert.equal((await t.call('GET', '/api/portal/admin/ping', { cookie: staff })).status, 403);
  assert.equal((await t.call('GET', '/api/portal/nowhere/ping', { cookie: staff })).status, 404);
});

test('forged, unsigned, expired and tampered tokens are refused', async () => {
  const doctorId = (await t.db.pool.query(`SELECT id FROM users WHERE username = 'doctor.test'`)).rows[0].id;
  const claims = { sub: doctorId, role: 'doctor', name: 'x' };
  const bearer = (token) => t.call('GET', '/api/doctor/encounters', { cookie: undefined }).then(() => fetch(`${t.base}/api/doctor/encounters`, { headers: { authorization: `Bearer ${token}` } }));
  assert.equal((await bearer(jwt.sign(claims, 'wrong-secret'))).status, 401, 'signed with another secret');
  assert.equal((await bearer(jwt.sign(claims, 'test-secret', { expiresIn: -10 }))).status, 401, 'expired');
  const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.`;
  assert.equal((await bearer(none)).status, 401, 'alg none');
  const good = jwt.sign({ ...claims, role: 'staff' }, 'test-secret');
  assert.equal((await bearer(good)).status, 403, 'a valid token cannot be used for another role\'s portal');
  const parts = jwt.sign(claims, 'test-secret').split('.');
  assert.equal((await bearer(`${parts[0]}.${Buffer.from(JSON.stringify({ ...claims, role: 'staff' })).toString('base64url')}.${parts[2]}`)).status, 401, 'payload swapped');
  assert.equal((await bearer('not.a.token')).status, 401);
});

test('one patient cannot read, change or delete another patient\'s files or answers', async () => {
  const up = await t.send('POST', '/api/patient/documents', png('en-rx-printed'), { cookie: patientA.cookie, name: 'a.png' });
  assert.equal(up.status, 202);
  const id = up.body.document.id;
  assert.equal((await t.call('DELETE', `/api/patient/documents/${id}`, { cookie: patientB.cookie })).status, 404);
  assert.equal((await t.send('PUT', `/api/patient/documents/${id}`, png('en-rx-printed'), { cookie: patientB.cookie })).status, 404);
  assert.deepEqual((await t.call('GET', '/api/patient/documents', { cookie: patientB.cookie })).body.documents, []);
  await t.call('POST', '/api/patient/interview/answer', { cookie: patientA.cookie, body: { questionKey: 'cc.main', value: 'fever', modality: 'tap' } });
  assert.equal((await t.call('GET', '/api/patient/interview/review', { cookie: patientB.cookie })).body.items.length, 0, 'B sees none of A\'s answers');
  await t.settle();
});

test('malformed, oversized and hostile input gives a clean error, never a crash or a leak', async () => {
  const raw = (path, body, extra = {}) => fetch(`${t.base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...extra }, body });
  assert.equal((await raw('/api/auth/login', '{not json')).status, 400);
  assert.equal((await raw('/api/auth/login', JSON.stringify({ username: 'x'.repeat(200_000), password: 'y' }))).status, 413);
  for (const hostile of ["' OR '1'='1", "doctor.test'--", '"; DROP TABLE users; --', '../../etc/passwd', '<script>alert(1)</script>', '\u0000']) {
    const r = await raw('/api/auth/login', JSON.stringify({ username: hostile, password: hostile }));
    assert.equal(r.status, hostile.includes(String.fromCharCode(0)) ? 400 : 401, `login with ${JSON.stringify(hostile).slice(0, 20)}`);
    assert.equal((await r.text()).includes('error: '), false);
  }
  assert.equal((await raw('/api/auth/login', JSON.stringify({ username: { $ne: null }, password: { $ne: null } }))).status, 400, 'objects instead of strings');
  for (const hostile of ["'; DROP TABLE encounters;--", '%', '_', '\\', 'x'.repeat(5000)]) {
    const r = await t.call('GET', `/api/doctor/encounters?q=${encodeURIComponent(hostile)}&status=${encodeURIComponent(hostile)}`, { cookie: doctor });
    assert.equal(r.status, 200, 'queue search with hostile text');
    assert.deepEqual(r.body.items.filter((i) => i.name === hostile), []);
  }
  assert.ok((await t.db.pool.query('SELECT count(*)::int n FROM users')).rows[0].n >= 2, 'the tables are still there');
  assert.equal((await t.call('GET', `/api/doctor/encounters/${'../../x'}/summary`, { cookie: doctor })).status, 404);
  assert.equal((await t.call('GET', `/api/doctor/encounters/not-a-uuid/summary`, { cookie: doctor })).status, 400);
  assert.equal((await t.send('POST', '/api/patient/documents', Buffer.from('MZ\x90\x00 executable bytes'), { cookie: patientA.cookie })).status, 415, 'a program is not accepted as a document');
});

test('session cookies are HttpOnly and SameSite, and a text answer is escaped in the FHIR narrative', async () => {
  const res = await fetch(`${t.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'doctor.test', password: 'doctor-test-pw' }) });
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);

  const mobile = '9000099999';
  const reg = await t.registerPatient({ fullName: 'Escape Tester', mobile, age: 33 });
  const consent = await t.call('POST', '/api/patient/consent', { cookie: reg.cookie, body: { purposes: { history: true, documents: true, his_sharing: true, abha_linking: true } } });
  const evil = '<img src=x onerror=alert(1)> & "quotes"';
  for (const [k, v] of [['emergency.screen', ['none']], ['cc.main', 'other']]) await t.call('POST', '/api/patient/interview/answer', { cookie: reg.cookie, body: { questionKey: k, value: v, modality: 'tap', confirmation: CONFIRM } });
  await t.call('POST', '/api/patient/interview/answer', { cookie: reg.cookie, body: { questionKey: 'cc.other_text', value: evil, modality: 'tap' } });
  await t.call('POST', '/api/patient/submit', { cookie: reg.cookie });
  await t.call('POST', `/api/doctor/encounters/${consent.body.encounterId}/consult`, { cookie: doctor });
  await t.call('POST', `/api/doctor/encounters/${consent.body.encounterId}/summary/accept`, { cookie: doctor });
  const { rows: [b] } = await t.db.pool.query('SELECT bundle FROM fhir_bundles WHERE encounter_id = $1', [consent.body.encounterId]);
  const divs = b.bundle.entry[0].resource.section.map((s) => s.text.div).join('');
  assert.equal(divs.includes('<img'), false, 'markup is escaped');
  assert.ok(divs.includes('&lt;img'));
  await t.integration.settle();
});
