import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './helpers.js';

let t, staff, doctor, n = 0;
const ALL = { history: true, documents: true, his_sharing: true, abha_linking: true };
const CONFIRM = { visual: true, audio: true };
const q = (sql, params) => t.db.pool.query(sql, params).then((r) => r.rows);

before(async () => {
  t = await startTestApp();
  staff = await t.login('staff');
  doctor = await t.login('doctor');
});
after(async () => { await t.close(); });

async function patient() {
  const reg = await t.registerPatient({ fullName: `Alert Tester ${++n}`, mobile: `96000${String(10000 + n)}`, age: 50 });
  const consent = await t.call('POST', '/api/patient/consent', { cookie: reg.cookie, body: { purposes: ALL } });
  const answer = (questionKey, value, extra = {}) => t.call('POST', '/api/patient/interview/answer', {
    cookie: reg.cookie, body: { questionKey, value, modality: 'tap', confirmation: CONFIRM, ...extra },
  });
  return { cookie: reg.cookie, enc: consent.body.encounterId, answer };
}

// Opens a server-sent-events stream and collects what arrives.
async function openStream(path, cookie) {
  const ctrl = new AbortController();
  const res = await fetch(`${t.base}${path}`, { headers: { cookie }, signal: ctrl.signal });
  const events = [];
  const waiters = [];
  if (res.status !== 200) { ctrl.abort(); return { status: res.status, events, close() {} }; }
  (async () => {
    const dec = new TextDecoder();
    let buf = '';
    try {
      for await (const chunk of res.body) {
        buf += dec.decode(chunk, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (ev && data) {
            const e = { event: ev, data: JSON.parse(data), at: performance.now() };
            events.push(e);
            waiters.slice().forEach((w) => w(e));
          }
        }
      }
    } catch { /* closed */ }
  })();
  const waitFor = (pred, ms = 5000) => new Promise((resolve, reject) => {
    const hit = events.find(pred);
    if (hit) return resolve(hit);
    const timer = setTimeout(() => reject(new Error('timed out waiting for stream event')), ms);
    const w = (e) => { if (pred(e)) { clearTimeout(timer); waiters.splice(waiters.indexOf(w), 1); resolve(e); } };
    waiters.push(w);
  });
  return { status: 200, events, waitFor, close: () => ctrl.abort() };
}

const raiseChestAlert = async (p) => {
  await p.answer('cc.reason', 'test visit'); await p.answer('emergency.screen', ['none']);
  await p.answer('cc.main', 'chest_pain');
  await p.answer('cc.duration', 'lt1d');
  await p.answer('hpi.progress', 'worse');
  await p.answer('pain.site', 'centre');
  await p.answer('pain.onset', 'sudden');
  await p.answer('pain.character', 'pressure');
  await p.answer('pain.radiation', 'no');
  return p.answer('pain.associated', ['breathlessness']);
};

test('an emergency answer raises an alert that stores the rule id, rule version, level and the triggering answers', async () => {
  const p = await patient();
  const r = await raiseChestAlert(p);
  assert.equal(r.status, 200);
  const [a] = await q('SELECT * FROM alerts WHERE encounter_id = $1', [p.enc]);
  assert.deepEqual([a.rule_id, a.rule_version, a.level], ['RF-CHEST-BREATHLESS', 1, 'emergency']);
  assert.equal(a.evidence.rulesetVersion, 1);
  assert.equal(a.evidence.reason.length, 3);
  const keys = a.evidence.triggers.map((x) => x.key).sort();
  assert.deepEqual(keys, ['cc.main', 'pain.associated']);
  assert.deepEqual(a.evidence.triggers.find((x) => x.key === 'pain.associated').answer, ['Breathlessness', 'साँस फूलना', 'दम लागणे']);
  assert.equal((await q('SELECT status FROM encounters WHERE id = $1', [p.enc]))[0].status, 'alert');
  const log = await q(`SELECT detail FROM audit_logs WHERE action = 'alert_raised' AND detail->>'encounterId' = $1`, [p.enc]);
  assert.equal(log.length, 1);
  assert.equal(log[0].detail.ruleId, 'RF-CHEST-BREATHLESS');
});

test('the patient sees only that staff know: no level, no rule, no clinical wording', async () => {
  const p = await patient();
  const r = await raiseChestAlert(p);
  assert.equal(r.body.staffNotified, true);
  const state = (await t.call('GET', '/api/patient/interview/state', { cookie: p.cookie })).body;
  assert.equal(state.staffNotified, true);
  for (const body of [r.body, state]) {
    const text = JSON.stringify(body);
    assert.doesNotMatch(text, /RF-|emergency|attention|level|chest|breath|severity|alert/i, text);
  }
  // an ordinary patient is not told anything
  const calm = await patient();
  assert.equal((await calm.answer('cc.main', 'fever')).body.staffNotified, undefined);
  assert.equal((await t.call('GET', '/api/patient/interview/state', { cookie: calm.cookie })).body.staffNotified, false);
});

test('the same rule firing again in one encounter does not create a second alert', async () => {
  const p = await patient();
  await raiseChestAlert(p);
  await p.answer('pain.associated', ['breathlessness', 'sweating']); // the same rule again, and a new rule
  await p.answer('pain.associated', ['breathlessness']);
  await p.answer('cc.main', 'chest_pain');
  const rows = await q('SELECT rule_id FROM alerts WHERE encounter_id = $1 ORDER BY rule_id', [p.enc]);
  assert.deepEqual(rows.map((r) => r.rule_id), ['RF-CHEST-BREATHLESS', 'RF-CHEST-SWEATING']);
});

test('staff acknowledge an alert: who and when are recorded, the doctor sees it, and the encounter returns to In intake', async () => {
  const p = await patient();
  await raiseChestAlert(p);
  const [{ id }] = await q('SELECT id FROM alerts WHERE encounter_id = $1', [p.enc]);
  assert.equal((await t.call('POST', `/api/staff/alerts/${id}/ack`, { cookie: doctor })).status, 403); // only staff acknowledge
  const ack = await t.call('POST', `/api/staff/alerts/${id}/ack`, { cookie: staff });
  assert.equal(ack.status, 200);
  assert.equal(ack.body.alert.acknowledgedBy, 'Test Staff');
  const [a] = await q('SELECT acknowledged_by, acknowledged_at FROM alerts WHERE id = $1', [id]);
  assert.ok(a.acknowledged_by && a.acknowledged_at);
  assert.equal((await q('SELECT status FROM encounters WHERE id = $1', [p.enc]))[0].status, 'in_intake');
  const banner = (await t.call('GET', '/api/doctor/alerts', { cookie: doctor })).body.alerts.find((x) => x.id === id);
  assert.equal(banner.acknowledgedBy, 'Test Staff');
  assert.ok(banner.acknowledgedAt);
  assert.equal((await t.call('POST', `/api/staff/alerts/${id}/ack`, { cookie: staff })).status, 404); // already acknowledged
  assert.ok((await q(`SELECT 1 FROM audit_logs WHERE action = 'alert_acknowledged' AND object_id = $1`, [id])).length === 1);
});

test('the encounter stays in Alert until every open alert is acknowledged', async () => {
  const p = await patient();
  await raiseChestAlert(p);
  await p.answer('pain.associated', ['breathlessness', 'sweating']);
  const ids = (await q('SELECT id FROM alerts WHERE encounter_id = $1 ORDER BY rule_id', [p.enc])).map((r) => r.id);
  assert.equal(ids.length, 2);
  await t.call('POST', `/api/staff/alerts/${ids[0]}/ack`, { cookie: staff });
  assert.equal((await q('SELECT status FROM encounters WHERE id = $1', [p.enc]))[0].status, 'alert');
  await t.call('POST', `/api/staff/alerts/${ids[1]}/ack`, { cookie: staff });
  assert.equal((await q('SELECT status FROM encounters WHERE id = $1', [p.enc]))[0].status, 'in_intake');
});

test('the staff queue orders alerts first, then token order, and help requests appear beside them', async () => {
  const first = await patient();   // routine, earliest token
  const second = await patient();  // routine
  const third = await patient();   // attention-level
  const fourth = await patient();  // emergency, latest token
  // attention rule (severe pain) needs the stomach-pain branch to reach the severity question
  for (const [k, v] of [['cc.reason', 'test visit'], ['emergency.screen', ['none']], ['cc.main', 'abdominal_pain'], ['cc.duration', 'd1_3'], ['pain.severity', 10]]) {
    await third.answer(k, v);
  }
  await t.call('POST', '/api/patient/help', { cookie: second.cookie, body: { screen: 'interview' } });
  await fourth.answer('cc.reason', 'test visit'); await fourth.answer('emergency.screen', ['e_stroke']);
  await first.answer('cc.reason', 'test visit'); await first.answer('emergency.screen', ['none']); await first.answer('cc.main', 'cough');
  const { queue } = (await t.call('GET', '/api/staff/queue', { cookie: staff })).body;
  const mine = queue.filter((e) => [first, second, third, fourth].some((p) => p.enc === e.encounterId));
  const order = mine.map((e) => [first, second, third, fourth].findIndex((p) => p.enc === e.encounterId));
  assert.deepEqual(order, [3, 2, 0, 1], 'emergency, attention, then routine in token order');
  assert.ok(mine[0].priority > mine[1].priority && mine[1].priority > mine[2].priority);
  assert.deepEqual(mine[2].token < mine[3].token, true);
  assert.equal(mine[0].status, 'alert');
  assert.equal(mine[2].complaint.key, 'cough');
  const { help } = (await t.call('GET', '/api/staff/alerts', { cookie: staff })).body;
  assert.ok(help.some((h) => h.reason === 'help_button' && h.patientcaseId));
});

test('tokens are unique and increase through the day', async () => {
  const { queue } = (await t.call('GET', '/api/staff/queue', { cookie: staff })).body;
  const tokens = queue.map((e) => e.token);
  assert.equal(new Set(tokens).size, tokens.length);
  assert.ok(Math.min(...tokens) >= 1);
});

test('alerts reach the staff and doctor streams in real time (latency measured), and the doctor banner updates on acknowledgement', async () => {
  const staffStream = await openStream('/api/staff/alerts/stream', staff);
  const doctorStream = await openStream('/api/doctor/alerts/stream', doctor);
  await staffStream.waitFor((e) => e.event === 'snapshot');
  await doctorStream.waitFor((e) => e.event === 'snapshot');

  const samples = [];
  for (let i = 0; i < 6; i++) {
    const p = await patient();
    await p.answer('cc.reason', 'test visit'); await p.answer('emergency.screen', ['none']);
    const t0 = performance.now();
    const [toStaff, toDoctor] = [
      staffStream.waitFor((e) => e.event === 'alert' && e.data.encounterId === p.enc),
      doctorStream.waitFor((e) => e.event === 'alert' && e.data.encounterId === p.enc),
    ];
    await p.answer('cc.main', 'cough');
    await p.answer('cc.duration', 'd1_3');
    await p.answer('hpi.progress', 'same');
    await p.answer('cough.type', 'wet');
    const sent = performance.now();
    await p.answer('cough.blood', 'yes');
    const [s, d] = await Promise.all([toStaff, toDoctor]);
    samples.push({ staff: s.at - sent, doctor: d.at - sent, total: s.at - t0 });
    assert.equal(s.data.ruleId, 'RF-COUGH-BLOOD');
    assert.equal(s.data.level, 'emergency');
  }
  const worst = Math.max(...samples.flatMap((x) => [x.staff, x.doctor]));
  const sorted = samples.flatMap((x) => [x.staff, x.doctor]).sort((a, b) => a - b);
  console.info(`ALERT-LATENCY answer-to-screen over ${sorted.length} deliveries: median ${sorted[Math.floor(sorted.length / 2)].toFixed(0)} ms, max ${worst.toFixed(0)} ms (target 3000 ms)`);
  assert.ok(worst < 3000, `slowest alert took ${worst.toFixed(0)} ms`);

  // acknowledging pushes an update to both screens
  const last = staffStream.events.filter((e) => e.event === 'alert').at(-1).data;
  const ackSeen = doctorStream.waitFor((e) => e.event === 'ack' && e.data.id === last.id);
  await t.call('POST', `/api/staff/alerts/${last.id}/ack`, { cookie: staff });
  assert.equal((await ackSeen).data.acknowledgedBy, 'Test Staff');
  staffStream.close();
  doctorStream.close();
});

test('alerts survive a reload and a dropped connection: a new stream starts with a snapshot of everything open', async () => {
  const before = await openStream('/api/staff/alerts/stream', staff);
  await before.waitFor((e) => e.event === 'snapshot');
  const p1 = await patient();
  await raiseChestAlert(p1);
  await before.waitFor((e) => e.event === 'alert' && e.data.encounterId === p1.enc);
  before.close(); // the connection drops

  const p2 = await patient();                 // raised while the screen was offline
  await p2.answer('cc.reason', 'test visit'); await p2.answer('emergency.screen', ['e_faint']);

  const after = await openStream('/api/staff/alerts/stream', staff);
  const snap = (await after.waitFor((e) => e.event === 'snapshot')).data;
  const encs = snap.alerts.map((a) => a.encounterId);
  assert.ok(encs.includes(p1.enc) && encs.includes(p2.enc), 'both alerts are in the snapshot');
  const ids = snap.alerts.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicates');
  // a page reload uses the plain endpoint and sees the same state
  const reload = (await t.call('GET', '/api/staff/alerts', { cookie: staff })).body.alerts.map((a) => a.id).sort();
  assert.deepEqual(reload, [...ids].sort());
  after.close();
});

test('help requests are pushed to staff as they happen, never to doctors', async () => {
  const s = await openStream('/api/staff/alerts/stream', staff);
  const d = await openStream('/api/doctor/alerts/stream', doctor);
  await s.waitFor((e) => e.event === 'snapshot');
  await d.waitFor((e) => e.event === 'snapshot');
  const p = await patient();
  await t.call('POST', '/api/patient/help', { cookie: p.cookie, body: { screen: 'review' } });
  const e = await s.waitFor((x) => x.event === 'help' && x.data.detail.screen === 'review');
  assert.equal(e.data.reason, 'help_button');
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(!d.events.some((x) => x.event === 'help'));
  s.close(); d.close();
});

test('doctors are shown their department only (department-level routing)', async () => {
  const [peds] = await q(`SELECT id FROM departments WHERE name = 'OPD Paediatrics'`);
  const p = await patient();
  await q('UPDATE encounters SET department_id = $2 WHERE id = $1', [p.enc, peds.id]); // not the test doctor's department
  const stream = await openStream('/api/doctor/alerts/stream', doctor);
  await stream.waitFor((e) => e.event === 'snapshot');
  await p.answer('cc.reason', 'test visit'); await p.answer('emergency.screen', ['e_bleed']);
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(!stream.events.some((e) => e.event === 'alert' && e.data.encounterId === p.enc), 'not pushed to another department');
  assert.ok(!(await t.call('GET', '/api/doctor/alerts', { cookie: doctor })).body.alerts.some((a) => a.encounterId === p.enc));
  assert.ok((await t.call('GET', '/api/staff/alerts', { cookie: staff })).body.alerts.some((a) => a.encounterId === p.enc), 'staff see every department');
  stream.close();
});

test('the alert streams and APIs are role-protected', async () => {
  const patientCookie = (await patient()).cookie;
  for (const [path, cookie, want] of [
    ['/api/staff/alerts/stream', undefined, 401], ['/api/staff/alerts/stream', doctor, 403], ['/api/staff/alerts/stream', patientCookie, 403],
    ['/api/doctor/alerts/stream', undefined, 401], ['/api/doctor/alerts/stream', staff, 403], ['/api/doctor/alerts/stream', patientCookie, 403],
    ['/api/staff/queue', doctor, 403], ['/api/doctor/alerts', patientCookie, 403],
  ]) {
    const s = await openStream(path, cookie);
    assert.equal(s.status, want, `${path} as ${cookie === staff ? 'staff' : cookie === doctor ? 'doctor' : cookie ? 'patient' : 'nobody'}`);
    s.close();
  }
});
