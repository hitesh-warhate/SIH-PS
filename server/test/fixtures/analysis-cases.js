// Synthetic multi-file cases for the cross-document analysis (Phase 5). NO real patient data: every name, drug and value is invented.
// Each case is an engine input plus a `check(result, assert)` that states the expected output. Together they cover the Definition of
// Done list: brand and generic duplicates, a dose change, rising and falling labs, a lab with no range, a wrong-patient file,
// conflicting data, a missing date, and a patient who reports no medicines while a prescription lists some.

export const PATIENT = { name: 'Rakesh Kumar', dob: '1968-01-01', sex: 'male' }; // 58 years old in 2026
const NO_ANSWERS = { currentAny: null, currentList: null, allergyAny: null, allergyList: null };

export const med = (name, dose, frequency, o = {}) => ({ name, form: 'tab', dose, frequency, date: null, needsReview: false, ...o });
export const lab = (testName, value, unit, refLow, refHigh, date = null, o = {}) => ({ testName, value, unit, refLow, refHigh, date, needsReview: false, ...o });
export const doc = (id, o = {}) => ({
  id, name: `${id}.png`, docType: 'prescription', date: null, sortOrder: 0, status: 'done', attentionReason: null, textHash: null,
  meds: [], labs: [], diagnoses: [], procedures: [], identity: { name: null, age: null, sex: null }, ...o,
});
const input = (documents, answers = {}, over = {}) => ({
  asOf: '2026-05-20', patient: PATIENT, answers: { ...NO_ANSWERS, ...answers },
  documents: documents.map((d, i) => ({ ...d, sortOrder: i + 1 })), ...over,
});
const issue = (r, code) => r.consistency.issues.filter((i) => i.code === code);
const group = (r, name) => r.med_reconciliation.medications.find((m) => m.name === name);
const series = (r, test) => r.lab_table.tests.find((t) => t.test === test);

export const CASES = [
  {
    id: 'brand-and-generic-duplicates', covers: ['duplicate drugs under brand and generic names', 'timeline order'],
    input: input([
      doc('rx-b', { date: '2026-03-12', meds: [med('Metformin', '500 mg', 'twice daily (1-0-1)')] }),
      doc('rx-a', { date: '2026-01-10', meds: [med('Glycomet', '500 mg', 'twice daily')] }),
    ], { currentAny: 'yes', currentList: 'metformin' }),
    check(r, a) {
      a.deepEqual(r.timeline.events.map((e) => e.documentId), ['rx-a', 'rx-b'], 'ordered by date, not by upload order');
      const m = group(r, 'metformin');
      a.equal(r.med_reconciliation.medications.length, 1, 'brand and generic merge into one drug');
      a.deepEqual(m.writtenNames, ['Glycomet', 'Metformin', 'metformin']);
      a.equal(m.entries.length, 3);
      a.equal(m.status, 'documents_and_patient');
      a.equal(m.doseChanges.length, 0, 'same dose and frequency is not a change');
      a.equal(m.entries.find((e) => e.written === 'Glycomet').brand, true);
    },
  },
  {
    id: 'dose-change', covers: ['a dose change'],
    input: input([
      doc('rx-1', { date: '2026-01-05', meds: [med('Amlodipine', '5 mg', 'once daily'), med('Atorvastatin', '10 mg', 'once daily')] }),
      doc('rx-2', { date: '2026-04-08', meds: [med('Amlong', '10 mg', 'once daily'), med('Atorvastatin', '10 mg', 'twice daily')] }),
    ]),
    check(r, a) {
      const am = group(r, 'amlodipine');
      a.equal(am.doseChanges.length, 1);
      a.equal(am.doseChanges[0].kind, 'dose');
      a.equal(am.doseChanges[0].direction, 'increase');
      a.equal(am.doseChanges[0].from.dose, '5 mg');
      a.equal(am.doseChanges[0].to.dose, '10 mg');
      a.equal(group(r, 'atorvastatin').doseChanges[0].kind, 'frequency');
      a.equal(r.med_reconciliation.totals.withDoseChange, 2);
    },
  },
  {
    id: 'labs-rising-and-falling', covers: ['out-of-range labs with rising and falling values', 'direction of change only'],
    input: input([
      doc('lab-1', { docType: 'lab_report', date: '2025-10-02', labs: [lab('HbA1c', 7.2, '%', null, 5.7), lab('Creatinine', 1.4, 'mg/dL', 0.6, 1.2), lab('TSH', 6.2, 'uIU/mL', 0.4, 4)] }),
      doc('lab-2', { docType: 'lab_report', date: '2026-01-14', labs: [lab('HbA1c', 7.8, '%', null, 5.7), lab('TSH', 6.2, 'uIU/mL', 0.4, 4)] }),
      doc('lab-3', { docType: 'lab_report', date: '2026-04-20', labs: [lab('HbA1c', 8.4, '%', null, 5.7), lab('Creatinine', 1.1, 'mg/dL', 0.6, 1.2)] }),
    ]),
    check(r, a) {
      const h = series(r, 'HbA1c');
      a.equal(h.direction, 'up');
      a.deepEqual(h.points.map((p) => p.value), [7.2, 7.8, 8.4]);
      a.deepEqual(h.points.map((p) => p.change?.direction ?? null), [null, 'up', 'up']);
      a.equal(h.latest.flag, 'high');
      const c = series(r, 'Creatinine');
      a.equal(c.direction, 'down');
      a.equal(c.points[0].flag, 'high');
      a.equal(c.latest.flag, 'normal', 'back inside its range');
      a.equal(series(r, 'TSH').direction, 'unchanged', 'two equal results; the third report did not repeat the test');
      a.equal(series(r, 'TSH').points[1].change.direction, 'unchanged');
      a.equal(r.lab_table.totals.outOfRange, 2);
    },
  },
  {
    id: 'lab-without-range', covers: ['a lab with no reference range'],
    input: input([doc('lab-1', { docType: 'lab_report', date: '2026-02-20', labs: [lab('Total Cholesterol', 231, 'mg/dL', null, null)] })]),
    check(r, a) {
      const t = series(r, 'Total Cholesterol');
      a.equal(t.points[0].flag, 'range_unavailable');
      a.equal(r.lab_table.totals.outOfRange, 0, 'no range, so nothing is called out of range');
      a.equal(t.direction, null, 'one result has no direction');
    },
  },
  {
    id: 'wrong-patient-file', covers: ['a wrong-patient file'],
    input: input([
      doc('rx-own', { date: '2026-03-12', identity: { name: 'Rakesh Kumar', age: 58, sex: 'M' }, meds: [med('Metformin', '500 mg', 'twice daily')] }),
      doc('rx-other', { date: '2026-03-14', identity: { name: 'Sunita Devi', age: 34, sex: 'Female' }, meds: [med('Cetirizine', '10 mg', 'at bedtime')] }),
      doc('rx-partial', { date: '2026-03-15', identity: { name: 'Rakesh Sharma', age: 58, sex: 'M' }, meds: [med('Paracetamol', '500 mg', 'as needed')] }),
      doc('rx-initials', { date: '2026-03-16', identity: { name: 'R. Kumar', age: 57, sex: 'Male' }, meds: [med('Omeprazole', '20 mg', 'once daily')] }),
    ]),
    check(r, a) {
      const w = issue(r, 'possible_wrong_patient');
      a.equal(w.length, 2, 'the right patient and initials are not flagged');
      const other = w.find((i) => i.documentId === 'rx-other');
      a.equal(other.severity, 'attention');
      a.equal(other.params.likelihood, 'high');
      a.deepEqual(other.params.signals, ['name', 'sex', 'age']);
      const partial = w.find((i) => i.documentId === 'rx-partial');
      a.equal(partial.severity, 'info');
      a.equal(partial.params.likelihood, 'low');
      a.deepEqual(partial.params.signals, ['name_partial']);
    },
  },
  {
    id: 'conflicting-data', covers: ['conflicting data between files'],
    input: input([
      doc('lab-a', { docType: 'lab_report', date: '2026-02-20', labs: [lab('Hemoglobin', 10.2, 'g/dL', 12, 15.5)], meds: [med('Metformin', '500 mg', 'twice daily')] }),
      doc('lab-b', { docType: 'lab_report', date: '2026-02-20', labs: [lab('Hemoglobin', 11.9, 'g/dL', 12, 15.5)], meds: [med('Metformin', '1000 mg', 'twice daily')] }),
    ]),
    check(r, a) {
      const l = issue(r, 'lab_conflict');
      a.equal(l.length, 1);
      a.equal(l[0].params.test, 'Hemoglobin');
      a.equal(issue(r, 'medication_conflict').length, 1);
      a.equal(group(r, 'metformin').doseChanges.length, 0, 'a same-day disagreement is a conflict, not a dose change');
      a.equal(series(r, 'Hemoglobin').points[1].change.sameDate, true);
      a.equal(series(r, 'Hemoglobin').direction, null);
    },
  },
  {
    id: 'missing-and-future-dates', covers: ['a missing date'],
    input: input([
      doc('rx-undated', { meds: [med('Cetirizine', '10 mg', 'at bedtime')], labs: [lab('Hemoglobin', 11, 'g/dL', 12, 15.5)] }),
      doc('rx-dated', { date: '2026-04-01', meds: [med('Paracetamol', '650 mg', 'as needed')] }),
      doc('rx-future', { date: '2027-01-01' }),
    ]),
    check(r, a) {
      a.deepEqual(r.timeline.events.map((e) => e.documentId), ['rx-dated', 'rx-future', 'rx-undated'], 'undated last');
      a.equal(r.timeline.events[2].dateMissing, true);
      a.equal(r.timeline.undated, 1);
      a.equal(issue(r, 'date_missing')[0].documentId, 'rx-undated');
      a.equal(issue(r, 'date_in_future')[0].documentId, 'rx-future');
      const h = series(r, 'Hemoglobin');
      a.equal(h.points[0].dateMissing, true);
      a.equal(h.latest, null, 'an undated result is shown but not placed in a direction');
      a.equal(group(r, 'cetirizine').entries[0].dateMissing, true);
    },
  },
  {
    id: 'patient-reports-no-medicines', covers: ['a patient who reports no medicines while a prescription lists some'],
    input: input([doc('rx-1', { date: '2026-03-12', meds: [med('Metformin', '500 mg', 'twice daily'), med('Amlodipine', '5 mg', 'once daily')] })], { currentAny: 'no' }),
    check(r, a) {
      const i = issue(r, 'patient_reports_no_medicines');
      a.equal(i.length, 1);
      a.equal(i[0].severity, 'warning');
      a.deepEqual(i[0].params.medicines, ['amlodipine', 'metformin']);
      a.equal(r.med_reconciliation.patientReport.takingAny, false);
    },
  },
  {
    id: 'interactions-and-allergy', covers: ['interaction flags', 'allergy conflicts'],
    input: input([
      doc('rx-1', { date: '2026-02-01', meds: [med('Warf', '3 mg', 'once daily'), med('Ecosprin', '75 mg', 'once daily')] }),
      doc('rx-2', { date: '2026-03-01', meds: [med('Mox', '500 mg', 'three times daily'), med('Metformin', '500 mg', 'twice daily')] }),
    ], { currentAny: 'yes', currentList: 'Brufen', allergyAny: 'yes', allergyList: 'penicillin, peanuts' }),
    check(r, a) {
      const pairs = r.interactions.interactions.map((i) => [i.a, i.b].sort().join('+'));
      a.ok(pairs.includes('aspirin+warfarin'), 'warfarin and aspirin, written as brands');
      a.ok(pairs.includes('ibuprofen+warfarin'), 'warfarin and a patient-reported brufen');
      a.equal(r.interactions.interactions[0].severity, 'major', 'major first');
      a.equal(r.interactions.interactions[0].effect, 'bleeding_risk');
      a.equal(r.interactions.allergyConflicts.length, 1);
      a.equal(r.interactions.allergyConflicts[0].drug, 'amoxicillin');
      a.equal(r.interactions.allergyConflicts[0].match, 'class');
      a.deepEqual(r.interactions.allergies.items.map((x) => x.kind), ['class', 'other'], 'a food allergy is kept for display, not matched to a drug');
      a.equal(r.interactions.source.status.startsWith('draft'), true, 'the draft status of the source travels with the result');
    },
  },
  {
    id: 'unknown-drug-and-test', covers: ['an unknown drug or test is flagged, not guessed'],
    input: input([
      doc('rx-1', { date: '2026-03-12', meds: [med('Zyxolan', '10 mg', 'once daily'), med('Telma H', '40 mg', 'once daily'), med('Warfarin', '3 mg', 'once daily')] }),
      doc('lab-1', { docType: 'lab_report', date: '2026-03-12', labs: [lab('Glucotrex Index', 4.2, 'au', 1, 5)] }),
    ]),
    check(r, a) {
      for (const n of ['Zyxolan', 'Telma H']) {
        const m = group(r, n);
        a.equal(m.known, false, `${n} is not in the dictionary`);
        a.equal(m.needsReview, true);
      }
      a.equal(group(r, 'telmisartan'), undefined, 'a combination product is not quietly turned into one drug');
      a.deepEqual(r.interactions.unchecked.map((u) => u.name).sort(), ['Telma H', 'Zyxolan']);
      a.equal(issue(r, 'unknown_drug').length, 2);
      const t = series(r, 'Glucotrex Index');
      a.equal(t.known, false);
      a.equal(t.needsReview, true);
      a.equal(issue(r, 'unknown_test').length, 1);
    },
  },
  {
    id: 'units-converted-only-when-safe', covers: ['unit handling'],
    input: input([
      doc('lab-1', { docType: 'lab_report', date: '2026-01-10', labs: [lab('Fasting Glucose', 142, 'mg/dL', 70, 100), lab('Creatinine', 1.0, 'mg/dL', 0.6, 1.2), lab('Platelet Count', 180000, '/cumm', null, null)] }),
      doc('lab-2', { docType: 'lab_report', date: '2026-04-10', labs: [lab('Fasting Glucose', 7.1, 'mmol/L', 3.9, 5.6), lab('Creatinine', 88, 'furlongs', null, null)] }),
    ]),
    check(r, a) {
      const g = series(r, 'Fasting Glucose');
      a.equal(g.unit, 'mg/dL');
      a.equal(g.points[1].converted, true);
      a.deepEqual(g.points[1].original, { value: 7.1, unit: 'mmol/L' });
      a.ok(Math.abs(g.points[1].value - 127.91) < 0.01);
      a.ok(Math.abs(g.points[1].refHigh - 100.9) < 0.1, 'the range is converted with the value');
      a.equal(g.points[1].flag, 'high');
      a.equal(g.direction, 'down');
      const c = series(r, 'Creatinine');
      a.equal(c.points[1].unitMismatch, true, 'an unknown unit is not converted');
      a.equal(c.points[1].needsReview, true);
      a.equal(c.direction, null, 'a result in an unknown unit is not compared');
      a.equal(issue(r, 'unit_not_comparable').length, 1);
      a.equal(series(r, 'Platelet Count').points[0].value, 1.8);
    },
  },
  {
    id: 'duplicates-in-a-file-and-across-files', covers: ['duplicates'],
    input: input([
      doc('rx-1', { date: '2026-03-12', textHash: 'abc', meds: [med('Crocin', '650 mg', 'as needed'), med('Paracetamol', '500 mg', 'as needed')] }),
      doc('rx-copy', { date: '2026-03-12', textHash: 'abc', meds: [med('Crocin', '650 mg', 'as needed'), med('Paracetamol', '500 mg', 'as needed')] }),
    ]),
    check(r, a) {
      const p = group(r, 'paracetamol');
      a.equal(p.duplicatesInDocument.length, 2, 'two names for one drug on one prescription, in each file');
      a.deepEqual(p.duplicatesInDocument[0].written, ['Crocin', 'Paracetamol']);
      a.deepEqual(issue(r, 'duplicate_document')[0].params.documentIds, ['rx-1', 'rx-copy']);
    },
  },
  {
    id: 'nothing-to-analyse', covers: ['an empty encounter'],
    input: input([]),
    check(r, a) {
      a.deepEqual(r.timeline.events, []);
      a.deepEqual(r.med_reconciliation.medications, []);
      a.deepEqual(r.lab_table.tests, []);
      a.deepEqual(r.interactions.interactions, []);
      a.deepEqual(r.consistency.issues, []);
    },
  },
];
