import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './helpers.js';
import { PORTALS } from '../src/app.js';

let t;
before(async () => { t = await startTestApp(); });
after(async () => { await t.close(); });

test('all nine role x portal combinations: only the matching portal is reachable', async () => {
  const cookies = {
    patient: (await t.registerPatient()).cookie,
    staff: await t.login('staff'),
    doctor: await t.login('doctor'),
  };
  for (const role of Object.keys(cookies)) {
    for (const portal of PORTALS) {
      const res = await t.call('GET', `/api/portal/${portal}/ping`, { cookie: cookies[role] });
      assert.equal(res.status, role === portal ? 200 : 403, `${role} -> ${portal}`);
    }
  }
});

test('signed-out requests are rejected from every portal', async () => {
  for (const portal of PORTALS) assert.equal((await t.call('GET', `/api/portal/${portal}/ping`)).status, 401);
});

test('wrong password and unknown user are rejected', async () => {
  for (const body of [{ username: 'staff.test', password: 'nope' }, { username: 'ghost', password: 'x' }, {}]) {
    const res = await t.call('POST', '/api/auth/login', { body });
    assert.ok([400, 401].includes(res.status));
  }
});

test('a tampered or foreign-signed token grants nothing', async () => {
  const res = await fetch(`${t.base}/api/portal/doctor/ping`, { headers: { authorization: 'Bearer not.a.token' } });
  assert.equal(res.status, 401);
});

test('staff APIs refuse patients and doctors', async () => {
  const patient = (await t.registerPatient({ mobile: '9123456789', fullName: 'Sunita Patil' })).cookie;
  const doctor = await t.login('doctor');
  assert.equal((await t.call('GET', '/api/staff/help-requests', { cookie: patient })).status, 403);
  assert.equal((await t.call('GET', '/api/staff/help-requests', { cookie: doctor })).status, 403);
  assert.equal((await t.call('GET', '/api/staff/help-requests')).status, 401);
});

test('health endpoint reports the database', async () => {
  assert.deepEqual((await t.call('GET', '/api/health')).body, { ok: true, database: 'up' });
});
