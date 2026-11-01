import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startTestApp } from './helpers.js';
import { codeAt } from '../src/totp.js';
import { createWebhookNotifier } from '../src/ops/monitor.js';

let t, admin, sent;
const q = (sql, params) => t.db.pool.query(sql, params).then((r) => r.rows);
const A = (method, path, body, cookie = admin) => t.call(method, `/api/admin${path}`, { cookie, body });
before(async () => {
  sent = [];
  t = await startTestApp({ notifier: { name: 'test', async send(e) { sent.push(e); } } });
  admin = await t.login('admin');
});
after(async () => { await t.close(); });

// ---- accounts and departments (FR-P6) ----
test('an admin creates a department and accounts, and a new account reaches only its own portal', async () => {
  const dept = await A('POST', '/departments', { name: 'AYUSH Panchakarma', ayush: true });
  assert.equal(dept.status, 201);
  assert.equal(dept.body.department.ayush, true);
  assert.equal((await A('POST', '/departments', { name: 'AYUSH Panchakarma' })).status, 409, 'names are unique');
  assert.equal((await A('POST', '/departments', { name: 'x' })).status, 400);
  const changed = await A('PUT', `/departments/${dept.body.department.id}`, { ayush: false });
  assert.equal(changed.body.department.ayush, false, 'the AYUSH setting can be changed');
  await A('PUT', `/departments/${dept.body.department.id}`, { ayush: true });

  const made = await A('POST', '/users', { role: 'doctor', fullName: 'Dr New Doctor', username: 'dr.new', departmentId: dept.body.department.id });
  assert.equal(made.status, 201);
  assert.equal(made.body.user.department, 'AYUSH Panchakarma');
  assert.equal(typeof made.body.temporaryPassword, 'string');
  assert.ok(made.body.temporaryPassword.length >= 12);
  assert.equal(JSON.stringify(made.body).includes('password_hash'), false);
  const [row] = await q(`SELECT password_hash FROM users WHERE username = 'dr.new'`);
  assert.ok(row.password_hash.startsWith('$2'), 'stored only as a hash');
  assert.equal(row.password_hash.includes(made.body.temporaryPassword), false);

  const staff = await A('POST', '/users', { role: 'staff', fullName: 'Nurse New', username: 'nurse.new', password: 'a-chosen-password-1' });
  assert.equal(staff.status, 201);
  assert.equal(staff.body.temporaryPassword, undefined, 'a chosen password is not echoed');

  const login = (u, p) => t.call('POST', '/api/auth/login', { body: { username: u, password: p } });
  const doc = await login('dr.new', made.body.temporaryPassword);
  assert.equal(doc.body.portal, 'doctor');
  const nurse = await login('nurse.new', 'a-chosen-password-1');
  assert.equal(nurse.body.portal, 'staff');
  // each reaches only its own portal
  assert.equal((await t.call('GET', '/api/doctor/encounters', { cookie: doc.cookie })).status, 200);
  assert.equal((await t.call('GET', '/api/staff/queue', { cookie: doc.cookie })).status, 403);
  assert.equal((await t.call('GET', '/api/admin/users', { cookie: doc.cookie })).status, 403);
  assert.equal((await t.call('GET', '/api/staff/queue', { cookie: nurse.cookie })).status, 200);
  assert.equal((await t.call('GET', '/api/doctor/encounters', { cookie: nurse.cookie })).status, 403);
  assert.equal((await t.call('GET', '/api/admin/audit', { cookie: nurse.cookie })).status, 403);
  // the new doctor is in the new department
  assert.equal((await q(`SELECT department_id FROM users WHERE username = 'dr.new'`))[0].department_id, dept.body.department.id);

  const list = (await A('GET', '/users')).body.users;
  assert.ok(list.some((u) => u.username === 'dr.new') && list.every((u) => !('passwordHash' in u) && !('mfaSecret' in u)));
});

test('invalid or duplicate accounts are refused', async () => {
  for (const bad of [{ role: 'patient' }, { role: 'staff', fullName: 'x', username: 'ab' }, { role: 'staff', fullName: 'Okay Name', username: 'UPPER CASE' },
    { role: 'staff', fullName: 'Okay Name', username: 'okay.name', password: 'short' }, { role: 'staff', fullName: 'Okay Name', username: 'okay.name', departmentId: 'nope' }]) {
    assert.equal((await A('POST', '/users', bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await A('POST', '/users', { role: 'staff', fullName: 'Okay Name', username: 'okay.name', departmentId: '00000000-0000-4000-8000-000000000000' })).status, 404);
  assert.equal((await A('POST', '/users', { role: 'staff', fullName: 'Dup', username: 'staff.test' })).status, 409);
});

test('only an admin can use the console', async () => {
  const staff = await t.login('staff'), doctor = await t.login('doctor');
  for (const [m, p] of [['GET', '/users'], ['POST', '/users'], ['GET', '/departments'], ['POST', '/departments'], ['GET', '/audit'], ['GET', '/metrics'], ['GET', '/ops']]) {
    assert.equal((await A(m, p, undefined, null)).status, 401, `${p} anonymous`);
    for (const cookie of [staff, doctor]) assert.equal((await A(m, p, undefined, cookie)).status, 403, `${p} wrong role`);
  }
  const patient = (await t.registerPatient({ fullName: 'Not Admin', mobile: '9111111111', age: 30 })).cookie;
  assert.equal((await A('GET', '/users', undefined, patient)).status, 403);
  assert.equal((await t.call('GET', '/api/ops/health', { cookie: staff })).status, 403);
});

test('disabling an account, resetting a password or second factor, and logging out each end that account\'s sessions at once', async () => {
  const mk = async (name) => {
    const r = await A('POST', '/users', { role: 'staff', fullName: `Session ${name}`, username: `sess.${name}`, password: 'session-test-password' });
    const login = await t.call('POST', '/api/auth/login', { body: { username: `sess.${name}`, password: 'session-test-password' } });
    return { id: r.body.user.id, cookie: login.cookie };
  };
  const works = (cookie) => t.call('GET', '/api/staff/queue', { cookie }).then((r) => r.status === 200);

  const a = await mk('a');
  assert.equal(await works(a.cookie), true);
  assert.equal((await A('POST', `/users/${a.id}/disable`)).body.user.disabledAt !== null, true);
  assert.equal(await works(a.cookie), false, 'a disabled account stops working at once');
  assert.equal((await t.call('POST', '/api/auth/login', { body: { username: 'sess.a', password: 'session-test-password' } })).status, 401, 'and cannot sign in');
  assert.equal((await A('POST', `/users/${a.id}/enable`)).status, 200);
  assert.equal(await works(a.cookie), false, 'the old session stays ended after re-enabling');
  assert.equal((await t.call('POST', '/api/auth/login', { body: { username: 'sess.a', password: 'session-test-password' } })).status, 200);

  const b = await mk('b');
  const reset = await A('POST', `/users/${b.id}/reset-password`);
  assert.equal(reset.status, 200);
  assert.equal(await works(b.cookie), false);
  assert.equal((await t.call('POST', '/api/auth/login', { body: { username: 'sess.b', password: 'session-test-password' } })).status, 401, 'the old password no longer works');
  assert.equal((await t.call('POST', '/api/auth/login', { body: { username: 'sess.b', password: reset.body.temporaryPassword } })).status, 200);

  const c = await mk('c');
  const enrol = await t.call('POST', '/api/auth/mfa/enrol', { cookie: c.cookie });
  const confirmed = await t.call('POST', '/api/auth/mfa/confirm', { cookie: c.cookie, body: { code: codeAt(enrol.body.secret) } });
  assert.equal(await works(confirmed.cookie), true);
  assert.equal((await A('POST', `/users/${c.id}/reset-mfa`)).body.user.mfaEnabled, false);
  assert.equal(await works(confirmed.cookie), false);
  assert.equal((await t.call('POST', '/api/auth/login', { body: { username: 'sess.c', password: 'session-test-password' } })).body.mfaEnabled, false, 'second factor must be enrolled again');

  // logging out revokes a copied token (closes defect D-05)
  const d = await mk('d');
  const copied = d.cookie;
  assert.equal(await works(copied), true);
  await t.call('POST', '/api/auth/logout', { cookie: d.cookie });
  assert.equal(await works(copied), false, 'a token copied before logout no longer works');

  // an admin cannot lock themselves out, and ids are checked
  const me = (await q(`SELECT id FROM users WHERE username = 'admin.test'`))[0].id;
  assert.equal((await A('POST', `/users/${me}/disable`)).status, 409);
  assert.equal((await A('POST', '/users/not-an-id/disable')).status, 400);
  assert.equal((await A('POST', '/users/00000000-0000-4000-8000-000000000000/disable')).status, 404);
  assert.equal(await works(admin).then(() => true), true);
});

test('a user changes their own password: the old one stops working and other sessions end', async () => {
  await A('POST', '/users', { role: 'doctor', fullName: 'Pw Changer', username: 'pw.changer', password: 'first-password-12' });
  const one = await t.call('POST', '/api/auth/login', { body: { username: 'pw.changer', password: 'first-password-12' } });
  const two = await t.call('POST', '/api/auth/login', { body: { username: 'pw.changer', password: 'first-password-12' } });
  assert.equal((await t.call('POST', '/api/auth/password', { cookie: one.cookie, body: { current: 'wrong', next: 'second-password-34' } })).status, 401);
  assert.equal((await t.call('POST', '/api/auth/password', { cookie: one.cookie, body: { current: 'first-password-12', next: 'short' } })).status, 400);
  const changed = await t.call('POST', '/api/auth/password', { cookie: one.cookie, body: { current: 'first-password-12', next: 'second-password-34' } });
  assert.equal(changed.status, 200);
  assert.equal((await t.call('GET', '/api/doctor/encounters', { cookie: two.cookie })).status, 401, 'the other session ended');
  assert.equal((await t.call('GET', '/api/doctor/encounters', { cookie: changed.cookie })).status, 200, 'this session continues');
  assert.equal((await t.call('POST', '/api/auth/login', { body: { username: 'pw.changer', password: 'first-password-12' } })).status, 401);
  assert.equal((await t.call('POST', '/api/auth/login', { body: { username: 'pw.changer', password: 'second-password-34' } })).status, 200);
});

// ---- the audit log view ----
test('the admin reads the audit log with filters and paging, and reading it is itself logged', async () => {
  await t.login('doctor');
  const all = (await A('GET', '/audit?limit=5')).body;
  assert.equal(all.entries.length, 5);
  assert.ok(all.next, 'there is a next page');
  assert.ok(all.entries.every((e, i, a) => i === 0 || new Date(a[i - 1].at) >= new Date(e.at)), 'newest first');
  const page2 = (await A('GET', `/audit?limit=5&before=${encodeURIComponent(all.next)}`)).body;
  assert.ok(page2.entries.every((e) => new Date(e.at) < new Date(all.next)));
  const logins = (await A('GET', '/audit?action=login_success&limit=200')).body.entries;
  assert.ok(logins.length >= 2 && logins.every((e) => e.action === 'login_success'));
  const created = (await A('GET', '/audit?action=user_created&limit=200')).body.entries;
  assert.ok(created.some((e) => e.detail.username === 'dr.new'));
  assert.ok((await A('GET', '/audit/actions')).body.actions.includes('user_created'));
  assert.equal((await A('GET', `/audit?object=${created[0].objectId}`)).body.entries.length >= 1, true);
  assert.equal((await A('GET', '/audit?limit=100000')).body.entries.length <= 200, true, 'a page is capped');
  assert.equal((await A('GET', '/audit?action=%27%3B%20DROP%20TABLE%20users%3B--')).body.entries.length, 0, 'hostile filter text is just text');
  assert.ok((await q(`SELECT count(*)::int n FROM audit_logs WHERE action = 'audit_viewed'`))[0].n >= 1);
  // the log cannot be changed through the console either: there is no such route
  assert.equal((await A('DELETE', '/audit')).status, 404);
});

test('reports are available to the admin, from the reporting database', async () => {
  const m = (await A('GET', '/metrics?days=30')).body;
  assert.ok('independentCompletion' in m && 'consentIntegrity' in m && m.notMeasurableHere.length === 3);
  assert.equal(m.window.since.length, 10);
});

// ---- monitoring and the failure drill ----
test('health covers the database, replica, reading engine, job queue, integrations and speech', async () => {
  const res = await t.call('GET', '/api/ops/health', { cookie: admin });
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body.components).sort(), ['database', 'integrations', 'jobQueue', 'ocr', 'replica', 'speech']);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.components.replica.detail.configured, false);
  assert.equal(res.body.components.speech.detail.note.includes('browser'), true, 'says speech is an indirect signal');
  assert.equal((await t.call('GET', '/api/ops/health')).status, 401);
  const prom = await fetch(`${t.base}/api/ops/metrics`, { headers: { cookie: admin } });
  assert.match(await prom.text(), /patientcase_component_status\{component="database"\} 0/);
});

test('a deliberately failed component raises one alert to the on-call notifier, and its recovery another', async () => {
  const mon = t.monitor;
  await mon.check();
  sent.length = 0;
  const realOcr = mon.checks.ocr;
  // failure drill 1: the reading engine stops working
  mon.checks.ocr = async () => ({ status: 'down', detail: { ok: false, error: 'engine failed to start' } });
  await mon.check();
  await mon.check(); // a second run while it is still down sends nothing more
  assert.deepEqual(sent.map((e) => [e.component, e.status, e.previous]), [['ocr', 'down', 'ok']]);
  assert.equal(t.monitor.snapshot().status, 'down');
  assert.equal((await t.call('GET', '/api/ops/health', { cookie: admin })).status, 503, 'the health endpoint says so');
  mon.checks.ocr = realOcr;
  await mon.check();
  assert.deepEqual(sent.map((e) => [e.component, e.status]), [['ocr', 'down'], ['ocr', 'ok']]);
  assert.ok((await q(`SELECT count(*)::int n FROM ops_events WHERE component = 'ocr'`))[0].n >= 2, 'both changes are in the history');
  assert.ok((await A('GET', '/ops')).body.events.some((e) => e.component === 'ocr' && e.status === 'down'));
  sent.length = 0;

  // failure drill 2: a hospital-system push has failed, and a document has waited too long
  const reg = await t.registerPatient({ fullName: 'Drill Patient', mobile: '9222222222', age: 33 });
  const consent = await t.call('POST', '/api/patient/consent', { cookie: reg.cookie, body: { purposes: { history: true, documents: true, his_sharing: true, abha_linking: true } } });
  const { rows: [d] } = await t.db.pool.query(
    `INSERT INTO documents (encounter_id, storage_ref, status, original_name, mime, uploaded_at) VALUES ($1, 'x.enc', 'waiting', 'stuck.png', 'image/png', now() - interval '20 minutes') RETURNING id`, [consent.body.encounterId]);
  await mon.check();
  const queue = sent.find((e) => e.component === 'jobQueue');
  assert.equal(queue.status, 'down');
  assert.ok(queue.detail.oldestWaitingSeconds >= 1200);
  await t.db.pool.query('DELETE FROM documents WHERE id = $1', [d.id]);
  await mon.check();
  assert.equal(sent.at(-1).component, 'jobQueue');
  assert.equal(sent.at(-1).status, 'ok');

  // failure drill 3: the database stops answering
  const real = mon.checks.database;
  mon.checks.database = async () => ({ status: 'down', detail: { error: 'connection refused' } });
  sent.length = 0;
  await mon.check();
  assert.equal(sent[0].component, 'database');
  assert.equal(sent[0].status, 'down');
  mon.checks.database = real;
  await mon.check();
});

test('the webhook notifier posts the alert to the configured address, and a dead address does not stop the monitor', async () => {
  const got = [];
  const server = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { got.push(JSON.parse(b)); res.end('ok'); }); }).listen(0);
  try {
    const n = createWebhookNotifier({ url: `http://127.0.0.1:${server.address().port}/hook`, log: { error() {} } });
    await n.send({ component: 'database', status: 'down', detail: {} });
    assert.equal(got[0].component, 'database');
    const dead = createWebhookNotifier({ url: 'http://127.0.0.1:1/none', log: { error() {} }, timeoutMs: 500 });
    await dead.send({ component: 'x', status: 'down' }); // resolves, does not throw
    assert.equal(createWebhookNotifier({ log: { error() {} } }).name, 'log', 'with no address it logs instead');
  } finally { server.close(); }
});

test('a check that never finishes is reported as down instead of hiding the others', async () => {
  const { createMonitor } = await import('../src/ops/monitor.js');
  const events = [];
  const monitor = createMonitor({
    pool: t.db.pool, notifier: { async send(e) { events.push(e); } }, checkTimeoutMs: 80,
    docs: { reader: { health: () => new Promise(() => {}) }, pipeline: { queue: { size: 0 } } },
  });
  const t0 = Date.now();
  await monitor.check();
  assert.ok(Date.now() - t0 < 2000, 'the run finished although one check hangs');
  const snap = monitor.snapshot();
  assert.equal(snap.components.ocr.status, 'down');
  assert.match(snap.components.ocr.detail.error, /did not finish/);
  assert.equal(snap.components.database.status, 'ok', 'the other checks were not held up');
  assert.deepEqual(events.map((e) => e.component), ['ocr']);
});
