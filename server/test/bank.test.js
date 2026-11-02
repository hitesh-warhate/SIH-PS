import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_QUESTIONS, QUESTIONS, ROOT, SECTIONS } from '../config/questions.v1.js';
import { deriveFromReason, nextQuestion, presentQuestion, staleKeys, validateAnswer, structuredHistory } from '../src/interview/dialogue.js';
import { createRuleNarrationMapper } from '../src/interview/narration.js';

const TYPES = ['yes_no', 'single', 'multi', 'number', 'text'];
const ans = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v === 'SKIP' ? { skipped: true } : { value: v }]));
// Every answer a question can take by tapping (one option at a time for several-answer questions).
const choices = (q) => (q.type === 'yes_no' ? ['yes', 'no'] : q.type === 'single' ? q.options.map((o) => o.value)
  : q.type === 'multi' ? q.options.map((o) => [o.value]) : q.type === 'number' ? [2, 9] : ['text']);

// The keys asked, in order, when the patient gives the answers in `given` and a plain default everywhere else.
function walk(given = {}) {
  const answers = {};
  for (let guard = 0; guard < 20; guard++) {
    const { question } = nextQuestion(answers);
    if (!question) return Object.keys(answers);
    const v = question.key in given ? given[question.key] : question.type === 'yes_no' ? 'no' : question.type === 'multi' ? [question.options.at(-1).value]
      : question.type === 'single' ? question.options[0].value : question.type === 'number' ? 3 : 'text';
    answers[question.key] = v === 'SKIP' ? { skipped: true } : { value: v };
  }
  throw new Error('dialogue did not end');
}

test('the bank is well formed: unique keys, valid types, three languages on every text and option', () => {
  const seen = new Set();
  for (const q of QUESTIONS) {
    assert.ok(!seen.has(q.key), `duplicate key ${q.key}`);
    seen.add(q.key);
    assert.ok(TYPES.includes(q.type), q.key);
    assert.ok(SECTIONS.some(([id]) => id === q.section), `${q.key} section`);
    assert.equal(q.text.length, 3, q.key);
    for (const t of q.text) assert.ok(t.trim(), `${q.key} text`);
    if (['single', 'multi', 'yes_no'].includes(q.type)) {
      assert.ok(q.options?.length >= 2, `${q.key} options`);
      for (const o of q.options) { assert.equal(o.label.length, 3, `${q.key}.${o.value}`); o.label.forEach((l) => assert.ok(l.trim())); }
    }
  }
  assert.ok(QUESTIONS.length >= 40);
});

test('every branching rule leads to a question in the bank, using values its question can take', () => {
  const byKey = new Map(QUESTIONS.map((q) => [q.key, q]));
  const values = (k) => { const ref = byKey.get(k); return ref.type === 'yes_no' ? ['yes', 'no'] : ref.options.map((o) => o.value); };
  const check = (w, key) => {
    if (w.all || w.any) return (w.all ?? w.any).forEach((x) => check(x, key));
    assert.ok(byKey.has(w.key), `${key} depends on unknown ${w.key}`);
    for (const v of [].concat(w.eq ?? w.in ?? w.includes)) assert.ok(values(w.key).includes(v), `${key}: ${w.key} cannot be ${v}`);
  };
  for (const q of QUESTIONS) {
    const rules = q.next == null ? [] : Array.isArray(q.next) ? q.next : [q.next];
    for (const r of rules) {
      const target = Array.isArray(r) ? r[1] : r;
      if (Array.isArray(r)) check(r[0], q.key);
      assert.ok(target === null || byKey.has(target), `${q.key} leads to unknown ${target}`);
    }
  }
});

test('allergies, medicines and emergency symptoms are critical (confirmed on screen and by audio)', () => {
  const critical = new Set(QUESTIONS.filter((q) => q.critical).map((q) => q.key));
  for (const k of ['emergency.screen', 'allergy.any', 'allergy.list', 'drug.current_any', 'drug.current_list', 'pain.associated']) assert.ok(critical.has(k), k);
});

test('the first question is always the reason for the visit', () => {
  assert.equal(ROOT, 'cc.reason');
  assert.equal(nextQuestion({}).question.key, 'cc.reason');
  assert.equal(nextQuestion({}).question.type, 'text'); // in the patient's own words, typed or spoken
  assert.match(QUESTIONS.find((q) => q.key === 'cc.reason').text[0], /reason for your visit/);
});

test('each next question depends on the answers: different reasons and answers lead to different questions', () => {
  const chest = walk({ 'cc.main': 'chest_pain' }), fever = walk({ 'cc.main': 'fever' }), back = walk({ 'cc.main': 'back_pain' });
  for (const [a, b] of [[chest, fever], [chest, back], [fever, back]]) assert.notDeepEqual(a, b);
  assert.ok(fever.includes('fever.chills') && !chest.includes('fever.chills'));
  assert.ok(back.includes('back.bladder') && !fever.includes('back.bladder'));
  // the same reason branches on the answer just given
  assert.ok(walk({ 'cc.main': 'chest_pain', 'pain.onset': 'sudden' }).includes('pain.associated'));
  assert.ok(walk({ 'cc.main': 'chest_pain', 'pain.onset': 'gradual' }).includes('pain.timing'));
  assert.ok(walk({ 'cc.main': 'fever', 'fever.chills': 'yes' }).includes('fever.pattern'));
  assert.ok(walk({ 'cc.main': 'fever', 'fever.chills': 'no' }).includes('fever.rash'));
});

test('no answer path is longer than ten questions, and every path ends with medicines and allergies', () => {
  let paths = 0;
  const visit = (answers) => {
    const { question } = nextQuestion(answers);
    if (!question) {
      paths++;
      const keys = Object.keys(answers);
      const asked = keys.filter((k) => !answers[k].derived);
      assert.ok(asked.length <= MAX_QUESTIONS, `${asked.length} questions: ${asked.join(' > ')}`);
      assert.ok(keys.includes('drug.current_any') && keys.includes('allergy.any'), keys.join(' > '));
      return;
    }
    const derivable = ['cc.main', 'cc.duration'].includes(question.key);
    for (const v of [...choices(question), 'SKIP']) {
      visit({ ...answers, [question.key]: v === 'SKIP' ? { skipped: true } : { value: v } });
      // the same answer read from the patient's own words: not asked, so it leaves room for another question
      if (derivable && v !== 'SKIP') visit({ ...answers, [question.key]: { value: v, derived: true } });
    }
  };
  visit({});
  assert.ok(paths > 1000, `only ${paths} paths`);
});

test('the questions the red-flag rules read are on the path for their reason', () => {
  assert.ok(walk({ 'cc.main': 'chest_pain', 'pain.onset': 'sudden' }).includes('pain.associated'));
  assert.ok(walk({ 'cc.main': 'headache', 'pain.onset': 'sudden' }).includes('pain.severity'));
  assert.ok(walk({ 'cc.main': 'cough' }).includes('cough.blood'));
  for (const injury of ['yes', 'no']) assert.ok(walk({ 'cc.main': 'back_pain', 'back.injury': injury }).includes('back.bladder'));
  for (const cc of ['chest_pain', 'fever', 'back_pain', 'cough', 'abdominal_pain', 'headache', 'other']) assert.ok(walk({ 'cc.main': cc }).includes('emergency.screen'), cc);
});

test('a skipped question is "not answered", never "no", and does not open its follow-ups', () => {
  assert.ok(!walk({ 'drug.current_any': 'SKIP' }).includes('drug.current_list'));
  assert.ok(!walk({ 'drug.current_any': 'no' }).includes('drug.current_list'));
  assert.ok(walk({ 'drug.current_any': 'yes' }).includes('drug.current_list'));
  const h = structuredHistory(ans({ 'cc.reason': 'fever', 'cc.main': 'fever', 'emergency.screen': 'SKIP' }), 'en');
  const item = (k) => h.flatMap((s) => s.items).find((i) => i.key === k);
  assert.equal(item('emergency.screen').status, 'not_answered');
  assert.equal(item('emergency.screen').answer, null);
  assert.equal(item('cc.duration').status, 'not_asked');
});

test('changing an earlier answer makes the dependent answers stale', () => {
  const a = ans({ 'cc.reason': 'fever', 'cc.main': 'fever', 'emergency.screen': ['none'], 'cc.duration': 'd1_3', 'fever.chills': 'yes', 'fever.pattern': 'continuous' });
  assert.deepEqual(staleKeys(a), []);
  a['cc.main'] = { value: 'chest_pain' };
  assert.deepEqual(staleKeys(a).sort(), ['fever.chills', 'fever.pattern']);
});

test('answer validation by type', () => {
  const q = (k) => QUESTIONS.find((x) => x.key === k);
  assert.ok(validateAnswer(q('psh.any'), 'yes') && !validateAnswer(q('psh.any'), 'maybe'));
  assert.ok(validateAnswer(q('cc.main'), 'fever') && !validateAnswer(q('cc.main'), 'cold'));
  assert.ok(validateAnswer(q('pmh.conditions'), ['diabetes', 'tb']) && !validateAnswer(q('pmh.conditions'), []));
  assert.ok(!validateAnswer(q('pmh.conditions'), ['none', 'diabetes']), '"none" excludes the rest');
  assert.ok(validateAnswer(q('pain.severity'), 7) && !validateAnswer(q('pain.severity'), 11) && !validateAnswer(q('pain.severity'), '7'));
  assert.ok(validateAnswer(q('pain.site'), 'left side') && !validateAnswer(q('pain.site'), '   '));
});

test('every question can be answered by tapping: a valid answer exists and is presented in all three languages', () => {
  for (const q of QUESTIONS) {
    const candidates = q.options ? q.options.map((o) => (q.type === 'multi' ? [o.value] : o.value)) : q.type === 'number' ? [q.min ?? 0, q.max ?? 120] : ['free text'];
    for (const c of candidates) assert.ok(validateAnswer(q, c), `${q.key}: ${c}`);
    for (const lang of ['en', 'hi', 'mr']) {
      const p = presentQuestion(q, lang);
      assert.ok(p.text.trim());
      if (q.options) assert.equal(p.options.length, q.options.length);
    }
  }
});

test('the dialogue ends after the closing questions', () => {
  const keys = walk({ 'drug.current_any': 'yes', 'allergy.any': 'yes' });
  assert.deepEqual(keys.slice(-4), ['drug.current_any', 'drug.current_list', 'allergy.any', 'allergy.list']);
  assert.equal(keys[0], 'cc.reason');
});

test('the reason in the patient\'s own words fills in the complaint and how long, and is never guessed', () => {
  const m = createRuleNarrationMapper();
  assert.deepEqual(deriveFromReason(m.map('I have had a cough for 3 days')), { 'cc.main': 'cough', 'cc.duration': 'd1_3' });
  assert.deepEqual(deriveFromReason(m.map('मुझे 2 हफ्ते से बुखार है')), { 'cc.main': 'fever', 'cc.duration': 'w1_4' });
  assert.deepEqual(deriveFromReason(m.map('kamar dard hai')), { 'cc.main': 'back_pain' });
  assert.deepEqual(deriveFromReason(m.map('my knee hurts')), {}); // nothing named: the patient is asked which is closest
  assert.deepEqual(deriveFromReason(m.map('fever and cough')), {}); // two named: asked, not guessed
});

test('answers read from the reason are kept until the path reaches them, and are not counted as questions asked', () => {
  const a = { 'cc.reason': { value: 'cough for 3 days' }, 'cc.main': { value: 'cough', derived: true }, 'cc.duration': { value: 'd1_3', derived: true } };
  assert.deepEqual(staleKeys(a), []);
  const { question, answered } = nextQuestion(a);
  assert.equal(question.key, 'emergency.screen');
  assert.equal(answered, 1);
});

test('questions after the reason are phrased around it, in every language', () => {
  const a = ans({ 'cc.reason': 'I have a cough', 'cc.main': 'cough', 'emergency.screen': ['none'], 'cc.duration': 'd1_3' });
  const q = nextQuestion(a).question;
  assert.equal(presentQuestion(q, 'en', a).text, 'About your cough: Have you coughed up blood?');
  assert.match(presentQuestion(q, 'hi', a).text, /^खाँसी के बारे में: /);
  assert.match(presentQuestion(q, 'mr', a).text, /^खोकला बद्दल: /);
  // something else: the patient's own words are used
  const o = ans({ 'cc.reason': 'my knee hurts', 'cc.main': 'other', 'emergency.screen': ['none'], 'cc.duration': 'd1_3' });
  assert.match(presentQuestion(nextQuestion(o).question, 'en', o).text, /^About “my knee hurts”: /);
  // the safety questions stay exactly as written
  assert.equal(presentQuestion(QUESTIONS.find((x) => x.key === 'emergency.screen'), 'en', a).text, 'Are you having any of these right now?');
  assert.equal(presentQuestion(QUESTIONS.find((x) => x.key === 'allergy.any'), 'en', a).text, 'Are you allergic to any medicine or food?');
});

test('narration mapping reports only what the words contain', () => {
  const m = createRuleNarrationMapper();
  assert.deepEqual(m.map('chest pain for 3 days').complaints, ['chest_pain']);
  assert.equal(m.map('chest pain for 3 days').duration.key, 'd1_3');
  assert.equal(m.map('मुझे 2 हफ्ते से बुखार है').duration.key, 'w1_4');
  assert.deepEqual(m.map('मला ३ दिवसांपासून ताप आहे').complaints, ['fever']);
  assert.equal(m.map('मला ३ दिवसांपासून ताप आहे').duration.key, 'd1_3');
  assert.deepEqual(m.map('I feel strange').complaints, []);
  assert.equal(m.map('I feel strange').duration, null); // nothing invented
});
