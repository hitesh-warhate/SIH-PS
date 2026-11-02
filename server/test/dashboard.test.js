import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { startTestApp } from './helpers.js';

const ALL = { history: true, documents: true, his_sharing: true, abha_linking: true };
const CONFIRM = { visual: true, audio: true };
let t, doctor, staff, admin, n = 0;
const D = (cookie, path = '') => t.call('GET', `/api/dashboard${path}`, { cookie });

before(async () => {
  t = await startTestApp();
  [doctor, staff, admin] = [await t.login('doctor'), await t.login('staff'), await t.login('admin')];
  const patient = async (name, complaint, { emergency = false, decide = false } = {}) => {
    const reg = await t.registerPatient({ fullName: name, mobile: `88${String(100000 + n++).padStart(8, '0')}`, age: 40 });
    const consent = await t.call('POST', '/api/patient/consent', { cookie: reg.cookie, body: { purposes: ALL } });
    const a = (k, v) => t.call('POST', '/api/patient/interview/answer', { cookie: reg.cookie, body: { questionKey: k, value: v, modality: 'tap', confirmation: CONFIRM } });
    await a('cc.reason', 'test visit'); await a('emergency.screen', emergency ? ['e_chest'] : ['none']); await a('cc.main', complaint); await a('cc.duration', 'd1_3');
    await t.call('POST', '/api/patient/submit', { cookie: reg.cookie });
    if (decide) { await t.call('POST', `/api/doctor/encounters/${consent.body.encounterId}/consult`, { cookie: doctor }); await t.call('POST', `/api/doctor/encounters/${consent.body.encounterId}/summary/accept`, { cookie: doctor }); }
    return consent.body.encounterId;
  };
  await patient('Dash Fever One', 'fever', { decide: true });
  await patient('Dash Fever Two', 'fever');
  await patient('Dash Cough', 'cough');
  await patient('Dash Chest', 'chest_pain', { emergency: true });
});
after(async () => { await t.close(); });

test('the clinical dashboard counts what the system recorded, for seven days with today last', async () => {
  const r = (await D(doctor)).body;
  assert.equal(r.role, 'doctor');
  assert.equal(r.dates.length, 7);
  assert.deepEqual(r.tiles.map((x) => x.key), ['newPatients', 'submitted', 'alerts', 'confirmed']);
  for (const x of r.tiles) assert.equal(x.series.length, 7);
  const by = Object.fromEntries(r.tiles.map((x) => [x.key, x]));
  assert.equal(by.newPatients.value, 4);
  assert.equal(by.submitted.value, 4);
  assert.ok(by.alerts.value >= 1, 'the chest pain raised an alert');
  assert.equal(by.confirmed.value, 1);
  assert.deepEqual(by.newPatients.series.slice(0, 6), [0, 0, 0, 0, 0, 0], 'earlier days are empty');
  assert.equal(by.newPatients.total, 4);
});

test('the complaint mix is the real distribution and adds up', async () => {
  const d = (await D(staff, '?range=7')).body.distribution;
  assert.equal(d.range, 7);
  assert.equal(d.total, 4);
  assert.deepEqual(d.items.map((x) => [x.key, x.count]), [['fever', 2], ['chest_pain', 1], ['cough', 1]]);
  assert.equal(d.items[0].percent, 50);
  assert.ok(d.items.every((x) => x.label.length === 3), 'labels in three languages');
  assert.equal((await D(staff, '?range=30')).body.distribution.range, 30);
  assert.equal((await D(staff, '?range=99')).body.distribution.range, 7, 'only 7 or 30 days');
});

test('the week grid lists the last six days\' patients by arrival time, and insights say what is true', async () => {
  const r = (await D(doctor)).body;
  assert.equal(r.schedule.days.length, 6);
  assert.equal(r.schedule.days.at(-1), r.schedule.today, 'the window is the last six days and ends today');
  const todays = r.schedule.items.filter((i) => i.date === r.schedule.today);
  assert.equal(todays.length, 4);
  assert.ok(todays.every((i) => i.hour >= 0 && i.hour < 24 && i.name.startsWith('Dash')));
  const keys = r.insights.map((i) => i.key);
  assert.ok(keys.includes('today') && keys.includes('topComplaint'));
  const today = r.insights.find((i) => i.key === 'today');
  assert.deepEqual(today.params, { n: 4, alerts: 1 });
  assert.equal(r.insights.find((i) => i.key === 'topComplaint').params.label[0], 'Fever');
  assert.equal(r.recent.length, 4);
  assert.ok(r.recent.every((c) => c.status && c.name));
  assert.ok(r.recent[0].name === 'Dash Chest', 'newest first');
});

test('a doctor sees only their department; staff see everyone', async () => {
  const [d1, d2] = (await t.db.pool.query('SELECT id FROM departments ORDER BY name LIMIT 2')).rows.map((x) => x.id);
  await t.db.pool.query(`INSERT INTO users (role, full_name, username, password_hash, department_id) VALUES ('doctor', 'Other Doc', 'doc.other', $1, $2)`, [bcrypt.hashSync('other-doc-pw-1', 4), d2]);
  await t.db.pool.query(`UPDATE encounters SET department_id = $1 WHERE id IN (SELECT id FROM encounters ORDER BY started_at LIMIT 2)`, [d1]);
  await t.db.pool.query(`UPDATE encounters SET department_id = $1 WHERE department_id IS NULL`, [d2]);
  await t.db.pool.query(`UPDATE users SET department_id = $1 WHERE username = 'doctor.test'`, [d1]);
  const other = (await t.call('POST', '/api/auth/login', { body: { username: 'doc.other', password: 'other-doc-pw-1' } })).cookie;
  const mine = (await t.call('POST', '/api/auth/login', { body: { username: 'doctor.test', password: 'doctor-test-pw' } })).cookie;
  assert.equal((await D(mine)).body.tiles[0].value, 2);
  assert.equal((await D(other)).body.tiles[0].value, 2);
  assert.equal((await D(staff)).body.tiles[0].value, 4);
  const names = (r) => r.body.results.map((x) => x.title);
  const a = names(await D(mine, '/search?q=Dash')), b = names(await D(other, '/search?q=Dash'));
  assert.equal(a.length, 2);
  assert.ok(a.every((x) => !b.includes(x)), 'no overlap between the departments');
});

test('the admin dashboard has counts, audit events and health, and no patient name', async () => {
  await t.monitor.check();
  const r = (await D(admin)).body;
  assert.equal(r.role, 'admin');
  assert.deepEqual(r.tiles.map((x) => x.key), ['registrations', 'signIns', 'auditEvents', 'deliveriesFailed']);
  assert.equal(r.tiles[0].value, 4);
  assert.ok(r.tiles[1].value >= 3, 'sign-ins counted from the audit log');
  assert.equal(r.schedule, null);
  assert.ok(r.recent.every((x) => x.action && x.at));
  assert.ok(r.distribution.items.length > 0 && r.distribution.items.every((x) => typeof x.count === 'number'));
  assert.equal(/Dash (Fever|Cough|Chest)/.test(JSON.stringify(r)), false, 'no patient name in the admin dashboard');
  assert.ok(r.health.some((h) => h.key === 'database'));
  const users = (await D(admin, '/search?q=doctor')).body.results;
  assert.ok(users.every((u) => u.kind === 'user'));
});

test('the dashboard is for staff, doctors and admins only', async () => {
  assert.equal((await D(undefined)).status, 401);
  const patient = (await t.registerPatient({ fullName: 'Not Staff', mobile: '8700000001', age: 30 })).cookie;
  assert.equal((await D(patient)).status, 403);
  assert.equal((await D(patient, '/search?q=a')).status, 403);
  assert.deepEqual((await D(staff, '/search?q=')).body.results, []);
  const hostile = await D(staff, `/search?q=${encodeURIComponent("'; DROP TABLE users;--%_")}`);
  assert.equal(hostile.status, 200);
});
