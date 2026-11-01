// Free narration -> ontology fields (FR-A13). The language model is an interface; this deterministic mapper is the v1 engine.
// It only reports what the words literally contain (a complaint keyword, a duration) and never invents or diagnoses.
// Its input and output are stored with the answer, so every mapping can be audited.
const COMPLAINTS = {
  chest_pain: ['chest', 'सीने', 'सीन', 'छाती', 'छातीत'],
  fever: ['fever', 'बुखार', 'ताप'],
  back_pain: ['back pain', 'backache', 'पीठ', 'पाठ'],
  cough: ['cough', 'खाँसी', 'खांसी', 'खोकला'],
  abdominal_pain: ['stomach', 'abdomen', 'belly', 'पेट', 'पोट'],
  headache: ['headache', 'head ache', 'सिर', 'डोके'],
};
const DIGITS = { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9' };
const UNIT = [[/^(day|days|दिन|दिवस)/, 'days'], [/^(week|weeks|सप्ताह|हफ्ते|हफ़्ते|आठवडे|आठवड)/, 'weeks'], [/^(month|months|महीन|महिन)/, 'months']];

export function durationKey(n, unit) {
  const days = unit === 'weeks' ? n * 7 : unit === 'months' ? n * 30 : n;
  if (days < 1) return 'lt1d';
  if (days <= 3) return 'd1_3';
  if (days <= 7) return 'd4_7';
  if (days <= 30) return 'w1_4';
  return 'm1';
}

export function createRuleNarrationMapper() {
  return {
    name: 'rules-v1',
    map(text) {
      const norm = String(text).toLowerCase().replace(/[०-९]/g, (d) => DIGITS[d]);
      const complaints = Object.entries(COMPLAINTS).filter(([, words]) => words.some((w) => norm.includes(w))).map(([k]) => k);
      let duration = null;
      for (const m of norm.matchAll(/(\d+)\s*([^\s\d,.]+)/g)) {
        const unit = UNIT.find(([re]) => re.test(m[2]));
        if (unit) { duration = { n: Number(m[1]), unit: unit[1], key: durationKey(Number(m[1]), unit[1]) }; break; }
      }
      return { mapper: 'rules-v1', complaints, duration };
    },
  };
}
