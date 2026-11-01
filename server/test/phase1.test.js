import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { startTestApp } from './helpers.js';
import { stripRestricted } from '../src/patients.js';

let t;
before(async () => { t = await startTestApp(); });
after(async () => { await t.close(); });

const ALL = { history: true, documents: true, his_sharing: true, abha_linking: true };
const q = (sql, params) => t.db.pool.query(sql, params).then((r) => r.rows);

test('a new patient registers in each of English, Hindi and Marathi and gets a PatientCase ID', async () => {
  const people = [
    ['Anil Deshmukh', '9000000001', 'en'], ['अनिल देशमुख', '9000000002', 'hi'], ['सुनीता पाटील', '9000000003', 'mr'],
  ];
  for (const [fullName, mobile, language] of people) {
    const r = await t.registerPatient({ fullName, mobile, language, age: 40 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.match(r.body.patientcaseId, /^PC-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.equal(r.body.language, language);
    assert.equal(r.body.sessionState, 'consent_pending');
  }
});

test('registration needs a verified mobile, the minimum valid fields and registration consent', async () => {
  const noOtp = await t.call('POST', '/api/patient/register', { body: t.form() });
  assert.equal(noOtp.status, 401);
  const token = await t.verifyMobile('9000000010');
  const bad = await t.call('POST', '/api/patient/register', { body: { ...t.form({ mobile: '9000000010', sex: 'x', age: 400, registrationConsent: false }), verificationToken: token } });
  assert.equal(bad.status, 400);
  assert.deepEqual(bad.body.fields.sort(), ['dateOfBirthOrAge', 'registrationConsent', 'sex']);
  // the same verified mobile cannot be swapped for a different number
  const swap = await t.call('POST', '/api/patient/register', { body: { ...t.form({ mobile: '9000000011', fullName: 'Someone Else' }), verificationToken: token } });
  assert.equal(swap.status, 400);
});

test('OTP: wrong codes are limited, then the patient is routed to staff help', async () => {
  const sent = await t.call('POST', '/api/patient/otp/send', { body: { mobile: '9000000020' } });
  const wrong = sent.body.devCode === '000000' ? '111111' : '000000';
  const verify = (code) => t.call('POST', '/api/patient/otp/verify', { body: { challengeId: sent.body.challengeId, code } });
  assert.deepEqual([(await verify(wrong)).status, (await verify(wrong)).status, (await verify(wrong)).status], [401, 401, 423]);
  const locked = await verify(sent.body.devCode); // even the right code no longer works
  assert.equal(locked.status, 423);
  assert.equal(locked.body.helpRequired, true);
  const staff = await t.login('staff');
  const { body } = await t.call('GET', '/api/staff/help-requests', { cookie: staff });
  assert.ok(body.helpRequests.some((h) => h.reason === 'otp_failed' && !h.acknowledged_at));
});

test('OTP: sending is rate limited per mobile', async () => {
  const statuses = [];
  for (let i = 0; i < 4; i++) statuses.push((await t.call('POST', '/api/patient/otp/send', { body: { mobile: '9000000021' } })).status);
  assert.deepEqual(statuses, [200, 200, 200, 429]);
});

test('a near-duplicate (spelling variant, same mobile) must be confirmed; a different person is not blocked', async () => {
  const first = await t.registerPatient({ fullName: 'Rakesh Kumar', mobile: '9811111111', age: 58 });
  assert.equal(first.status, 201);

  const token = await t.verifyMobile('9811111111');
  const variant = { ...t.form({ fullName: 'Rakesh Kumaar', mobile: '9811111111', age: 58 }), verificationToken: token };
  const caught = await t.call('POST', '/api/patient/register', { body: variant });
  assert.equal(caught.status, 409);
  assert.equal(caught.body.candidates[0].match, 'strong');
  assert.equal(caught.body.candidates[0].maskedName, 'Rakesh K.'); // masked: the patient never sees the full record
  assert.equal((await q('SELECT count(*)::int n FROM patients WHERE mobile_hash IS NOT NULL AND full_name LIKE $1', ['Rakesh%']))[0].n, 1);

  // confirming "that is me" signs the patient in to the existing record, no new record
  const same = await t.call('POST', '/api/patient/register', { body: { ...variant, duplicateDecision: { confirmExistingId: caught.body.candidates[0].patientId } } });
  assert.equal(same.status, 200);
  assert.equal(same.body.existing, true);
  assert.equal((await q(`SELECT count(*)::int n FROM patients WHERE full_name LIKE 'Rakesh%'`))[0].n, 1);

  // clearly different person, different mobile: not blocked
  const other = await t.registerPatient({ fullName: 'Meena Shaikh', mobile: '9822222222', age: 67 });
  assert.equal(other.status, 201);

  // family sharing a phone: they can say "I am someone else" and still register
  const token2 = await t.verifyMobile('9811111111');
  const shared = { ...t.form({ fullName: 'Pooja Kumar', mobile: '9811111111', age: 30 }), verificationToken: token2 };
  const c = await t.call('POST', '/api/patient/register', { body: shared });
  assert.equal(c.status, 409);
  const made = await t.call('POST', '/api/patient/register', { body: { ...shared, duplicateDecision: { createNew: true } } });
  assert.equal(made.status, 201);
});

test('a look-alike with a different mobile is not shown to the patient but is sent to staff', async () => {
  await t.registerPatient({ fullName: 'Vikram Bhosale', mobile: '9833333333', age: 45 });
  const r = await t.registerPatient({ fullName: 'Vikram Bhosale', mobile: '9844444444', age: 45 });
  assert.equal(r.status, 201); // no record leaked to the patient
  const staff = await t.login('staff');
  const { body } = await t.call('GET', '/api/staff/help-requests', { cookie: staff });
  assert.ok(body.helpRequests.some((h) => h.reason === 'possible_duplicate_review'));
});

test('a returning patient is found by ABHA ID, Aadhaar, mobile OTP and PatientCase ID', async () => {
  const abhaId = '12345678901234';
  const aadhaar = '123412341234';
  const reg = await t.registerPatient({ fullName: 'Lata Joshi', mobile: '9855555555', age: 63, dateOfBirth: '1963-04-02', abhaId, aadhaar });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  const id = reg.body.patientcaseId;

  const byId = await t.call('POST', '/api/patient/lookup', { body: { method: 'patientcase_id', patientcaseId: id.toLowerCase(), dateOfBirth: '1963-04-02', language: 'hi' } });
  assert.equal(byId.body.patientcaseId, id);
  assert.equal(byId.body.language, 'hi'); // session uses the language chosen at the terminal
  assert.equal((await t.call('POST', '/api/patient/lookup', { body: { method: 'patientcase_id', patientcaseId: id, dateOfBirth: '1990-01-01', language: 'en' } })).status, 404);

  assert.equal((await t.call('POST', '/api/patient/lookup', { body: { method: 'abha', abhaId, language: 'en' } })).body.patientcaseId, id);
  assert.equal((await t.call('POST', '/api/patient/lookup', { body: { method: 'aadhaar', aadhaar, language: 'mr' } })).body.patientcaseId, id);
  assert.equal((await t.call('POST', '/api/patient/lookup', { body: { method: 'abha', abhaId: '99999999999999', language: 'en' } })).status, 404);
  assert.equal((await t.call('POST', '/api/patient/lookup', { body: { method: 'abha', abhaId: '123', language: 'en' } })).status, 400);

  const token = await t.verifyMobile('9855555555');
  const byOtp = await t.call('POST', '/api/patient/lookup', { body: { method: 'mobile_otp', verificationToken: token, language: 'en' } });
  assert.equal(byOtp.body.patientcaseId, id);
  const reuse = await t.call('POST', '/api/patient/lookup', { body: { method: 'mobile_otp', verificationToken: token, language: 'en' } });
  assert.equal(reuse.status, 401); // a verified code is single use
});

test('sensitive fields are stored only hashed or encrypted (mobile, ABHA, Aadhaar)', async () => {
  const [p] = await q(`SELECT * FROM patients WHERE full_name = 'Lata Joshi'`);
  assert.ok(p.mobile_hash && p.mobile_encrypted);
  assert.ok(!JSON.stringify(p).includes('9855555555'));
  const ids = await q('SELECT * FROM patient_identifiers WHERE patient_id = $1', [p.id]);
  assert.equal(ids.length, 2);
  for (const i of ids) {
    assert.ok(i.value_hash && i.value_encrypted.startsWith('v1:'));
    assert.ok(!JSON.stringify(i).includes('12345678901234') && !JSON.stringify(i).includes('123412341234'));
  }
  assert.ok((await q(`SELECT count(*)::int n FROM patients WHERE mobile_hash LIKE '98%' AND length(mobile_hash) < 64`))[0].n === 0);
});

test('consent: four purposes are given or refused separately, and clinical writes need the matching consent', async () => {
  const reg = await t.registerPatient({ fullName: 'Consent Tester', mobile: '9866666666', age: 30 });
  const cookie = reg.cookie;

  // nothing can be written before consent
  const early = await t.call('PUT', '/api/patient/responses/chief_complaint', { cookie, body: { answer: 'cough', modality: 'tap' } });
  assert.equal(early.status, 403);
  assert.equal(early.body.error, 'consent_required');

  assert.equal((await t.call('POST', '/api/patient/consent', { cookie, body: { purposes: { history: true } } })).status, 400);
  const given = await t.call('POST', '/api/patient/consent', { cookie, body: { language: 'hi', purposes: { ...ALL, documents: false, his_sharing: false } } });
  assert.equal(given.status, 201);
  assert.deepEqual(given.body.consent, { history: true, documents: false, his_sharing: false, abha_linking: true });

  const ok = await t.call('PUT', '/api/patient/responses/chief_complaint', { cookie, body: { answer: 'cough', modality: 'voice', confidence: 0.9 } });
  assert.equal(ok.status, 200);
  const doc = await t.call('POST', '/api/patient/documents', { cookie, body: { docType: 'lab_report' } });
  assert.equal(doc.status, 403); // documents were refused
  assert.equal(doc.body.purpose, 'documents');
  assert.equal((await q('SELECT count(*)::int n FROM documents'))[0].n, 0);

  // revocation: documents were never given; revoke history
  const revoked = await t.call('POST', '/api/patient/consent/revoke', { cookie, body: { purposes: ['history'] } });
  assert.equal(revoked.body.consent.history, false);
  assert.equal(revoked.body.sessionState, 'revoked');
  const after = await t.call('PUT', '/api/patient/responses/chief_complaint', { cookie, body: { answer: 'fever', modality: 'tap' } });
  assert.equal(after.status, 403);

  const log = (await q(`SELECT action, detail FROM audit_logs WHERE actor_type = 'patient' AND action LIKE 'consent_%'`)).map((r) => r.action);
  assert.ok(log.includes('consent_given') && log.includes('consent_revoked'));
});

test('declining the history consent closes the session and nothing clinical is stored', async () => {
  const reg = await t.registerPatient({ fullName: 'Decliner One', mobile: '9877777777', age: 50 });
  const before = (await q('SELECT (SELECT count(*) FROM encounters) e, (SELECT count(*) FROM interview_responses) i, (SELECT count(*) FROM documents) d, (SELECT count(*) FROM consents) c'))[0];
  const declined = await t.call('POST', '/api/patient/consent', { cookie: reg.cookie, body: { purposes: { history: false, documents: true, his_sharing: false, abha_linking: false } } });
  assert.deepEqual([declined.body.closed, declined.body.sessionState], [true, 'closed']);
  assert.deepEqual((await q('SELECT (SELECT count(*) FROM encounters) e, (SELECT count(*) FROM interview_responses) i, (SELECT count(*) FROM documents) d, (SELECT count(*) FROM consents) c'))[0], before);
  for (const [method, path, body] of [['PUT', '/api/patient/responses/x', { answer: 1, modality: 'tap' }], ['POST', '/api/patient/documents', {}], ['GET', '/api/patient/me']]) {
    assert.equal((await t.call(method, path, { cookie: reg.cookie, body })).status, 403, path);
  }
});

test('staff register a patient on their behalf, with the same duplicate check', async () => {
  const staff = await t.login('staff');
  const form = { fullName: 'Ramesh Pawar', age: 52, sex: 'male', mobile: '9888888888', language: 'mr', registrationConsent: true };
  const made = await t.call('POST', '/api/staff/patients', { cookie: staff, body: form });
  assert.equal(made.status, 201);
  assert.match(made.body.patientcaseId, /^PC-/);
  assert.equal((await q(`SELECT registration_channel, registered_by IS NOT NULL AS by FROM patients WHERE full_name = 'Ramesh Pawar'`))[0].by, true);

  const dup = await t.call('POST', '/api/staff/patients', { cookie: staff, body: { ...form, fullName: 'Ramesh Pavar' } });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.candidates[0].fullName, 'Ramesh Pawar'); // staff see the full record
  assert.equal((await t.call('POST', '/api/staff/patients', { cookie: staff, body: { ...form, mobile: '9888888899', fullName: 'Different Person' } })).status, 201);
  assert.equal((await t.call('POST', '/api/staff/patients', { cookie: staff, body: { ...form, registrationConsent: false } })).status, 400);

  const doctor = await t.login('doctor');
  assert.equal((await t.call('POST', '/api/staff/patients', { cookie: doctor, body: form })).status, 403);
});

test('Patient-portal responses never contain analysis results, flags or alert levels (FR-P5)', async () => {
  const leaky = { name: 'x', analysis: { a: 1 }, nested: [{ flags: ['high'], alertLevel: 3, ok: true }], flag: 'high', alert: {}, severity: 'x' };
  assert.deepEqual(stripRestricted(leaky), { name: 'x', nested: [{ ok: true }] });

  // the real patient router applies the filter to every response it sends
  const { createPatientRouter } = await import('../src/patientRoutes.js');
  const fake = express();
  const router = createPatientRouter({ pool: t.db.pool, jwtSecret: 's', crypto: {}, otp: {}, abdm: {}, issueSession() {}, exposeDevCode: false, docs: { limits: { maxBytes: 1 } } });
  router.get('/leak', (_req, res) => res.json(leaky));
  fake.use('/api/patient', router);
  const s = fake.listen(0);
  const body = await (await fetch(`http://127.0.0.1:${s.address().port}/api/patient/leak`)).json();
  s.close();
  assert.deepEqual(body, { name: 'x', nested: [{ ok: true }] });

  // and a real signed-in response carries none of the restricted keys
  const reg = await t.registerPatient({ fullName: 'Filter Check', mobile: '9899999999', age: 33 });
  await t.call('POST', '/api/patient/consent', { cookie: reg.cookie, body: { purposes: ALL } });
  const me = await t.call('GET', '/api/patient/me', { cookie: reg.cookie });
  assert.match(JSON.stringify(me.body), /Filter Check/);
  assert.doesNotMatch(JSON.stringify(me.body), /analysis|flag|alert|severity/i);
});

test('optional ABHA creation and linking work once signed in and can be skipped', async () => {
  const reg = await t.registerPatient({ fullName: 'Abha Maker', mobile: '9800000001', age: 29 });
  assert.equal(reg.status, 201); // registered without ABHA
  const created = await t.call('POST', '/api/patient/abha/create', { cookie: reg.cookie });
  assert.equal(created.status, 201);
  const byAbha = await t.call('POST', '/api/patient/lookup', { body: { method: 'abha', abhaId: created.body.abhaId, language: 'en' } });
  assert.equal(byAbha.body.fullName, 'Abha Maker');
  assert.equal((await t.call('POST', '/api/patient/abha/link', { cookie: reg.cookie, body: { abhaId: 'bad' } })).status, 400);
});
