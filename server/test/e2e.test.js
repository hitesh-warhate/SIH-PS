import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './helpers.js';
import { png, jpg } from './doc-helpers.js';
import { QUESTIONS } from '../config/questions.v1.js';
import { computeMetrics } from '../src/metrics.js';

// End-to-end tests of the whole patient journey through the HTTP API (Phase 9): identify or register, converse, scan, summarize and
// route, consult, and send. One run for each language and each listening mode (9 combinations). The browser screens are not driven here:
// no browser-automation tool is set up in CI (docs/test-plan.md lists this as a gap).
const LANGS = ['en', 'hi', 'mr'];
const MODES = ['listen_speak', 'listen_tap', 'read_tap'];
const IDX = { en: 0, hi: 1, mr: 2 };
const ALL = { history: true, documents: true, his_sharing: true, abha_linking: true };
const CONFIRM = { visual: true, audio: true };
let t, doctor, staff, n = 0;
before(async () => { t = await startTestApp(); doctor = await t.login('doctor'); staff = await t.login('staff'); });
after(async () => { await t.close(); });

const fill = (q) => (q.type === 'yes_no' ? 'no' : q.type === 'single' ? q.options[0].value : q.type === 'multi' ? [(q.options.find((o) => o.value === 'none') ?? q.options[0]).value]
  : q.type === 'number' ? (q.min ?? 1) + 1 : 'since the morning');
const labelOf = (key, value, lang) => QUESTIONS.find((x) => x.key === key).options.find((o) => o.value === value).label[IDX[lang]];

for (const lang of LANGS) {
  for (const mode of MODES) {
    test(`journey in ${lang} with ${mode}: register, converse, scan, summarize, consult, send`, async () => {
      // 1. identify or register, in the patient's language
      const mobile = `89${String(100000 + n++).padStart(8, '0')}`;
      const reg = await t.registerPatient({ fullName: `Journey ${lang} ${mode}`, mobile, language: lang, age: 61, sex: 'female' });
      assert.equal(reg.status, 201);
      assert.match(reg.body.patientcaseId, /^PC-/);
      const consent = await t.call('POST', '/api/patient/consent', { cookie: reg.cookie, body: { purposes: ALL, language: lang } });
      assert.equal(consent.status, 201);
      const enc = consent.body.encounterId;
      const patient = (method, path, body) => t.call(method, `/api/patient${path}`, { cookie: reg.cookie, body });

      // 2. converse: the chosen listening mode applies to every question including follow-ups, and the questions arrive in the patient's language
      assert.equal((await patient('PUT', '/interview/listening-mode', { mode })).status, 200);
      const modality = mode === 'listen_speak' ? 'voice' : 'tap';
      const seen = [];
      for (let i = 0; i < 80; i++) {
        const next = (await patient('GET', '/interview/next')).body; // no ?lang: the session language is used
        if (next.done) break;
        assert.equal(next.listeningMode, mode, `mode applies to ${next.question.key}${next.question.followUp ? ' (a follow-up)' : ''}`);
        seen.push(next.question);
        const full = QUESTIONS.find((x) => x.key === next.question.key);
        assert.equal(next.question.text, full.text[IDX[lang]], `${next.question.key} is in ${lang}`);
        const value = next.question.key === 'cc.main' ? 'cough' : next.question.key === 'cc.duration' ? 'w1_4' : fill(full);
        const body = { questionKey: next.question.key, value, modality, confirmation: CONFIRM, ...(modality === 'voice' ? { confidence: 0.9, transcript: 'spoken answer' } : {}) };
        assert.equal((await patient('POST', '/interview/answer', body)).status, 200, next.question.key);
      }
      assert.ok(seen.some((q) => q.followUp), 'follow-ups adapt to the chief complaint');
      assert.ok(seen.some((q) => q.key === 'cough.type'), 'cough follow-ups were asked');
      const stored = (await t.db.pool.query('SELECT DISTINCT modality FROM interview_responses WHERE encounter_id = $1', [enc])).rows.map((r) => r.modality);
      assert.deepEqual(stored, [modality], 'every answer was recorded with how it was given');

      // 3. scan: several files, per-file status, one chronological timeline
      for (const [i, f] of [png('en-rx-printed'), png('en-lab-printed'), jpg('en-rx-scan')].entries()) assert.equal((await t.send('POST', '/api/patient/documents', f, { cookie: reg.cookie, name: `f${i}` })).status, 202);
      await t.settle();
      assert.deepEqual((await patient('GET', '/documents')).body.documents.map((d) => d.status), ['done', 'done', 'done']);

      // 4. summarize and route
      assert.equal((await patient('POST', '/submit')).status, 200);
      assert.equal((await t.db.pool.query('SELECT status FROM encounters WHERE id = $1', [enc])).rows[0].status, 'ready');
      const queue = (await t.call('GET', '/api/doctor/encounters', { cookie: doctor })).body.items.find((i) => i.id === enc);
      assert.equal(queue.chip, 'ready');
      assert.equal(queue.complaint.key, 'cough');

      // 5. consult: the summary is in the doctor's chosen language, with sources, and makes no diagnosis
      const view = (await t.call('GET', `/api/doctor/encounters/${enc}/summary`, { cookie: doctor })).body;
      const cc = view.summary.content.sections[0].items.find((i) => i.id === 'cc.main');
      assert.equal(cc.text[lang], labelOf('cc.main', 'cough', lang));
      assert.deepEqual(view.diagnosticWording, []);
      assert.equal(view.summary.content.files.included.length, 3);
      const analysis = (await t.call('GET', `/api/doctor/encounters/${enc}/analysis`, { cookie: doctor })).body;
      assert.equal(analysis.results.timeline.events.length, 3);
      assert.equal((await t.call('POST', `/api/doctor/encounters/${enc}/consult`, { cookie: doctor })).status, 200);
      assert.equal((await t.call('POST', `/api/doctor/encounters/${enc}/summary/accept`, { cookie: doctor })).status, 200);

      // 6. send, and what the patient can see afterwards is only a confirmation
      await t.integration.settle();
      assert.deepEqual((await t.db.pool.query(`SELECT target, status FROM deliveries WHERE encounter_id = $1 ORDER BY target`, [enc])).rows.map((d) => `${d.target}:${d.status}`), ['abha:not_sent', 'his:delivered']);
      assert.equal(/summary|analysis|interaction|reconciliation/i.test(JSON.stringify((await patient('GET', '/documents')).body)), false);
    });
  }
}

test('a new patient is stopped at a likely duplicate and the staff desk registers on their behalf', async () => {
  const body = { fullName: 'Duplicate Check', age: 70, sex: 'male', mobile: '8800000001', language: 'hi', registrationConsent: true };
  assert.equal((await t.registerPatient(body)).status, 201);
  const dup = await t.registerPatient(body);
  assert.equal(dup.status, 409, 'caught before a second record is created');
  assert.ok(dup.body.candidates?.length >= 1);
  const staffMade = await t.call('POST', '/api/staff/patients', { cookie: staff, body: { ...body, mobile: '8800000002', fullName: 'Staff Registered' } });
  assert.equal(staffMade.status, 201);
});

test('an emergency answer raises a visible alert to staff and doctor at once, and the case keeps its place in the queue', async () => {
  const reg = await t.registerPatient({ fullName: 'Emergency Journey', mobile: '8800000003', age: 66, sex: 'male' });
  await t.call('POST', '/api/patient/consent', { cookie: reg.cookie, body: { purposes: ALL } });
  const res = await t.call('POST', '/api/patient/interview/answer', { cookie: reg.cookie, body: { questionKey: 'emergency.screen', value: ['e_chest'], modality: 'tap', confirmation: CONFIRM } });
  assert.equal(res.body.staffNotified, true);
  for (const cookie of [staff, doctor]) {
    const alerts = (await t.call('GET', `/api/${cookie === staff ? 'staff' : 'doctor'}/alerts`, { cookie })).body.alerts;
    assert.ok(alerts.some((a) => a.patientName === 'Emergency Journey' && a.level === 'emergency'));
  }
  const first = (await t.call('GET', '/api/doctor/encounters', { cookie: doctor })).body.items[0];
  assert.equal(first.name, 'Emergency Journey', 'alerts sort first');
});

// ---- the pilot's success metrics, computed from what the system records ----
test('the success metrics are computed from recorded data, with their definitions and what they cannot see', async () => {
  const m = await computeMetrics(t.db.pool);
  assert.ok(m.sessions.started >= 10 && m.sessions.submitted >= 9);
  assert.ok(m.independentCompletion.rate > 0 && m.independentCompletion.rate <= 1);
  assert.ok(m.medianIntakeSeconds.value >= 0 && m.medianIntakeSeconds.n >= 9);
  assert.deepEqual(Object.keys(m.listeningMode.sessions).sort().filter((k) => k !== 'not_chosen'), [...MODES].sort());
  assert.ok(m.historyCompleteness.meanQuestionsAnswered > 0.9, 'the walked interviews answered nearly everything reachable');
  assert.equal(m.physicianEdits.accepted >= 9, true);
  assert.equal(m.physicianEdits.amendedOrRejectedRate, 0);
  assert.equal(m.consentIntegrity.rate, 1, 'consent was recorded before every capture');
  assert.ok(m.multiFileAnalysisMs.n >= 9 && m.multiFileAnalysisMs.median >= 0);
  assert.ok(m.selfRegistration.byRoute.patient >= 10 && m.selfRegistration.byRoute.staff >= 1);
  assert.equal(m.selfRegistration.rate, null);
  assert.ok(m.notMeasurableHere.length === 3);
});
