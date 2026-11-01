import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { utimes, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { startTestApp } from './helpers.js';
import { png } from './doc-helpers.js';
import { codeAt, newSecret, verifyCode } from '../src/totp.js';
import { createLoginLimiter } from '../src/security.js';

const CONFIRM = { visual: true, audio: true };
const ALL = { history: true, documents: true, his_sharing: true, abha_linking: true };
let t, doctor, n = 0;
const logged = [];
const q = (sql, params) => t.db.pool.query(sql, params).then((r) => r.rows);
const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
before(async () => {
  for (const k of Object.keys(orig)) console[k] = (...a) => { logged.push(a.map(String).join(' ')); };
  t = await startTestApp();
  doctor = await t.login('doctor');
});
after(async () => { Object.assign(console, orig); await t.close(); });

async function patient({ mobile = `91000${String(10000 + n++)}`, name = 'Compliance Tester', answers = true } = {}) {
  const reg = await t.registerPatient({ fullName: name, mobile, age: 50, sex: 'male' });
  const consent = await t.call('POST', '/api/patient/consent', { cookie: reg.cookie, body: { purposes: ALL } });
  const enc = consent.body.encounterId;
  const answer = (k, v, extra = {}) => t.call('POST', '/api/patient/interview/answer', { cookie: reg.cookie, body: { questionKey: k, value: v, modality: 'voice', confirmation: CONFIRM, ...extra } });
  if (answers) { await answer('emergency.screen', ['none'], { transcript: 'nothing at all' }); await answer('cc.main', 'fever', { transcript: 'I have fever' }); }
  return { cookie: reg.cookie, enc, mobile, answer, submit: () => t.call('POST', '/api/patient/submit', { cookie: reg.cookie }) };
}

// ---- the audit log ----
test('the audit log is partitioned by month and records consent, access, edit, alert, sign-in and push events', async () => {
  const p = await patient();
  await p.answer('pain.site', 'chest'); // not reachable: ignored
  await p.answer('emergency.screen', ['e_chest']); // alert
  await p.submit();
  await t.call('GET', `/api/doctor/encounters/${p.enc}/summary`, { cookie: doctor });
  await t.call('POST', `/api/doctor/encounters/${p.enc}/consult`, { cookie: doctor });
  await t.call('POST', `/api/doctor/encounters/${p.enc}/summary/accept`, { cookie: doctor });
  await t.integration.settle();
  const actions = new Set((await q('SELECT DISTINCT action FROM audit_logs')).map((r) => r.action));
  for (const a of ['consent_given', 'history_answer_saved', 'alert_raised', 'summary_viewed', 'case_opened', 'summary_accept', 'login_success', 'push_skipped_no_consent', 'push_delivered', 'intake_submitted']) {
    assert.ok(actions.has(a), `${a} is audited`);
  }
  const parts = await q(`SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid JOIN pg_class p ON p.oid = i.inhparent WHERE p.relname = 'audit_logs' ORDER BY 1`);
  assert.ok(parts.length >= 5, `partitions: ${parts.map((x) => x.relname)}`);
  const thisMonth = `audit_logs_${new Date().toISOString().slice(0, 7).replace('-', '_')}`;
  assert.ok(parts.some((x) => x.relname === thisMonth), 'the current month has its own partition');
  const [row] = await q(`SELECT tableoid::regclass::text AS part FROM audit_logs WHERE action = 'consent_given' LIMIT 1`);
  assert.equal(row.part, thisMonth, 'rows land in the month\'s partition');
  assert.equal((await q('SELECT ensure_audit_partitions() AS n'))[0].n, 0, 'maintenance is idempotent');
});

test('audit rows cannot be updated, deleted or truncated, on the table or on a partition', async () => {
  const [{ id }] = await q('SELECT id FROM audit_logs LIMIT 1');
  const before = (await q('SELECT count(*)::int n FROM audit_logs'))[0].n;
  const refuse = async (sql, params = []) => assert.rejects(() => t.db.pool.query(sql, params), /append-only/);
  await refuse('UPDATE audit_logs SET action = $1 WHERE id = $2', ['edited', id]);
  await refuse('DELETE FROM audit_logs WHERE id = $1', [id]);
  await refuse('DELETE FROM audit_logs');
  await refuse('TRUNCATE audit_logs');
  const part = (await q('SELECT tableoid::regclass::text AS p FROM audit_logs WHERE id = $1', [id]))[0].p;
  await refuse(`UPDATE ${part} SET action = 'edited'`);
  await refuse(`DELETE FROM ${part}`);
  await refuse(`TRUNCATE ${part}`);
  assert.equal((await q('SELECT count(*)::int n FROM audit_logs'))[0].n, before);
  assert.equal((await q('SELECT count(*)::int n FROM audit_logs WHERE action = $1', ['edited'])).at(0).n, 0);
  await t.db.pool.query(`INSERT INTO audit_logs (action, actor_type) VALUES ('append_ok', 'test')`); // appending still works
});

test('sign-ins are audited, failures are limited, and the failure reason is not the password', async () => {
  const limiter = createLoginLimiter({ max: 3 });
  const small = await startTestApp({ loginLimiter: limiter });
  try {
    const bad = () => small.call('POST', '/api/auth/login', { body: { username: 'doctor.test', password: 'wrong-password-123' } });
    for (let i = 0; i < 3; i++) assert.equal((await bad()).status, 401);
    assert.equal((await bad()).status, 429, 'the fourth attempt is refused');
    assert.equal((await small.call('POST', '/api/auth/login', { body: { username: 'doctor.test', password: 'doctor-test-pw' } })).status, 429, 'even the right password waits');
    const rows = (await small.db.pool.query(`SELECT detail FROM audit_logs WHERE action = 'login_failed'`)).rows;
    assert.equal(rows.length, 3);
    assert.equal(JSON.stringify(rows).includes('wrong-password'), false);
    const other = await small.call('POST', '/api/auth/login', { body: { username: 'staff.test', password: 'staff-test-pw' } });
    assert.equal(other.status, 200, 'another user is not affected');
  } finally { await small.close(); }
});

// ---- multi-factor ----
test('TOTP matches the RFC 6238 test vector and tolerates one step of clock drift', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // "12345678901234567890"
  assert.equal(codeAt(secret, 59_000), '287082');
  assert.equal(codeAt(secret, 1_111_111_109_000), '081804');
  assert.equal(verifyCode(secret, '287082', 59_000), true);
  assert.equal(verifyCode(secret, '287082', 59_000 + 30_000), true);
  assert.equal(verifyCode(secret, '287082', 59_000 + 90_000), false);
  assert.equal(verifyCode(secret, 'abcdef', 59_000), false);
  assert.equal(newSecret().length, 32);
});

test('a doctor can enrol an authenticator; sign-in then needs the code, and the secret is stored encrypted', async () => {
  const app = await startTestApp();
  try {
    const login = (body) => app.call('POST', '/api/auth/login', { body: { username: 'doctor.test', password: 'doctor-test-pw', ...body } });
    const first = await login({});
    assert.equal(first.status, 200);
    assert.equal(first.body.mfaEnabled, false);
    const enrol = await app.call('POST', '/api/auth/mfa/enrol', { cookie: first.cookie });
    assert.equal(enrol.status, 200);
    assert.match(enrol.body.uri, /^otpauth:\/\/totp\//);
    const [stored] = (await app.db.pool.query(`SELECT mfa_secret, mfa_enabled FROM users WHERE username = 'doctor.test'`)).rows;
    assert.ok(stored.mfa_secret.startsWith('v1:') && !stored.mfa_secret.includes(enrol.body.secret), 'encrypted at rest');
    assert.equal(stored.mfa_enabled, false, 'not on until confirmed');
    assert.equal((await login({})).status, 200, 'still password-only until confirmed');
    assert.equal((await app.call('POST', '/api/auth/mfa/confirm', { cookie: first.cookie, body: { code: '000000' } })).status, 400);
    assert.equal((await app.call('POST', '/api/auth/mfa/confirm', { cookie: first.cookie, body: { code: codeAt(enrol.body.secret) } })).status, 200);

    const noCode = await login({});
    assert.equal(noCode.status, 401);
    assert.equal(noCode.body.mfaRequired, true);
    assert.equal((await login({ code: '123456' })).status, 401);
    const ok = await login({ code: codeAt(enrol.body.secret) });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.mfaEnabled, true);
    assert.equal((await app.call('GET', '/api/doctor/encounters', { cookie: ok.cookie })).status, 200);
    assert.equal((await app.call('POST', '/api/auth/mfa/enrol', { cookie: ok.cookie })).status, 409);
    assert.equal((await app.call('POST', '/api/auth/mfa/enrol')).status, 401);
    const actions = (await app.db.pool.query(`SELECT action FROM audit_logs WHERE action IN ('mfa_enrolled','login_failed')`)).rows.map((r) => r.action);
    assert.ok(actions.includes('mfa_enrolled') && actions.includes('login_failed'));
  } finally { await app.close(); }
});

test('when multi-factor is required, a session without it can do nothing but enrol', async () => {
  const app = await startTestApp({ requireMfa: true });
  try {
    const r = await app.call('POST', '/api/auth/login', { body: { username: 'staff.test', password: 'staff-test-pw' } });
    assert.equal(r.body.mfaEnrolmentRequired, true);
    assert.equal((await app.call('GET', '/api/staff/queue', { cookie: r.cookie })).status, 403);
    assert.equal((await app.call('GET', '/api/staff/queue', { cookie: r.cookie })).body.error, 'mfa_required');
    const enrol = await app.call('POST', '/api/auth/mfa/enrol', { cookie: r.cookie });
    const confirm = await app.call('POST', '/api/auth/mfa/confirm', { cookie: r.cookie, body: { code: codeAt(enrol.body.secret) } });
    assert.equal(confirm.status, 200);
    assert.equal((await app.call('GET', '/api/staff/queue', { cookie: confirm.cookie })).status, 200, 'the re-issued session carries the second factor');
  } finally { await app.close(); }
});

test('responses carry the security headers', async () => {
  const res = await fetch(`${t.base}/api/health`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(res.headers.get('x-powered-by'), null);
});

// ---- temporary data and revocation ----
test('after submission raw transcripts and expired working files are gone while the structured record remains', async () => {
  const p = await patient();
  const withTranscript = async () => (await q(`SELECT count(*)::int n FROM interview_responses WHERE encounter_id = $1 AND answer ? 'transcript'`, [p.enc]))[0].n;
  assert.equal(await withTranscript(), 2);
  const tmp = t.docs.store.paths.tmp;
  await mkdir(tmp, { recursive: true });
  const stale = path.join(tmp, 'stale-working-file.png'), fresh = path.join(tmp, 'fresh-working-file.png');
  await writeFile(stale, 'x'); await writeFile(fresh, 'x');
  const old = new Date(Date.now() - 60 * 60_000);
  await utimes(stale, old, old);
  await p.submit();
  assert.equal(await withTranscript(), 0, 'raw voice transcripts are removed');
  const left = await readdir(tmp);
  assert.ok(!left.includes('stale-working-file.png'), 'expired working file removed');
  assert.ok(left.includes('fresh-working-file.png'), 'a file still inside its time-to-live is left alone');
  const answers = await q(`SELECT question_key, answer FROM interview_responses WHERE encounter_id = $1 ORDER BY question_key`, [p.enc]);
  assert.deepEqual(answers.map((a) => [a.question_key, a.answer.value]), [['cc.main', 'fever'], ['emergency.screen', ['none']]], 'the structured answers remain');
  assert.equal((await q(`SELECT count(*)::int n FROM summaries WHERE encounter_id = $1`, [p.enc]))[0].n, 1);
  assert.equal((await q(`SELECT count(*)::int n FROM audit_logs WHERE action = 'temporary_data_purged' AND object_id = $1`, [p.enc]))[0].n, 1);
});

test('revoking documents or history before the doctor confirms removes that data and logs it', async () => {
  const p = await patient();
  await t.send('POST', '/api/patient/documents', png('en-lab-printed'), { cookie: p.cookie, name: 'lab.png' });
  await t.settle();
  const refs = (await q('SELECT storage_ref FROM documents WHERE encounter_id = $1', [p.enc])).map((r) => r.storage_ref);
  assert.equal(refs.length, 1);
  assert.ok((await readdir(t.docs.store.paths.files)).includes(refs[0]));
  assert.ok((await q(`SELECT count(*)::int n FROM lab_results l JOIN documents d ON d.id = l.document_id WHERE d.encounter_id = $1`, [p.enc]))[0].n > 0);

  assert.equal((await t.call('POST', '/api/patient/consent/revoke', { cookie: p.cookie, body: { purposes: ['documents'] } })).status, 200);
  assert.equal((await q('SELECT count(*)::int n FROM documents WHERE encounter_id = $1', [p.enc]))[0].n, 0);
  assert.equal((await q(`SELECT count(*)::int n FROM lab_results l LEFT JOIN documents d ON d.id = l.document_id WHERE d.id IS NULL`))[0].n, 0);
  assert.ok(!(await readdir(t.docs.store.paths.files)).includes(refs[0]), 'the stored file is deleted');
  assert.equal((await q(`SELECT payload->'events' AS e FROM analysis_results WHERE encounter_id = $1 AND kind = 'timeline'`, [p.enc]))[0].e.length ?? 0, 0, 'the analysis no longer shows the files');
  assert.equal((await q('SELECT count(*)::int n FROM interview_responses WHERE encounter_id = $1', [p.enc]))[0].n, 2, 'history untouched by revoking documents');

  assert.equal((await t.call('POST', '/api/patient/consent/revoke', { cookie: p.cookie, body: { purposes: ['history'] } })).status, 200);
  assert.equal((await q('SELECT count(*)::int n FROM interview_responses WHERE encounter_id = $1', [p.enc]))[0].n, 0);
  assert.equal((await t.call('GET', '/api/patient/interview/next', { cookie: p.cookie })).status !== 200, true, 'the session is closed');
  const log = await q(`SELECT detail FROM audit_logs WHERE action = 'data_removed_on_revocation' AND object_id = $1 ORDER BY at`, [p.enc]);
  assert.deepEqual(log.map((l) => l.detail), [{ documents: 1 }, { history: 2 }]);
});

test('a record the doctor has already confirmed is kept on revocation, and the log says so', async () => {
  const p = await patient();
  await p.submit();
  await t.call('POST', `/api/doctor/encounters/${p.enc}/consult`, { cookie: doctor });
  await t.call('POST', `/api/doctor/encounters/${p.enc}/summary/accept`, { cookie: doctor });
  assert.equal((await t.call('POST', '/api/patient/consent/revoke', { cookie: p.cookie, body: { purposes: 'all' } })).status, 200);
  assert.equal((await q('SELECT count(*)::int n FROM interview_responses WHERE encounter_id = $1', [p.enc]))[0].n, 2, 'a confirmed clinical record is not erased');
  const [log] = await q(`SELECT detail FROM audit_logs WHERE action = 'data_removed_on_revocation' AND object_id = $1`, [p.enc]);
  assert.equal(log.detail.history, 'kept_confirmed_record');
});

// ---- encryption: nothing identifying in plain text ----
test('mobile numbers and identifiers are encrypted or hashed, and appear in no table and no log', async () => {
  const abha = '98765432109876';
  const p = await patient({ mobile: '9123456780', name: 'Plaintext Check' });
  const { rows: [e] } = await t.db.pool.query('SELECT patient_id FROM encounters WHERE id = $1', [p.enc]);
  await t.call('POST', '/api/patient/abha', { cookie: p.cookie, body: { abhaId: abha } }).catch(() => {});
  await t.db.pool.query(`INSERT INTO patient_identifiers (patient_id, type, value_encrypted) VALUES ($1, 'abha', $2) ON CONFLICT DO NOTHING`, [e.patient_id, t.crypto.encrypt(abha)]);
  await p.submit();
  await t.call('POST', `/api/doctor/encounters/${p.enc}/consult`, { cookie: doctor });
  await t.call('POST', `/api/doctor/encounters/${p.enc}/summary/accept`, { cookie: doctor });
  await t.integration.settle();

  const [pat] = await q('SELECT mobile_hash FROM patients WHERE id = $1', [e.patient_id]);
  assert.match(pat.mobile_hash, /^[0-9a-f]{64}$/);
  const ids = await q('SELECT value_encrypted FROM patient_identifiers WHERE patient_id = $1', [e.patient_id]);
  assert.ok(ids.length >= 1 && ids.every((i) => i.value_encrypted.startsWith('v1:')));
  assert.equal(t.crypto.decrypt(ids.at(-1).value_encrypted).length, 14);

  const cols = await q(`SELECT c.table_name, c.column_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
                         WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND c.data_type IN ('text', 'jsonb', 'character varying', 'ARRAY')`);
  const leaks = [];
  for (const { table_name: tb, column_name: col } of cols) {
    for (const needle of ['9123456780', abha]) {
      const r = await q(`SELECT count(*)::int n FROM "${tb}" WHERE "${col}"::text LIKE $1`, [`%${needle}%`]);
      if (r[0].n) leaks.push(`${tb}.${col} holds ${needle.length === 10 ? 'the mobile number' : 'the ABHA number'}`);
    }
  }
  // the one place the ABHA number may appear is inside the encrypted blob, which does not contain it in clear
  assert.deepEqual(leaks.filter((x) => !x.startsWith('fhir_bundles.') && !x.startsWith('deliveries.')), [], 'no plain-text identifier in any table');
  const bundleLeak = leaks.filter((x) => x.startsWith('fhir_bundles.'));
  assert.deepEqual(bundleLeak, ['fhir_bundles.bundle holds the ABHA number'], 'the ABHA number appears only in the FHIR bundle that is sent with the patient\'s ABHA consent');
  assert.equal(logged.some((l) => l.includes('9123456780') || l.includes(abha)), false, 'nothing identifying in the logs');
});

// ---- row-level security for a doctor-scoped database role ----
test('as the doctor database role, a department sees only its own patients, nothing writable, and not the user table', async () => {
  const depts = (await q('SELECT id, name FROM departments ORDER BY name')).map((d) => d.id);
  const [a, b] = depts;
  const mk = async (dept) => {
    const p = await patient();
    await t.db.pool.query('UPDATE encounters SET department_id = $2 WHERE id = $1', [p.enc, dept]);
    await t.send('POST', '/api/patient/documents', png('en-lab-printed'), { cookie: p.cookie, name: 'lab.png' });
    await t.settle();
    return p.enc;
  };
  const encA = await mk(a), encB = await mk(b);
  const client = await t.db.pool.connect();
  try {
    await client.query('SET ROLE pc_doctor');
    const as = async (scope) => {
      await client.query('SELECT set_config($1, $2, false)', ['app.department_id', scope]);
      const ids = (await client.query('SELECT id FROM encounters')).rows.map((r) => r.id);
      const docs = (await client.query('SELECT encounter_id FROM documents')).rows.map((r) => r.encounter_id);
      const answers = (await client.query('SELECT DISTINCT encounter_id FROM interview_responses')).rows.map((r) => r.encounter_id);
      const patients = (await client.query('SELECT count(*)::int n FROM patients')).rows[0].n;
      return { ids, docs, answers, patients };
    };
    const inA = await as(a);
    assert.ok(inA.ids.includes(encA) && !inA.ids.includes(encB), 'encounters of the doctor\'s department only');
    assert.ok(inA.docs.includes(encA) && !inA.docs.includes(encB), 'documents follow the encounter');
    assert.ok(inA.answers.includes(encA) && !inA.answers.includes(encB), 'interview answers follow the encounter');
    const inB = await as(b);
    assert.ok(inB.ids.includes(encB) && !inB.ids.includes(encA));
    assert.ok(inB.patients < (await as('all')).patients, 'patients are filtered through their encounters');
    const all = await as('all');
    assert.ok(all.ids.includes(encA) && all.ids.includes(encB), 'a doctor without a department sees every department');
    const unset = await as('');
    assert.ok(!unset.ids.includes(encA) && !unset.ids.includes(encB), 'with no department set, only unassigned encounters are visible');
    await assert.rejects(() => client.query('SELECT password_hash FROM users'), /permission denied/);
    await assert.rejects(() => client.query('SELECT * FROM consents'), /permission denied/);
    await assert.rejects(() => client.query(`UPDATE encounters SET status = 'completed'`), /permission denied/);
    await assert.rejects(() => client.query('DELETE FROM documents'), /permission denied/);
    await assert.rejects(() => client.query(`INSERT INTO audit_logs (action) VALUES ('x')`), /permission denied/);
    await assert.rejects(() => client.query('SELECT * FROM patient_identifiers'), /permission denied/, 'encrypted identifiers are not readable either');
  } finally {
    await client.query('RESET ROLE').catch(() => {});
    client.release();
  }
});

test('the staff and doctor routes also keep a doctor inside their own department', async () => {
  // a second doctor in another department
  const bcrypt = (await import('bcryptjs')).default;
  const [d1, d2] = (await q('SELECT id FROM departments ORDER BY name LIMIT 2')).map((d) => d.id);
  await t.db.pool.query(`INSERT INTO users (role, full_name, username, password_hash, department_id) VALUES ('doctor', 'Other Dept Doctor', 'doctor.other', $1, $2)`, [bcrypt.hashSync('other-doctor-pw', 4), d2]);
  await t.db.pool.query(`UPDATE users SET department_id = $1 WHERE username = 'doctor.test'`, [d1]);
  const other = (await t.call('POST', '/api/auth/login', { body: { username: 'doctor.other', password: 'other-doctor-pw' } })).cookie;
  const mine = (await t.call('POST', '/api/auth/login', { body: { username: 'doctor.test', password: 'doctor-test-pw' } })).cookie;
  const p = await patient();
  await t.db.pool.query('UPDATE encounters SET department_id = $2 WHERE id = $1', [p.enc, d1]);
  await p.submit();
  const paths = [`/analysis`, `/summary`];
  for (const path of paths) {
    assert.equal((await t.call('GET', `/api/doctor/encounters/${p.enc}${path}`, { cookie: mine })).status, 200, `own department ${path}`);
    assert.equal((await t.call('GET', `/api/doctor/encounters/${p.enc}${path}`, { cookie: other })).status, 404, `other department ${path}`);
  }
  assert.equal((await t.call('POST', `/api/doctor/encounters/${p.enc}/consult`, { cookie: other })).status, 404);
  assert.equal((await t.call('POST', `/api/doctor/encounters/${p.enc}/summary/accept`, { cookie: other })).status, 404);
  assert.equal((await t.call('POST', `/api/doctor/encounters/${p.enc}/analysis/rerun`, { cookie: other })).status, 404);
  assert.equal((await t.call('GET', `/api/doctor/encounters/${p.enc}/documents/00000000-0000-4000-8000-000000000000/file`, { cookie: other })).status, 404);
  assert.ok(!(await t.call('GET', '/api/doctor/encounters', { cookie: other })).body.items.some((i) => i.id === p.enc), 'not in the other queue');
  assert.ok((await t.call('GET', '/api/doctor/encounters', { cookie: mine })).body.items.some((i) => i.id === p.enc));
  await t.db.pool.query(`UPDATE users SET department_id = NULL WHERE username = 'doctor.test'`);
});
