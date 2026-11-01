import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './helpers.js';

const calls = [];
const spy = { name: 'spy', async evaluate(arg) { calls.push(arg.changedKey); return []; } };
let t;
let n = 0;
before(async () => { t = await startTestApp({ redFlags: spy }); });
after(async () => { await t.close(); });

const ALL = { history: true, documents: true, his_sharing: true, abha_linking: true };
const q = (sql, params) => t.db.pool.query(sql, params).then((r) => r.rows);
const CONFIRM = { visual: true, audio: true };

// A signed-in patient with consent and an encounter.
async function patient(purposes = ALL) {
  const mobile = `97000${String(10000 + n++)}`;
  const reg = await t.registerPatient({ fullName: `Interview Tester ${n}`, mobile, age: 40 });
  const consent = await t.call('POST', '/api/patient/consent', { cookie: reg.cookie, body: { purposes } });
  const cookie = reg.cookie;
  const next = (lang = '') => t.call('GET', `/api/patient/interview/next${lang ? `?lang=${lang}` : ''}`, { cookie });
  const answer = (questionKey, value, extra = {}) => t.call('POST', '/api/patient/interview/answer', {
    cookie, body: { questionKey, value, modality: 'tap', confirmation: CONFIRM, ...extra },
  });
  return { cookie, next, answer, mobile, enc: consent.body.encounterId };
}

test('the interview needs a live session and history consent', async () => {
  assert.equal((await t.call('GET', '/api/patient/interview/next')).status, 401);
  const noHistory = await patient({ ...ALL, history: true }); // history is required to have a session at all
  assert.equal((await noHistory.next()).status, 200);
  await t.call('POST', '/api/patient/consent/revoke', { cookie: noHistory.cookie, body: { purposes: ['history'] } });
  assert.equal((await noHistory.next()).status, 403);
});

test('an adaptive interview runs to the end by tapping, and every answer is saved with modality, confidence and confirmed flag', async () => {
  const p = await patient();
  let first = await p.next();
  assert.equal(first.body.question.key, 'emergency.screen');
  let guard = 0;
  for (;;) {
    const { body } = await p.next();
    if (body.done) break;
    const x = body.question;
    const value = x.type === 'yes_no' ? 'no' : x.type === 'multi' ? [x.options.at(-1).value === 'none' ? 'none' : x.options[0].value]
      : x.type === 'single' ? (x.key === 'cc.main' ? 'fever' : x.options[0].value) : x.type === 'number' ? 4 : 'a short note';
    const r = await p.answer(x.key, value, { confidence: 0.9 });
    assert.equal(r.status, 200, `${x.key}: ${JSON.stringify(r.body)}`);
    assert.ok(++guard < 60);
  }
  const rows = await q(`SELECT question_key, modality, confidence, confirmed, answer FROM interview_responses WHERE encounter_id = $1 ORDER BY question_key`, [p.enc]);
  assert.ok(rows.length >= 20, `only ${rows.length} answers`);
  assert.ok(rows.every((r) => r.modality === 'tap' && r.confirmed === true));
  assert.ok(rows.some((r) => r.confidence !== null));
  assert.ok(rows.some((r) => r.question_key === 'fever.pattern'), 'fever follow-ups were asked');
  assert.ok(!rows.some((r) => r.question_key.startsWith('pain.')), 'pain questions were not');
  assert.equal((await q(`SELECT status FROM encounters WHERE id = $1`, [p.enc]))[0].status, 'in_intake');

  const history = (await t.call('GET', '/api/patient/interview/history?lang=en', { cookie: p.cookie })).body.sections;
  assert.deepEqual(history.map((s) => s.section), ['chief_complaint', 'hpi', 'past_history', 'drug_allergy', 'family', 'personal', 'ros']);
  assert.ok(history.find((s) => s.section === 'hpi').items.some((i) => i.key === 'fever.pattern' && i.status === 'answered'));
});

test('the red-flag hook runs after every saved answer', async () => {
  calls.length = 0;
  const p = await patient();
  await p.answer('emergency.screen', ['none']);
  await p.answer('cc.main', 'cough');
  assert.deepEqual(calls, ['emergency.screen', 'cc.main']);
});

test('the listening mode is stored per encounter and returned with every question, follow-ups included', async () => {
  const p = await patient();
  assert.equal((await p.next()).body.listeningMode, null);
  assert.equal((await t.call('PUT', '/api/patient/interview/listening-mode', { cookie: p.cookie, body: { mode: 'sign' } })).status, 400);
  for (const mode of ['listen_speak', 'listen_tap', 'read_tap']) {
    assert.equal((await t.call('PUT', '/api/patient/interview/listening-mode', { cookie: p.cookie, body: { mode } })).status, 200);
    assert.equal((await p.next()).body.listeningMode, mode);
  }
  await p.answer('emergency.screen', ['none']);
  await p.answer('cc.main', 'back_pain'); // opens follow-ups
  const followUp = (await p.next()).body;
  assert.equal(followUp.listeningMode, 'read_tap');
  assert.equal(followUp.question.followUp, false); // cc.duration is a main question
  await p.answer('cc.duration', 'd1_3');
  await p.answer('hpi.progress', 'same');
  const site = (await p.next()).body;
  assert.equal(site.question.key, 'pain.site');
  assert.equal(site.question.followUp, true); // the follow-up badge
  assert.equal(site.listeningMode, 'read_tap');
});

test('skip records "not answered", never "no", and the follow-ups are not opened', async () => {
  const p = await patient();
  await p.answer('emergency.screen', ['none']);
  await p.answer('cc.main', 'cough');
  await p.answer('cc.duration', 'd1_3');
  await p.answer('hpi.progress', 'same');
  for (const k of ['cough.type', 'cough.blood', 'cough.breathless']) await p.answer(k, undefined, { skipped: true, confirmation: undefined });
  await p.answer('pmh.conditions', ['none']);
  const skip = await p.answer('psh.any', undefined, { skipped: true });
  assert.equal(skip.status, 200);
  const row = (await q(`SELECT answer, confirmed FROM interview_responses WHERE question_key = 'psh.any' AND encounter_id = $1`, [p.enc]))[0];
  assert.deepEqual(row.answer, { skipped: true });
  assert.equal(row.confirmed, false);
  assert.equal((await p.next()).body.question.key, 'drug.current_any'); // psh.details was not opened
  const review = (await t.call('GET', '/api/patient/interview/review?lang=en', { cookie: p.cookie })).body.items;
  const item = review.find((i) => i.key === 'psh.any');
  assert.deepEqual([item.skipped, item.answer], [true, null]);
});

test('the dialogue is constrained by the ontology: only reachable, valid questions can be answered', async () => {
  const p = await patient();
  assert.equal((await p.answer('fever.pattern', 'continuous')).status, 422); // follow-up not opened
  assert.equal((await p.answer('not.a.question', 'x')).status, 422);
  assert.equal((await p.answer('cc.main', 'cold')).status, 400);
  assert.equal((await p.answer('cc.main', 'fever', { modality: 'telepathy' })).status, 400);
  assert.equal((await p.answer('cc.main', 'fever', { confidence: 3 })).status, 400);
});

test('allergies, medicines and emergency symptoms need both visual and audio confirmation', async () => {
  const p = await patient();
  const bare = await p.answer('allergy.any', 'no', { confirmation: undefined });
  assert.equal(bare.status, 400);
  assert.equal(bare.body.error, 'critical_confirmation_required');
  assert.equal((await p.answer('allergy.any', 'no', { confirmation: { visual: true } })).status, 400);
  assert.equal((await p.answer('allergy.any', 'no', { confirmation: { audio: true } })).status, 400);
  assert.equal((await p.answer('allergy.any', 'yes')).status, 200);
  const stored = (await q(`SELECT answer FROM interview_responses WHERE question_key = 'allergy.any' AND encounter_id = $1`, [p.enc]))[0].answer;
  assert.deepEqual(stored.confirmation, { visual: true, audio: true, audioUnavailable: false });
  // when audio is not possible on the terminal, staff are asked to verify the answer instead
  assert.equal((await p.answer('allergy.list', 'penicillin', { confirmation: { visual: true, audioUnavailable: true } })).status, 200);
  assert.ok((await q(`SELECT 1 FROM help_requests WHERE reason = 'critical_answer_audio_unavailable'`)).length >= 1);
  // an ordinary question needs no such confirmation
  assert.equal((await p.answer('cc.main', 'fever', { confirmation: undefined })).status, 200);
});

test('the patient can correct an earlier answer; answers that no longer apply are removed and new follow-ups are asked', async () => {
  const p = await patient();
  await p.answer('emergency.screen', ['none']);
  await p.answer('cc.main', 'fever');
  await p.answer('cc.duration', 'd1_3');
  await p.answer('hpi.progress', 'worse');
  await p.answer('fever.pattern', 'continuous');
  const cur = await t.call('GET', '/api/patient/interview/question/cc.main?lang=en', { cookie: p.cookie });
  assert.deepEqual(cur.body.current, { value: 'fever' });
  const fix = await p.answer('cc.main', 'chest_pain');
  assert.deepEqual(fix.body.pruned, ['fever.pattern']);
  const next = (await p.next()).body.question;
  assert.equal(next.key, 'pain.site');
  assert.equal((await t.call('GET', '/api/patient/interview/question/fever.pattern', { cookie: p.cookie })).status, 404);
  const review = (await t.call('GET', '/api/patient/interview/review?lang=en', { cookie: p.cookie })).body.items.map((i) => i.key);
  assert.ok(!review.includes('fever.pattern') && review.includes('cc.main'));
});

test('switching language keeps every earlier answer and shows it in the new language; an interrupted session resumes where it stopped', async () => {
  const p = await patient();
  await p.answer('emergency.screen', ['none']);
  await p.answer('cc.main', 'fever');
  await p.answer('cc.duration', 'd4_7');
  const show = async (lang) => (await t.call('GET', `/api/patient/interview/review?lang=${lang}`, { cookie: p.cookie })).body.items.find((i) => i.key === 'cc.duration');
  assert.equal((await show('en')).answer, '4 to 7 days');
  assert.equal((await show('hi')).answer, '4 से 7 दिन');
  assert.equal((await show('mr')).answer, '4 ते 7 दिवस');
  assert.match((await p.next('hi')).body.question.text, /[ऀ-ॿ]/);
  // the stored value does not depend on the language
  assert.equal((await q(`SELECT answer FROM interview_responses WHERE question_key = 'cc.duration' AND encounter_id = $1`, [p.enc]))[0].answer.value, 'd4_7');
  // resume: the same session asks the next unanswered question, nothing is repeated
  const state = (await t.call('GET', '/api/patient/interview/state', { cookie: p.cookie })).body;
  assert.equal(state.progress.answered, 3);
  assert.equal((await p.next('en')).body.question.key, 'hpi.progress');
});

test('free narration is mapped to the standard structure and saved with its modality and confidence', async () => {
  const p = await patient();
  await p.answer('emergency.screen', ['none']);
  await p.answer('cc.main', 'other');
  const r = await p.answer('cc.other_text', 'I have chest pain for 3 days', { modality: 'voice', confidence: 0.72, transcript: 'I have chest pain for 3 days' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.suggestions.complaints, ['chest_pain']);
  assert.equal(r.body.suggestions.duration.key, 'd1_3');
  const row = (await q(`SELECT answer, modality, confidence, confirmed FROM interview_responses WHERE question_key = 'cc.other_text' AND encounter_id = $1`, [p.enc]))[0];
  assert.deepEqual([row.modality, Number(row.confidence), row.confirmed], ['voice', 0.72, true]);
  assert.equal(row.answer.extracted.mapper, 'rules-v1'); // mapper output is stored beside its input, for audit
  const hist = (await t.call('GET', '/api/patient/interview/history?lang=en', { cookie: p.cookie })).body.sections;
  const item = hist[0].items.find((i) => i.key === 'cc.other_text');
  assert.equal(item.answer, 'I have chest pain for 3 days');
});

test('two failed recognitions offer tapping and a further failure alerts staff; a good answer resets the count', async () => {
  const p = await patient();
  const fail = () => t.call('POST', '/api/patient/interview/recognition-failure', { cookie: p.cookie, body: { questionKey: 'cc.main' } });
  assert.deepEqual((await fail()).body, { failures: 1, offerTap: false, alertedStaff: false });
  assert.deepEqual((await fail()).body, { failures: 2, offerTap: true, alertedStaff: false });
  assert.equal((await q(`SELECT 1 FROM help_requests WHERE reason = 'speech_recognition_failed'`)).length, 0);
  assert.deepEqual((await fail()).body, { failures: 3, offerTap: true, alertedStaff: true });
  assert.equal((await q(`SELECT 1 FROM help_requests WHERE reason = 'speech_recognition_failed'`)).length, 1);
  await p.answer('cc.main', 'fever');
  assert.equal((await fail()).body.failures, 1);
  assert.equal((await t.call('POST', '/api/patient/interview/recognition-failure', { cookie: p.cookie, body: { questionKey: 'nope' } })).status, 400);
});

test('the help button creates a staff alert record', async () => {
  const p = await patient();
  assert.equal((await t.call('POST', '/api/patient/help', { cookie: p.cookie, body: { screen: 'interview' } })).status, 201);
  const staff = await t.login('staff');
  const { body } = await t.call('GET', '/api/staff/help-requests', { cookie: staff });
  assert.ok(body.helpRequests.some((h) => h.reason === 'help_button'));
  // before sign-in (language and registration screens) the button still reaches staff
  assert.equal((await t.call('POST', '/api/patient/help', { body: { screen: 'language' } })).status, 201);
  const after = (await t.call('GET', '/api/staff/help-requests', { cookie: staff })).body.helpRequests;
  assert.ok(after.some((h) => h.reason === 'help_button' && h.detail.screen === 'language' && h.patientcase_id === null));
});
