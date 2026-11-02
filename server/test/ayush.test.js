import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './helpers.js';
import { QUESTIONS } from '../config/questions.v1.js';
import {
  AYUSH_OBSERVED, AYUSH_QUESTIONS, AYUSH_SECTIONS, DASHAVIDHA, OTHER_TOPICS, vayaOf,
} from '../config/ayush.v1.js';
import { findDiagnosticWording, generateSummary } from '../src/summary/generate.js';

const ALL = { history: true, documents: true, his_sharing: true, abha_linking: true };
const CONFIRM = { visual: true, audio: true };
let t, staff, doctor, n = 0;
const q = (sql, params) => t.db.pool.query(sql, params).then((r) => r.rows);
before(async () => { t = await startTestApp(); staff = await t.login('staff'); doctor = await t.login('doctor'); });
after(async () => { await t.close(); });

async function patient({ ayush = null, age = 40 } = {}) {
  const mobile = `93000${String(10000 + n++)}`;
  const reg = await t.registerPatient({ fullName: `Ayush Tester ${n}`, mobile, age });
  const consent = await t.call('POST', '/api/patient/consent', { cookie: reg.cookie, body: { purposes: ALL } });
  const enc = consent.body.encounterId;
  const p = {
    cookie: reg.cookie, enc, mobile,
    next: (lang = 'en') => t.call('GET', `/api/patient/interview/next?lang=${lang}`, { cookie: p.cookie }),
    answer: (questionKey, value, modality = 'tap') => t.call('POST', '/api/patient/interview/answer', { cookie: p.cookie, body: { questionKey, value, modality, confirmation: CONFIRM } }),
    mode: (body) => t.call('PUT', `/api/staff/encounters/${enc}/mode`, { cookie: staff, body }),
  };
  if (ayush !== null) assert.equal((await p.mode({ ayush })).status, 200);
  return p;
}

// A plausible answer for any question, so a whole interview can be walked.
const fill = (qq) => {
  if (qq.type === 'yes_no') return 'no';
  if (qq.type === 'single') return qq.options[0].value;
  if (qq.type === 'multi') return [qq.options.find((o) => o.value === 'none')?.value ?? qq.options[0].value];
  if (qq.type === 'number') return qq.min ?? 1;
  return 'felt unwell since the morning';
};
async function walk(p, { stopAfter = Infinity, lang = 'en', modality = 'tap' } = {}) {
  const asked = [];
  for (let i = 0; i < 150 && asked.length < stopAfter; i++) {
    const r = (await p.next(lang)).body;
    if (r.done) break;
    asked.push(r.question.key);
    const full = QUESTIONS.find((x) => x.key === r.question.key) ?? AYUSH_QUESTIONS.find((x) => x.key === r.question.key);
    const res = await p.answer(r.question.key, r.question.key === 'cc.main' ? 'fever' : fill(full), modality);
    assert.equal(res.status, 200, `${r.question.key}: ${JSON.stringify(res.body)}`);
  }
  return asked;
}

// ---- the content itself ----
test('the AYUSH question set covers the ten Dashavidha Pariksha parameters and the other required topics', () => {
  const covered = new Set([...AYUSH_QUESTIONS.map((x) => x.parameter), ...AYUSH_OBSERVED.map((o) => o.parameter), 'vaya']);
  for (const p of DASHAVIDHA) assert.ok(covered.has(p), `Dashavidha parameter ${p}`);
  for (const p of OTHER_TOPICS) assert.ok(covered.has(p), `topic ${p}`);
  assert.equal(vayaOf(10), 'bala');
  assert.equal(vayaOf(40), 'madhya');
  assert.equal(vayaOf(70), 'jeerna');
  assert.equal(vayaOf(null), null);
});

test('every AYUSH question and option has English, Hindi and Marathi text, shows the Sanskrit term, and uses a unique key', () => {
  const keys = new Set(QUESTIONS.map((x) => x.key));
  const sections = new Set(AYUSH_SECTIONS.map(([id]) => id));
  for (const [, title] of AYUSH_SECTIONS) assert.ok(title.length === 3 && title.every(Boolean));
  for (const x of AYUSH_QUESTIONS) {
    assert.ok(!keys.has(x.key), `${x.key} collides with the standard bank`);
    keys.add(x.key);
    assert.ok(sections.has(x.section), `${x.key} section`);
    assert.ok(x.text.length === 3 && x.text.every((s) => s && s.length > 5), `${x.key} text`);
    assert.match(x.text[0], /\([A-Z][A-Za-z ]+\)/, `${x.key}: Sanskrit term beside the question`);
    assert.match(x.text[1], /\(/, `${x.key} hi term`);
    assert.match(x.text[2], /\(/, `${x.key} mr term`);
    for (const o of x.options ?? []) assert.ok(o.label.length === 3 && o.label.every(Boolean), `${x.key}/${o.value}`);
    if (['single', 'multi'].includes(x.type)) assert.ok(x.options.length >= 2);
    assert.equal(x.ayush, true);
  }
  for (const o of AYUSH_OBSERVED) assert.ok(o.title.length === 3 && o.title.every(Boolean));
});

test('no AYUSH option names a dosha or states an assessment: the patient describes, the physician decides', () => {
  const words = /\b(vata|pitta|kapha|dosha|vatic|pittaj|kaphaj|prakriti type|you are a)\b/i;
  for (const x of AYUSH_QUESTIONS) {
    for (const s of [...x.text, ...(x.options ?? []).flatMap((o) => o.label)]) assert.equal(words.test(s), false, `${x.key}: ${s}`);
  }
});

// ---- the mode switch ----
test('AYUSH mode follows the department setting, and staff can override it either way and return to the department rule', async () => {
  const depts = (await t.call('GET', '/api/staff/departments', { cookie: staff })).body.departments;
  const ayushDept = depts.find((d) => d.ayush), plain = depts.find((d) => !d.ayush);
  const p = await patient();
  assert.equal((await q('SELECT ayush_mode FROM encounters WHERE id = $1', [p.enc]))[0].ayush_mode, false, 'off by default');

  assert.deepEqual((await p.mode({ departmentId: ayushDept.id })).body, { ayush: true, source: 'department', departmentId: ayushDept.id });
  assert.deepEqual((await p.mode({ ayush: false })).body, { ayush: false, source: 'staff', departmentId: ayushDept.id }, 'staff override off');
  assert.equal((await p.mode({ departmentId: plain.id, ayush: true })).body.source, 'staff', 'staff override on');
  assert.deepEqual((await p.mode({ ayush: null })).body, { ayush: false, source: 'department', departmentId: plain.id }, 'back to the department rule');
  assert.equal((await p.mode({ ayush: 'yes' })).status, 400);
  assert.equal((await p.mode({ departmentId: 'nope' })).status, 400);
  assert.equal((await p.mode({ departmentId: '00000000-0000-4000-8000-000000000000' })).status, 404);
  assert.equal((await t.call('PUT', '/api/staff/encounters/00000000-0000-4000-8000-000000000000/mode', { cookie: staff, body: { ayush: true } })).status, 404);
  for (const cookie of [p.cookie, doctor]) assert.equal((await t.call('PUT', `/api/staff/encounters/${p.enc}/mode`, { cookie, body: { ayush: true } })).status, 403, 'only staff');
  assert.ok((await q(`SELECT count(*)::int n FROM audit_logs WHERE action = 'ayush_mode_set' AND object_id = $1`, [p.enc]))[0].n >= 4);
  const queue = (await t.call('GET', '/api/staff/queue', { cookie: staff })).body.queue;
  assert.equal(queue.find((x) => x.encounterId === p.enc).ayush, false);
});

// ---- the interview ----
test('AYUSH mode asks and records every AYUSH question after the standard ones, and the standard interview is unchanged', async () => {
  const p = await patient({ ayush: true });
  const asked = await walk(p);
  const standard = asked.filter((k) => !k.startsWith('ayush.'));
  const ayush = asked.filter((k) => k.startsWith('ayush.'));
  assert.deepEqual(ayush, AYUSH_QUESTIONS.map((x) => x.key), 'every AYUSH question, in order');
  assert.ok(asked.indexOf(ayush[0]) > asked.indexOf(standard.at(-1)), 'AYUSH follows the standard questions');
  const stored = (await q('SELECT question_key FROM interview_responses WHERE encounter_id = $1', [p.enc])).map((r) => r.question_key);
  for (const k of ayush) assert.ok(stored.includes(k), `${k} recorded`);
  assert.equal((await p.next()).body.done, true);

  const plain = await patient();
  const askedPlain = await walk(plain);
  assert.deepEqual(askedPlain, standard, 'without AYUSH mode the same standard questions are asked');
  assert.equal((await plain.answer('ayush.prakriti.build', 'thin')).status, 422, 'an AYUSH question is not available outside AYUSH mode');
});

test('AYUSH questions work in all three languages and all three listening modes', async () => {
  const p = await patient({ ayush: true });
  await walk(p, { stopAfter: 1000 }); // the standard part and the AYUSH part
  const fresh = await patient({ ayush: true });
  // reach the first AYUSH question quickly: standard answers first
  let r;
  for (let i = 0; i < 80; i++) { r = (await fresh.next()).body; if (r.question.key.startsWith('ayush.')) break; await fresh.answer(r.question.key, r.question.key === 'cc.main' ? 'fever' : fill(QUESTIONS.find((x) => x.key === r.question.key))); }
  assert.equal(r.question.key, 'ayush.prakriti.build');
  const en = (await fresh.next('en')).body.question, hi = (await fresh.next('hi')).body.question, mr = (await fresh.next('mr')).body.question;
  assert.match(en.text, /Prakriti/);
  assert.match(hi.text, /प्रकृति/);
  assert.match(mr.text, /प्रकृती/);
  assert.equal(en.options.length, hi.options.length);
  assert.notEqual(hi.options[0].label, en.options[0].label);
  for (const mode of ['listen_speak', 'listen_tap', 'read_tap']) {
    assert.equal((await t.call('PUT', '/api/patient/interview/listening-mode', { cookie: fresh.cookie, body: { mode } })).status, 200);
    assert.equal((await fresh.next()).body.listeningMode, mode);
  }
  assert.equal((await fresh.answer('ayush.prakriti.build', 'medium', 'voice')).status, 200, 'a voice answer');
  assert.equal((await fresh.answer('ayush.prakriti.skin', 'skin_oily', 'tap')).status, 200, 'a touch answer');
  assert.equal((await fresh.answer('ayush.prakriti.hunger', 'not-an-option')).status, 400);
});

test('red flags still alert in AYUSH mode', async () => {
  const p = await patient({ ayush: true });
  await p.answer('cc.reason', 'test visit');
  assert.equal((await p.answer('emergency.screen', ['e_chest'])).status, 200);
  assert.ok((await q('SELECT 1 FROM alerts WHERE encounter_id = $1', [p.enc])).length >= 1);
  const state = (await t.call('GET', '/api/patient/interview/state', { cookie: p.cookie })).body;
  assert.equal(state.staffNotified, true);
  assert.equal(JSON.stringify(state).includes('emergency'), false, 'the patient is still told nothing about why');
});

test('switching modes loses no answers, and a paused AYUSH interview resumes where it stopped', async () => {
  const p = await patient({ ayush: true });
  const first = await walk(p, { stopAfter: 15 }); // part of the way into the AYUSH questions
  const ayushDone = first.filter((k) => k.startsWith('ayush.'));
  assert.ok(ayushDone.length >= 3, `got ${ayushDone.length} AYUSH answers`);
  const keysOf = async () => (await q('SELECT question_key FROM interview_responses WHERE encounter_id = $1', [p.enc])).map((r) => r.question_key).sort();
  const before = await keysOf();

  // switch AYUSH off, then change a standard answer (which prunes stale follow-ups): the AYUSH answers must stay
  await p.mode({ ayush: false });
  assert.ok((await p.next()).body.done === true || !(await p.next()).body.question.key.startsWith('ayush.'), 'no AYUSH question while off');
  assert.equal((await p.answer('cc.duration', 'w1_4')).status, 200);
  assert.deepEqual((await keysOf()).filter((k) => k.startsWith('ayush.')), before.filter((k) => k.startsWith('ayush.')), 'AYUSH answers kept');

  // switch back on: it continues with the first unanswered AYUSH question
  await p.mode({ ayush: true });
  const next = (await p.next()).body.question.key;
  assert.equal(next, AYUSH_QUESTIONS.find((x) => !ayushDone.includes(x.key)).key);
  const review = (await t.call('GET', '/api/patient/interview/review', { cookie: p.cookie })).body.items.map((i) => i.key);
  for (const k of ayushDone) assert.ok(review.includes(k), `${k} back in the review list`);

  // pause: the patient leaves and comes back in a new session; the same encounter and token continue
  const tokenBefore = (await q('SELECT token_number FROM queue_entries WHERE encounter_id = $1', [p.enc]))[0].token_number;
  const token = await t.verifyMobile(p.mobile);
  const back = await t.call('POST', '/api/patient/lookup', { body: { method: 'mobile_otp', verificationToken: token, language: 'en' } });
  assert.equal(back.status, 200);
  const consent = await t.call('POST', '/api/patient/consent', { cookie: back.cookie, body: { purposes: ALL } });
  assert.equal(consent.body.encounterId, p.enc, 'the paused encounter continues');
  assert.equal((await q('SELECT token_number FROM queue_entries WHERE encounter_id = $1', [p.enc])).length, 1);
  assert.equal((await q('SELECT token_number FROM queue_entries WHERE encounter_id = $1', [p.enc]))[0].token_number, tokenBefore);
  const resumed = await t.call('GET', '/api/patient/interview/next', { cookie: back.cookie });
  assert.equal(resumed.body.question.key, next, 'resumes at the question where it stopped');
  assert.equal(resumed.body.progress.answered, (await keysOf()).length);
});

test('a patient who has not answered anything starts a new encounter each time, and a submitted one is never reopened', async () => {
  const p = await patient();
  const token = await t.verifyMobile(p.mobile);
  const back = await t.call('POST', '/api/patient/lookup', { body: { method: 'mobile_otp', verificationToken: token, language: 'en' } });
  const again = await t.call('POST', '/api/patient/consent', { cookie: back.cookie, body: { purposes: ALL } });
  assert.notEqual(again.body.encounterId, p.enc, 'nothing was answered, so there is nothing to resume');

  const q2 = await patient();
  await walk(q2, { stopAfter: 3 });
  await t.call('POST', '/api/patient/submit', { cookie: q2.cookie });
  const t2 = await t.verifyMobile(q2.mobile);
  const back2 = await t.call('POST', '/api/patient/lookup', { body: { method: 'mobile_otp', verificationToken: t2, language: 'en' } });
  assert.notEqual((await t.call('POST', '/api/patient/consent', { cookie: back2.cookie, body: { purposes: ALL } })).body.encounterId, q2.enc);
});

// ---- the summary ----
test('the summary adds the AYUSH sections beside the standard ones, lists what only the physician can observe, and keeps the standard sections', async () => {
  const p = await patient({ ayush: true, age: 70 });
  await walk(p);
  await t.call('POST', '/api/patient/submit', { cookie: p.cookie });
  const r = (await t.call('GET', `/api/doctor/encounters/${p.enc}/summary`, { cookie: doctor })).body;
  const c = r.summary.content;
  const ids = c.sections.map((s) => s.id);
  assert.deepEqual(ids, ['chief_complaint', 'hpi', 'past_history', 'drug_allergy', 'family', 'personal', 'ros', ...AYUSH_SECTIONS.map(([id]) => id), 'investigations']);
  const items = c.sections.flatMap((s) => s.items);
  assert.equal(c.ayush, true);
  const asked = items.filter((i) => i.id.startsWith('ayush.') && i.status === 'answered' && i.source.type === 'patient');
  assert.equal(asked.length, AYUSH_QUESTIONS.length, 'every AYUSH answer appears with its source');
  for (const i of asked) for (const l of ['en', 'hi', 'mr']) assert.ok(i.text[l], `${i.id} ${l}`);
  const parameters = new Set(items.filter((i) => i.parameter).map((i) => i.parameter));
  for (const x of [...DASHAVIDHA, ...OTHER_TOPICS]) assert.ok(parameters.has(x), `${x} in the summary`);
  const observed = items.filter((i) => i.status === 'physician_to_observe');
  assert.deepEqual(observed.map((i) => i.parameter).sort(), AYUSH_OBSERVED.map((o) => o.parameter).sort());
  for (const i of observed) assert.equal(i.text, null, 'never filled in');
  assert.equal(items.find((i) => i.id === 'ayush.vaya').text.en, 'Jeerna (older adult)', 'worked out from the registered age');
  assert.equal(c.completeness.notAnswered.some((x) => x.id.startsWith('ayush.observe')), false, 'observation items are not "unanswered questions"');
  assert.deepEqual(r.diagnosticWording, []);

  const standard = await patient();
  await walk(standard);
  await t.call('POST', '/api/patient/submit', { cookie: standard.cookie });
  const s2 = (await t.call('GET', `/api/doctor/encounters/${standard.enc}/summary`, { cookie: doctor })).body.summary.content;
  assert.equal(s2.ayush, false);
  assert.equal(s2.sections.some((s) => s.id.startsWith('ayush_')), false, 'no AYUSH sections outside AYUSH mode');
  const queue = (await t.call('GET', '/api/doctor/encounters', { cookie: doctor })).body.items;
  assert.equal(queue.find((i) => i.id === p.enc).ayush, true);
  assert.equal(queue.find((i) => i.id === standard.enc).ayush, false);
});

test('summaries with AYUSH sections contain no diagnostic wording, and unanswered AYUSH questions show as not answered', () => {
  const answers = { 'emergency.screen': { value: ['none'] }, 'cc.main': { value: 'fever' }, 'ayush.prakriti.build': { skipped: true }, 'ayush.agni.acidity': { value: 'yes' } };
  const content = generateSummary({ answers, analysis: null, documents: [], ayush: true, patient: { age: 30 } });
  assert.deepEqual(findDiagnosticWording(content), []);
  const items = content.sections.flatMap((s) => s.items);
  assert.equal(items.find((i) => i.id === 'ayush.prakriti.build').status, 'not_answered');
  assert.equal(items.find((i) => i.id === 'ayush.prakriti.build').text, null);
  assert.equal(items.find((i) => i.id === 'ayush.agni.acidity').text.hi, 'हाँ');
  assert.equal(items.find((i) => i.id === 'ayush.vaya').text.en, 'Madhya (adult)');
});
