// Lab test dictionary v1 (Phase 5): common names for each test, its canonical unit, and the unit conversions that are safe.
// STATUS: DRAFT. Not reviewed by a clinician or laboratory specialist. A test that is not in this list is never guessed: it is
// flagged for review and compared only with itself. A unit that has no entry in `convert` is never converted: a mismatch is flagged.
// `convert[unit]` turns a value in `unit` into the canonical unit. Units are written in lower case with µ as u and no spaces.

export const LABS_VERSION = 1;
export const LABS_STATUS = 'draft: pending clinician and laboratory review';

const x = (factor) => (v) => v * factor;
const t = (canonical, unit, names, convert = {}) => ({ canonical, unit, names, convert });

export const LAB_TESTS = [
  t('Hemoglobin', 'g/dL', ['hemoglobin', 'haemoglobin', 'hb', 'hgb', 'हीमोग्लोबिन'], { 'g/l': x(0.1) }),
  t('Fasting Glucose', 'mg/dL', ['fasting glucose', 'fasting blood sugar', 'fasting blood glucose', 'fbs', 'fbg', 'glucose fasting', 'fasting sugar'], { 'mmol/l': x(18.016) }),
  t('Postprandial Glucose', 'mg/dL', ['postprandial glucose', 'post prandial glucose', 'post prandial blood sugar', 'postprandial blood sugar', 'ppbs', 'pp glucose'], { 'mmol/l': x(18.016) }),
  t('Random Glucose', 'mg/dL', ['random glucose', 'random blood sugar', 'random blood glucose', 'rbs'], { 'mmol/l': x(18.016) }),
  // "Glucose" with no timing could be any of the three above, so it is kept apart rather than merged with one of them.
  t('Glucose (timing not stated)', 'mg/dL', ['glucose', 'blood sugar', 'blood glucose', 'sugar', 'ग्लूकोज', 'शुगर'], { 'mmol/l': x(18.016) }),
  t('HbA1c', '%', ['hba1c', 'glycated hemoglobin', 'glycosylated hemoglobin', 'a1c'], { 'mmol/mol': (v) => v * 0.0915 + 2.15 }),
  t('Creatinine', 'mg/dL', ['creatinine', 'serum creatinine', 'क्रिएटिनिन'], { 'umol/l': x(1 / 88.4) }),
  t('Urea', 'mg/dL', ['urea', 'blood urea', 'serum urea'], { 'mmol/l': x(6.006) }),
  t('Total Cholesterol', 'mg/dL', ['total cholesterol', 'cholesterol', 'serum cholesterol', 'कोलेस्ट्रॉल'], { 'mmol/l': x(38.67) }),
  t('LDL Cholesterol', 'mg/dL', ['ldl', 'ldl cholesterol', 'ldl-c'], { 'mmol/l': x(38.67) }),
  t('HDL Cholesterol', 'mg/dL', ['hdl', 'hdl cholesterol', 'hdl-c'], { 'mmol/l': x(38.67) }),
  t('Triglycerides', 'mg/dL', ['triglycerides', 'triglyceride', 'tg'], { 'mmol/l': x(88.57) }),
  t('Platelet Count', 'lakhs/cumm', ['platelet count', 'platelets', 'platelet', 'plt'], { '/cumm': x(1e-5), 'cells/cumm': x(1e-5), '/ul': x(1e-5), '10^3/ul': x(0.01) }),
  t('Total Leukocyte Count', 'cells/cumm', ['wbc', 'wbc count', 'total leukocyte count', 'total leucocyte count', 'tlc', 'white blood cells'], { '/cumm': x(1), '/ul': x(1), '10^3/ul': x(1000) }),
  t('Red Blood Cell Count', 'million/cumm', ['rbc', 'rbc count', 'red blood cells', 'red blood cell count'], { '10^6/ul': x(1) }),
  t('TSH', 'uIU/mL', ['tsh', 'thyroid stimulating hormone'], { 'miu/l': x(1) }),
  t('Total Bilirubin', 'mg/dL', ['total bilirubin', 'bilirubin total', 'bilirubin'], { 'umol/l': x(1 / 17.1) }),
  t('SGPT (ALT)', 'IU/L', ['sgpt', 'alt', 'alanine aminotransferase'], { 'u/l': x(1) }),
  t('SGOT (AST)', 'IU/L', ['sgot', 'ast', 'aspartate aminotransferase'], { 'u/l': x(1) }),
  t('Sodium', 'mmol/L', ['sodium', 'serum sodium', 'na'], { 'meq/l': x(1) }),
  t('Potassium', 'mmol/L', ['potassium', 'serum potassium', 'k'], { 'meq/l': x(1) }),
  t('Calcium', 'mg/dL', ['calcium', 'serum calcium'], { 'mmol/l': x(4.008) }),
  t('ESR', 'mm/hr', ['esr', 'erythrocyte sedimentation rate'], {}),
];
