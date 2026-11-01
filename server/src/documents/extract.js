import { CONFIDENCE } from './config.js';

// Extracts diagnoses, medications (dose, frequency), lab results (value, unit, range), procedures and dates from the lines a
// reader returned (FR-B5). Every field carries a confidence and the place it came from on the scan (FR-B13, FR-B14).
// Rule-based and conservative: a field that is incomplete is kept but flagged for review, never completed by guessing.

const DEV_DIGITS = { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9' };
const ascii = (s) => s.replace(/[०-९]/g, (d) => DEV_DIGITS[d]);
const clamp = (n) => Math.max(0, Math.min(1, +n.toFixed(3)));

// ---------- dates ----------
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const iso = (y, m, d) => (y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null);
export function findDate(text) {
  const t = ascii(text);
  let m = t.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/);
  if (m) return iso(+m[3], +m[2], +m[1]); // day first, as written in India
  m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = t.match(/\b(\d{1,2})\s+([A-Za-z]{3,4})[a-z]*\.?,?\s+(\d{4})\b/);
  if (m && MONTHS[m[2].toLowerCase()]) return iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  return null;
}

// ---------- medications ----------
const FORM = /^(tab|tabs|tablet|tablets|cap|caps|capsule|capsules|syp|syrup|inj|injection|oint|ointment|drops?|टैब|टैबलेट|गोली|गोळी|कैप|कैप्सूल)\.?$/i;
const DOSE_UNIT = /^(mg|mcg|µg|ug|g|ml|iu|units?)$/i;
const FREQ_WORD = /^(od|bd|bid|tds|tid|qid|hs|sos|prn|once|twice|thrice|daily)$/i;

export function parseFrequency(text) {
  const t = ascii(text).toLowerCase();
  const pattern = t.match(/\b(\d)\s*-\s*(\d)\s*-\s*(\d)(?:\s*-\s*(\d))?\b/);
  if (pattern) {
    const doses = pattern.slice(1).filter(Boolean).map(Number).filter((n) => n > 0).length;
    const label = { 1: 'once daily', 2: 'twice daily', 3: 'three times daily', 4: 'four times daily' }[doses];
    return label ? { text: `${label} (${pattern[0].replace(/\s/g, '')})`, code: label } : null;
  }
  const table = [
    [/\b(qid|four times)\b|दिन में चार बार|दिवसातून चार/, 'four times daily'],
    [/\b(tds|tid|thrice|three times)\b|दिन में तीन बार|दिवसातून तीन|तीनदा/, 'three times daily'],
    [/\b(bd|bid|twice)\b|दिन में दो बार|सुबह[- ]?शाम|दिवसातून दोन|दोनदा|सकाळी[- ]?संध्याकाळी/, 'twice daily'],
    [/\b(od|once)\b|दिन में एक बार|दिवसातून एक|एकदा/, 'once daily'],
    [/\b(hs)\b|at bedtime|at night|रात को|सोने से पहले|रात्री/, 'at bedtime'],
    [/\b(sos|prn)\b|as needed|if needed|ज़रूरत पड़ने पर|जरूरत पड़ने पर|गरज असल्यास/, 'as needed'],
  ];
  for (const [re, label] of table) if (re.test(t)) return { text: label, code: label };
  return null;
}

function parseMedication(line) {
  const tokens = line.text.replace(/^\s*\d+[.)]\s*/, '').split(/\s+/);
  const f = tokens.findIndex((tk, i) => FORM.test(tk) && i <= 1);
  const hasDose = /\b\d+(\.\d+)?\s*(mg|mcg|µg|g|ml|iu)\b/i.test(ascii(line.text));
  if (f < 0 && !(hasDose && parseFrequency(line.text))) return null;
  let i = f + 1;
  const nameTokens = [];
  while (i < tokens.length && nameTokens.length < 3 && /^[A-Za-z][A-Za-z0-9-]*$/.test(tokens[i]) && !FREQ_WORD.test(tokens[i]) && !DOSE_UNIT.test(tokens[i])) {
    nameTokens.push(tokens[i++]);
  }
  if (!nameTokens.length) return null;
  let dose = null;
  const rest = ascii(tokens.slice(i).join(' '));
  const d = rest.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|µg|g|ml|iu|units?)\b/i);
  if (d) dose = `${d[1]} ${d[2].toLowerCase()}`;
  const freq = parseFrequency(rest);
  return {
    name: nameTokens.map((n) => n[0].toUpperCase() + n.slice(1)).join(' '),
    form: f >= 0 ? tokens[f].replace(/\.$/, '').toLowerCase() : null,
    dose, frequency: freq?.text ?? null,
    completeness: (dose ? 1 : 0.8) * (freq ? 1 : 0.85) * (f >= 0 ? 1 : 0.9),
  };
}

// ---------- lab results ----------
const UNITS = ['g/dl', 'mg/dl', 'mmol/l', 'iu/l', 'u/l', '%', '/cumm', 'cells/cumm', 'lakhs/cumm', 'million/cumm', 'fl', 'pg', 'ng/ml', 'pg/ml', 'µiu/ml', 'uiu/ml', 'miu/ml', 'meq/l', 'mg/l', 'sec', 'mm/hr', 'mm/hr.'];
const KNOWN_TESTS = /(hemoglobin|haemoglobin|\bhb\b|wbc|rbc|platelet|creatinine|glucose|sugar|hba1c|cholesterol|triglyceride|\btsh\b|urea|bilirubin|sgpt|sgot|\balt\b|\bast\b|sodium|potassium|calcium|esr|हीमोग्लोबिन|ग्लूकोज|शुगर|क्रिएटिनिन|कोलेस्ट्रॉल)/i;
const num = (s) => Number(s);
// a Latin or Devanagari letter (U+0900 to U+097F), built from code points so the range stays readable
const HAS_LETTER = { test: (s) => /[A-Za-z]/.test(s) || [...s].some((ch) => ch.codePointAt(0) >= 0x900 && ch.codePointAt(0) <= 0x97f) };

export function parseRange(text) {
  const t = ascii(text);
  let m = t.match(/(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)/i);
  if (m) return { low: num(m[1]), high: num(m[2]), text: m[0].replace(/\s+/g, ' ') };
  m = t.match(/(?:<|≤|up to|upto)\s*(\d+(?:\.\d+)?)/i);
  if (m) return { low: null, high: num(m[1]), text: m[0] };
  m = t.match(/(?:>|≥)\s*(\d+(?:\.\d+)?)/);
  if (m) return { low: num(m[1]), high: null, text: m[0] };
  return null;
}

export function flagFor(value, range) {
  if (!range) return 'range_unavailable';
  if (range.low != null && value < range.low) return 'low';
  if (range.high != null && value > range.high) return 'high';
  return 'normal';
}

// OCR often confuses a lower-case l with a capital I. These spellings are read as the unit they almost certainly are,
// but the result is flagged for review, because a corrected value is not a certain one.
const UNIT_FIXES = { 'ulu/ml': 'uIU/mL', 'µlu/ml': 'µIU/mL', 'mlu/ml': 'mIU/mL', 'iu/i': 'IU/L', 'g/di': 'g/dL', 'mg/di': 'mg/dL' };
const UNIT_CANON = { 'g/dl': 'g/dL', 'mg/dl': 'mg/dL', 'mmol/l': 'mmol/L', 'iu/l': 'IU/L', 'u/l': 'U/L', fl: 'fL', 'ng/ml': 'ng/mL', 'pg/ml': 'pg/mL', 'uiu/ml': 'uIU/mL', 'µiu/ml': 'µIU/mL', 'miu/ml': 'mIU/mL', 'meq/l': 'mEq/L', 'mg/l': 'mg/L' };

// Does the reference range make sense next to the value? A dropped decimal point (1.5 - 4.5 read as 15-45) turns a normal
// result into a false "low" or "high", so a value an order of magnitude outside its own range is held for review.
const implausible = (value, range) => Boolean(range) && ((range.low > 0 && value < range.low / 8) || (range.high > 0 && value > range.high * 8)
  || (range.low != null && range.high != null && range.low >= range.high));

function parseLab(line) {
  const tokens = ascii(line.text).replace(/[|]/g, ' ').trim().split(/\s+/);
  const i = tokens.findIndex((tk, k) => k >= 1 && /^\d+(\.\d+)?$/.test(tk));
  if (i < 1) return null;
  const name = tokens.slice(0, i).join(' ').replace(/[:-]+$/, '').trim();
  if (!HAS_LETTER.test(name) || name.length < 2 || /^(age|date|dr|bed|ward|phone|mob|tel|no|pin)\b/i.test(name)) return null;
  const value = num(tokens[i]);
  let unit = null, corrected = false, used = 0;
  const raw = tokens[i + 1] ?? '';
  const lower = raw.toLowerCase().replace(/\.$/, '');
  if (UNITS.includes(lower)) { unit = UNIT_CANON[lower] ?? raw; used = 1; }
  else if (UNIT_FIXES[lower]) { unit = UNIT_FIXES[lower]; corrected = true; used = 1; }
  if (!unit && !KNOWN_TESTS.test(name)) return null;
  const refText = tokens.slice(i + 1 + used).join(' ');
  const range = parseRange(refText);
  // a leading zero with no decimal point ("04 - 4.0") is a sign the point was lost
  const lostPoint = /(^|\s)0\d+(\s|$)/.test(refText) || implausible(value, range);
  return {
    test_name: name, value, unit, range, ref_text: range?.text ?? null, flag: flagFor(value, range),
    completeness: (unit ? 1 : 0.85) * (range ? 1 : 0.92) * (corrected ? 0.8 : 1) * (lostPoint ? 0.6 : 1), suspect: corrected || lostPoint,
  };
}

// ---------- diagnoses and procedures ----------
const DX = /^\s*(?:final\s+|provisional\s+|primary\s+)?(?:diagnosis|diagnoses|dx|impression|निदान|रोग निदान|रोगनिदान)\s*[:：-]\s*(.*)$/i;
const PROC = /^\s*(?:procedures?|operation|surgery|surgical history|शस्त्रक्रिया|शल्यक्रिया|ऑपरेशन|प्रक्रिया)\s*[:：-]\s*(.*)$/i;
const split = (s) => s.split(/\s*(?:[,;]|\band\b|और|आणि|तथा)\s*/i).map((x) => x.trim().replace(/[.]+$/, '')).filter((x) => x.length >= 2);

// ---------- who the document is about ----------
// Name, age and sex are read so that Phase 5 can notice a file that belongs to someone else. They are never used to fill the
// registered patient's details, only to compare against them.
const NAME_LABEL = /^\s*(?:patient(?:'s)?\s*name|patient|pt\.?\s*name|name|रोगी\s*का\s*नाम|मरीज़?\s*का\s*नाम|रुग्णाचे\s*नाव|नाम|नाव)\s*[:：-]\s*(.+)$/i;
const NAME_END = /\s+(?:age|sex|gender|dob|uhid|id|date|आयु|उम्र|वय|लिंग)(?=[\s:：-]|$).*$/i; // no \b: it does not see Devanagari letters
const AGE_SEX = /\bage\s*\/\s*(?:sex|gender)\s*[:：-]?\s*(\d{1,3})\s*(?:y|yrs?|years?)?\s*[/,-]?\s*(male|female|m|f)\b/i;
const AGE_ONLY = /(?:^|[\s,;|])(?:age|आयु|उम्र|वय)\s*[:：-]?\s*(\d{1,3})(?!\d)/i;
const SEX_ONLY = /(?:^|[\s,;|])(?:sex|gender|लिंग)\s*[:：-]?\s*(male|female|m|f|पुरुष|स्त्री|महिला)(?![A-Za-z])/i;

function findIdentity(lines) {
  const found = {};
  const take = (type, value, line) => { if (!found[type] && value) found[type] = { entity_type: type, value, line }; };
  for (const l of lines) {
    const text = ascii(l.text);
    const as = text.match(AGE_SEX);
    if (as) { take('patient_age', as[1], l); take('patient_sex', as[2], l); }
    const age = text.match(AGE_ONLY);
    if (age && +age[1] <= 120) take('patient_age', age[1], l);
    const sex = text.match(SEX_ONLY);
    if (sex) take('patient_sex', sex[1], l);
    const nm = l.text.match(NAME_LABEL);
    if (nm) {
      const name = nm[1].replace(NAME_END, '').replace(/[.,;:]+$/, '').trim();
      if (name.length >= 2 && !/\d/.test(name) && HAS_LETTER.test(name)) take('patient_name', name, l);
    }
  }
  return Object.values(found);
}

export function extract(pages) {
  const lines = pages.flatMap((p) => p.lines.map((l) => ({ ...l, page: p.page })));
  const region = (l) => ({ page: l.page, ...l.bbox });
  const out = { documentDate: null, entities: [], medications: [], labs: [], confidence: 0 };

  // document date: a labelled date near the top wins, otherwise the first date found in the first lines
  // (an admission date is not the document date)
  const labelled = lines.find((l) => /(date|dated|दिनांक|तारीख)/i.test(l.text) && !/admission|admitted|भर्ती|भरती/i.test(l.text) && findDate(l.text));
  out.documentDate = labelled ? findDate(labelled.text) : lines.slice(0, 8).map((l) => findDate(l.text)).find(Boolean) ?? null;

  const taken = new Set();
  for (const l of lines) {
    const med = parseMedication(l);
    if (!med) continue;
    taken.add(l);
    const confidence = clamp(l.confidence * med.completeness);
    out.medications.push({
      name: med.name, form: med.form, dose: med.dose, frequency: med.frequency,
      prescribed_on: out.documentDate, confidence, page: l.page, region: region(l),
      needs_review: confidence < CONFIDENCE.review || !med.dose || !med.frequency,
    });
  }

  for (const l of lines) {
    if (taken.has(l)) continue;
    const lab = parseLab(l);
    if (!lab) continue;
    taken.add(l);
    const confidence = clamp(l.confidence * lab.completeness);
    out.labs.push({
      test_name: lab.test_name, value: lab.value, unit: lab.unit, ref_low: lab.range?.low ?? null, ref_high: lab.range?.high ?? null,
      ref_text: lab.ref_text, flag: lab.flag, result_date: out.documentDate, confidence, page: l.page, region: region(l),
      needs_review: confidence < CONFIDENCE.review || !lab.unit || lab.suspect,
    });
  }

  lines.forEach((l, idx) => {
    for (const [re, type] of [[DX, 'diagnosis'], [PROC, 'procedure']]) {
      const m = l.text.match(re);
      if (!m) continue;
      let text = m[1];
      // a label alone on its line takes the next line as its value
      if (!text.trim() && lines[idx + 1] && !DX.test(lines[idx + 1].text) && !PROC.test(lines[idx + 1].text)) text = lines[idx + 1].text;
      for (const value of split(text)) {
        // Free text is the least reliable field, and the engine over-states its confidence on Devanagari scans
        // (a misread Marathi diagnosis came back at 91%), so Devanagari text takes an extra discount and is reviewed sooner.
        const confidence = clamp(l.confidence * 0.95 * (/[ऀ-ॿ]/.test(value) ? 0.85 : 1));
        out.entities.push({ entity_type: type, value, confidence, page: l.page, region: region(l), needs_review: confidence < CONFIDENCE.review });
      }
    }
  });

  for (const f of findIdentity(lines)) {
    const confidence = clamp(f.line.confidence * 0.95);
    out.entities.push({ entity_type: f.entity_type, value: f.value, confidence, page: f.line.page, region: region(f.line), needs_review: confidence < CONFIDENCE.review });
  }

  out.confidence = lines.length ? clamp(lines.reduce((s, l) => s + l.confidence, 0) / lines.length) : 0;
  out.text = lines.map((l) => l.text).join('\n');
  return out;
}
