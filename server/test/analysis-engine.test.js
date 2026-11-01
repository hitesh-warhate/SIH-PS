import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyze } from '../src/analysis/engine.js';
import { compareNames, lookupDrug, lookupTest, normalizeSex, parseAllergies, parsePatientMedicines } from '../src/analysis/normalize.js';
import { extract } from '../src/documents/extract.js';
import { CASES, PATIENT } from './fixtures/analysis-cases.js';

// Phase 5 Definition of Done 1: the synthetic multi-file set gives the expected output for all five analysis kinds.
test('the library has at least 10 synthetic multi-file cases', () => assert.ok(CASES.length >= 10));

for (const c of CASES) {
  test(`case: ${c.id} (${c.covers.join('; ')})`, () => {
    const result = analyze(c.input);
    assert.deepEqual(Object.keys(result).sort(), ['consistency', 'interactions', 'lab_table', 'med_reconciliation', 'timeline']);
    c.check(result, assert);
  });
}

test('the same input always gives the same output, whatever else is going on', () => {
  for (const c of CASES) {
    const first = JSON.stringify(analyze(c.input));
    assert.equal(JSON.stringify(analyze(JSON.parse(JSON.stringify(c.input)))), first, c.id);
  }
});

// Definition of Done 6: direction of change, no clinical interpretation wording.
test('the lab table carries direction and flags but no interpretation wording', () => {
  const words = /improv|worsen|deteriorat|control|stable|concern|abnormal|critical|severe|diagnos|resolv|respond|trend|suggest|indicat|likely|risk/i;
  for (const c of CASES) {
    const table = analyze(c.input).lab_table;
    assert.equal(words.test(JSON.stringify(table)), false, c.id);
    for (const t of table.tests) {
      assert.ok([null, 'up', 'down', 'unchanged'].includes(t.direction), `${c.id}: ${t.direction}`);
      for (const p of t.points) assert.ok(['low', 'high', 'normal', 'range_unavailable'].includes(p.flag));
    }
  }
});

// Definition of Done 5: unknown is flagged, never guessed.
test('names that are not in the dictionaries are never matched by similarity', () => {
  assert.equal(lookupDrug('Metformim').known, false, 'a one-letter OCR slip is not silently corrected');
  assert.equal(lookupDrug('Telma H').known, false);
  assert.equal(lookupDrug('').known, false);
  assert.equal(lookupDrug('Metformin SR').generic, 'metformin', 'a presentation word is not a different drug');
  assert.equal(lookupDrug('Taxim-O').generic, 'cefixime');
  assert.equal(lookupTest('Hb').test.canonical, 'Hemoglobin');
  assert.equal(lookupTest('Hemoglobbin').known, false);
});

test('allergy and medicine phrases are split and matched without guessing', () => {
  assert.deepEqual(parseAllergies('Penicillin and sulfa; aspirin, dust').map((x) => x.kind), ['class', 'class', 'drug', 'other']);
  assert.deepEqual(parsePatientMedicines('Metformin 500 mg, Amlodipine').map((x) => [x.name, x.dose]), [['Metformin', '500 mg'], ['Amlodipine', null]]);
});

test('name comparison allows initials, order and one-letter typos but not different people', () => {
  const m = (a, b) => compareNames(a, b, { matchRatio: 0.67 }).result;
  assert.equal(m('Rakesh Kumar', 'Kumar Rakesh'), 'match');
  assert.equal(m('Mr. R. Kumar', 'Rakesh Kumar'), 'match');
  assert.equal(m('Rakesh Kumarr', 'Rakesh Kumar'), 'match');
  assert.equal(m('Rakesh Sharma', 'Rakesh Kumar'), 'partial');
  assert.equal(m('Sunita Devi', 'Rakesh Kumar'), 'mismatch');
  assert.equal(m('राकेश कुमार', 'Rakesh Kumar'), 'not_comparable', 'different scripts are not compared');
  assert.equal(normalizeSex('F'), 'female');
  assert.equal(normalizeSex('पुरुष'), 'male');
  assert.equal(normalizeSex('?'), null);
});

test('the engine reads no clock: "today" is the visit date it is given', () => {
  const c = CASES.find((x) => x.id === 'missing-and-future-dates');
  const count = (asOf) => analyze({ ...c.input, asOf }).consistency.issues.filter((i) => i.code === 'date_in_future').length;
  assert.equal(count('2026-05-20'), 1);
  assert.equal(count('2030-01-01'), 0, 'the same file is no longer in the future');
  assert.equal(PATIENT.sex, 'male');
});

// The extractor reads who a document is about, so the engine has something to compare.
test('the extractor reads patient name, age and sex from the usual layouts', () => {
  const page = (...texts) => [{ page: 1, lines: texts.map((text, i) => ({ text, confidence: 0.95, bbox: { x0: 0, y0: i * 40, x1: 500, y1: i * 40 + 30 } })) }];
  const ids = (pages) => Object.fromEntries(extract(pages).entities.filter((e) => e.entity_type.startsWith('patient_')).map((e) => [e.entity_type, e.value]));
  assert.deepEqual(ids(page('Patient Name: Rakesh Kumar Age: 58 Sex: Male', 'Date: 12/03/2026')), { patient_name: 'Rakesh Kumar', patient_age: '58', patient_sex: 'Male' });
  assert.deepEqual(ids(page('Name: Sunita Devi', 'Age/Sex: 34/F')), { patient_name: 'Sunita Devi', patient_age: '34', patient_sex: 'F' });
  assert.deepEqual(ids(page('रोगी का नाम: राकेश कुमार आयु: ५८ लिंग: पुरुष')), { patient_name: 'राकेश कुमार', patient_age: '58', patient_sex: 'पुरुष' });
  assert.deepEqual(ids(page('Dr. A. Sharma Clinic', 'Tab Metformin 500 mg twice daily')), {}, 'no identity lines, no identity fields');
  assert.equal(extract(page('Age: 58 Y')).labs.length, 0, 'an age line is not a lab result');
});
