import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, RULESET_VERSION } from '../config/redflag-rules.v1.js';
import { QUESTIONS } from '../config/questions.v1.js';
import { evaluateRules } from '../src/alerts/rules.js';
import { SCENARIOS } from './scenarios.js';

const toAnswers = (shorthand) => Object.fromEntries(Object.entries(shorthand).map(([k, v]) => [k, v === 'SKIP' ? { skipped: true } : { value: v }]));

test('the scenario suite has at least 20 scenarios, mixing must-alert and must-not-alert cases', () => {
  const alert = SCENARIOS.filter((s) => s.mustAlert), not = SCENARIOS.filter((s) => s.mustNot);
  assert.ok(SCENARIOS.length >= 20);
  assert.ok(alert.length >= 10 && not.length >= 10, `${alert.length} must-alert, ${not.length} must-not`);
});

test('every must-alert scenario raises every expected rule: zero misses', () => {
  const misses = [];
  for (const s of SCENARIOS.filter((x) => x.mustAlert)) {
    const fired = evaluateRules(toAnswers(s.answers)).map((m) => m.rule.id);
    for (const id of s.mustAlert) if (!fired.includes(id)) misses.push(`${s.name}: missed ${id} (fired ${fired.join(', ') || 'nothing'})`);
  }
  assert.deepEqual(misses, []);
});

test('no must-not-alert scenario raises anything', () => {
  const falseAlarms = [];
  for (const s of SCENARIOS.filter((x) => x.mustNot)) {
    const fired = evaluateRules(toAnswers(s.answers)).map((m) => m.rule.id);
    if (fired.length) falseAlarms.push(`${s.name}: fired ${fired.join(', ')}`);
  }
  assert.deepEqual(falseAlarms, []);
});

test('the rules are well formed and versioned: id, version, level, a reason in three languages, valid conditions', () => {
  assert.ok(Number.isInteger(RULESET_VERSION) && RULESET_VERSION >= 1);
  const ids = new Set();
  const byKey = new Map(QUESTIONS.map((q) => [q.key, q]));
  const walk = (w, id) => {
    if (w.all || w.any) return (w.all ?? w.any).forEach((x) => walk(x, id));
    const q = byKey.get(w.key);
    assert.ok(q, `${id}: unknown question ${w.key}`);
    const allowed = q.type === 'yes_no' ? ['yes', 'no'] : q.options?.map((o) => o.value);
    for (const v of [].concat(w.eq ?? w.in ?? w.includes ?? [])) assert.ok(allowed.includes(v), `${id}: ${w.key} cannot be ${v}`);
    if ('gte' in w) assert.equal(q.type, 'number', `${id}: gte needs a number question`);
  };
  for (const r of RULES) {
    assert.ok(!ids.has(r.id), `duplicate ${r.id}`);
    ids.add(r.id);
    assert.ok(Number.isInteger(r.version) && r.version >= 1, r.id);
    assert.ok(['emergency', 'attention'].includes(r.level), r.id);
    assert.equal(r.reason.length, 3, r.id);
    r.reason.forEach((t) => assert.ok(t.trim(), `${r.id} reason`));
    walk(r.when, r.id);
  }
});

test('every critical question that can be skipped has a rule that notices the skip', () => {
  const noticed = new Set(RULES.filter((r) => r.when.skipped).map((r) => r.when.key));
  for (const k of ['emergency.screen', 'allergy.any', 'drug.current_any']) assert.ok(noticed.has(k), `skipping ${k} must alert staff`);
});

test('a skipped answer never satisfies a symptom condition (no guessing from silence)', () => {
  assert.deepEqual(evaluateRules(toAnswers({ 'cough.blood': 'SKIP', 'back.bladder': 'SKIP' })).map((m) => m.rule.id), []);
});
