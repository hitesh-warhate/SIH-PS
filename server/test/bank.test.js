import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAIN_COMPLAINTS, QUESTIONS, SECTIONS } from '../config/questions.v1.js';
import { activeQuestions, nextQuestion, presentQuestion, staleKeys, validateAnswer, structuredHistory } from '../src/interview/dialogue.js';
import { createRuleNarrationMapper } from '../src/interview/narration.js';

const TYPES = ['yes_no', 'single', 'multi', 'number', 'text'];
const ans = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v === 'SKIP' ? { skipped: true } : { value: v }]));
const followUps = (cc) => activeQuestions(ans({ 'emergency.screen': ['none'], 'cc.main': cc })).map((q) => q.key).filter((k) => !['emergency.screen', 'cc.main'].includes(k) && QUESTIONS.find((q) => q.key === k).when);

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

test('every condition refers to an earlier question and a value that question can take', () => {
  const pos = new Map(QUESTIONS.map((q, i) => [q.key, i]));
  const walk = (w, i, key) => {
    if (w.all || w.any) return (w.all ?? w.any).forEach((x) => walk(x, i, key));
    const ref = QUESTIONS[pos.get(w.key)];
    assert.ok(ref && pos.get(w.key) < i, `${key} depends on ${w.key}, which must come earlier`);
    const allowed = ref.type === 'yes_no' ? ['yes', 'no'] : ref.options.map((o) => o.value);
    for (const v of [].concat(w.eq ?? w.in ?? w.includes)) assert.ok(allowed.includes(v), `${key}: ${w.key} cannot be ${v}`);
  };
  QUESTIONS.forEach((q, i) => q.when && walk(q.when, i, q.key));
});

test('allergies, medicines and emergency symptoms are critical (confirmed on screen and by audio)', () => {
  const critical = new Set(QUESTIONS.filter((q) => q.critical).map((q) => q.key));
  for (const k of ['emergency.screen', 'allergy.any', 'allergy.list', 'drug.current_any', 'drug.current_list', 'pain.associated']) assert.ok(critical.has(k), k);
});

test('follow-up questions differ for chest pain, fever and back pain, and pain uses SOCRATES', () => {
  const chest = followUps('chest_pain'), fever = followUps('fever'), back = followUps('back_pain');
  for (const [a, b] of [[chest, fever], [chest, back], [fever, back]]) assert.notDeepEqual(a, b);
  assert.ok(fever.includes('fever.pattern') && !chest.includes('fever.pattern'));
  assert.ok(back.includes('back.leg_numb') && !fever.includes('back.leg_numb'));
  const socrates = ['pain.site', 'pain.onset', 'pain.character', 'pain.radiation', 'pain.associated', 'pain.timing', 'pain.exacerbating', 'pain.relieving', 'pain.severity'];
  for (const cc of PAIN_COMPLAINTS) for (const k of socrates) assert.ok(followUps(cc).includes(k), `${cc} needs ${k}`);
  for (const k of socrates) assert.ok(!followUps('fever').includes(k), `fever must not use ${k}`);
});

test('a skipped question is "not answered", never "no", and does not open its follow-ups', () => {
  const keys = (a) => activeQuestions(a).map((q) => q.key);
  assert.ok(!keys(ans({ 'psh.any': 'SKIP' })).includes('psh.details'));
  assert.ok(!keys(ans({ 'psh.any': 'no' })).includes('psh.details'));
  assert.ok(keys(ans({ 'psh.any': 'yes' })).includes('psh.details'));
  const h = structuredHistory({ 'psh.any': { skipped: true }, 'allergy.any': { value: 'no' } }, 'en');
  const item = (k) => h.flatMap((s) => s.items).find((i) => i.key === k);
  assert.equal(item('psh.any').status, 'not_answered');
  assert.equal(item('psh.any').answer, null);
  assert.equal(item('allergy.any').answer, 'No');
  assert.equal(item('drug.current_any').status, 'not_asked');
});

test('changing an earlier answer makes the dependent answers stale', () => {
  const a = ans({ 'emergency.screen': ['none'], 'cc.main': 'fever', 'fever.pattern': 'continuous' });
  assert.deepEqual(staleKeys(a), []);
  a['cc.main'] = { value: 'chest_pain' };
  assert.deepEqual(staleKeys(a), ['fever.pattern']);
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
    for (const c of candidates) assert.ok(validateAnswer(q, q.type === 'yes_no' ? c : c), `${q.key}: ${c}`);
    for (const lang of ['en', 'hi', 'mr']) {
      const p = presentQuestion(q, lang);
      assert.ok(p.text.trim());
      if (q.options) assert.equal(p.options.length, q.options.length);
    }
  }
});

test('the dialogue walks the whole ontology to the end', () => {
  const answers = {};
  let guard = 0;
  for (;;) {
    const { question } = nextQuestion(answers);
    if (!question) break;
    const v = question.type === 'yes_no' ? 'yes' : question.type === 'multi' ? [question.options[0].value]
      : question.type === 'single' ? question.options[0].value : question.type === 'number' ? 3 : 'text';
    answers[question.key] = { value: v };
    assert.ok(++guard < 80, 'dialogue did not terminate');
  }
  assert.ok(guard >= 30);
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
