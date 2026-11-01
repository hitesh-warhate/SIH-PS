import { createInteractionSource } from '../../config/interactions.v1.js';
import { ANALYSIS } from './config.js';
import {
  ageAt, compareNames, frequencyInfo, lookupDrug, lookupTest, normKey, normalizeSex, parseAllergies, parseDose, parsePatientMedicines, toCanonical, unitKey,
} from './normalize.js';

// The analysis engine (FR-B8 to FR-B12). A pure function: the same input always gives the same output, with no clock and no database.
// It supports the physician. It never diagnoses, and the lab table says which way a value moved, never what that means.
//
// input = {
//   asOf: 'YYYY-MM-DD'                       the visit date; the only "now" the engine knows
//   patient: { name, dob, sex }              as registered
//   answers: { currentAny, currentList, allergyAny, allergyList }   from the interview; null when skipped or not asked
//   documents: [{ id, name, docType, date, sortOrder, status, attentionReason, textHash,
//                 meds:[{ name, form, dose, frequency, date, needsReview }],
//                 labs:[{ testName, value, unit, refLow, refHigh, date, needsReview }],
//                 diagnoses:[{ value, needsReview }], procedures:[...], identity:{ name, age, sex } }]
// }

const LATE = '9999-99-99';
const byDate = (a, b) => (a.date ?? LATE).localeCompare(b.date ?? LATE) || a.sortOrder - b.sortOrder || String(a.documentId ?? '').localeCompare(String(b.documentId ?? ''));
const uniq = (xs) => [...new Set(xs)];
const round = (n) => Number(Number(n).toPrecision(10));

// ---------- FR-B8: timeline ----------
function buildTimeline(input) {
  const events = input.documents.map((d) => ({
    documentId: d.id, name: d.name, docType: d.docType, date: d.date, dateMissing: !d.date, sortOrder: d.sortOrder,
    status: d.status, attentionReason: d.attentionReason,
    diagnoses: d.diagnoses.map((x) => x.value), procedures: d.procedures.map((x) => x.value),
    counts: { medications: d.meds.length, labs: d.labs.length },
    needsReview: [...d.meds, ...d.labs, ...d.diagnoses, ...d.procedures].some((x) => x.needsReview),
  })).sort(byDate);
  return { events, undated: events.filter((e) => e.dateMissing).length };
}

// ---------- FR-B9: medication reconciliation ----------
function compareDose(a, b) {
  const da = parseDose(a.dose), db = parseDose(b.dose);
  if (!da || !db) return null;
  if (da.unit !== db.unit) return { kind: 'unit_mismatch', direction: null };
  const fa = frequencyInfo(a.frequency).perDay, fb = frequencyInfo(b.frequency).perDay;
  const amountChanged = da.amount !== db.amount;
  const frequencyChanged = fa != null && fb != null && fa !== fb;
  if (!amountChanged && !frequencyChanged) return null;
  const kind = amountChanged && frequencyChanged ? 'dose_and_frequency' : amountChanged ? 'dose' : 'frequency';
  const bothFrequencies = fa != null && fb != null; // compare daily totals only when both frequencies are known
  const ta = bothFrequencies ? da.amount * fa : da.amount, tb = bothFrequencies ? db.amount * fb : db.amount;
  return { kind, direction: tb > ta ? 'increase' : tb < ta ? 'decrease' : 'changed' };
}

function medicationEntries(input) {
  const out = [];
  for (const d of input.documents) {
    for (const m of d.meds) {
      const drug = lookupDrug(m.name);
      out.push({ source: 'document', documentId: d.id, documentName: d.name, docType: d.docType, sortOrder: d.sortOrder, date: m.date ?? d.date,
        written: m.name, form: m.form ?? null, dose: m.dose ?? null, frequency: m.frequency ?? null, needsReview: Boolean(m.needsReview) || !drug.known, confidence: m.confidence ?? null, region: m.region ?? null, drug });
    }
  }
  const a = input.answers;
  if (a.currentAny === 'yes' && a.currentList) {
    for (const m of parsePatientMedicines(a.currentList)) {
      const drug = lookupDrug(m.name);
      out.push({ source: 'patient', documentId: null, documentName: null, docType: null, sortOrder: Number.MAX_SAFE_INTEGER, date: null,
        written: m.name, form: null, dose: m.dose, frequency: null, needsReview: !drug.known, drug });
    }
  }
  return out;
}

function buildReconciliation(input, entries) {
  const groups = new Map();
  for (const e of entries) {
    const key = e.drug.known ? e.drug.generic : `unknown:${normKey(e.written)}`;
    if (!groups.has(key)) groups.set(key, { key, generic: e.drug.generic, classes: e.drug.classes, known: e.drug.known, entries: [] });
    groups.get(key).entries.push(e);
  }
  const list = [...groups.values()].map((g) => {
    const docEntries = g.entries.filter((e) => e.source === 'document').sort(byDate);
    const doseChanges = [];
    const dated = docEntries.filter((e) => e.date);
    for (let i = 1; i < dated.length; i++) {
      const prev = dated[i - 1], cur = dated[i];
      if (prev.date === cur.date) continue; // same-day disagreement is a conflict, reported by the consistency checks
      const change = compareDose(prev, cur);
      if (change) {
        const side = (e) => ({ documentId: e.documentId, documentName: e.documentName, date: e.date, dose: e.dose, frequency: e.frequency });
        doseChanges.push({ ...change, from: side(prev), to: side(cur) });
      }
    }
    const perDoc = new Map();
    for (const e of docEntries) perDoc.set(e.documentId, [...(perDoc.get(e.documentId) ?? []), e]);
    const duplicatesInDocument = [...perDoc.values()].filter((es) => es.length > 1)
      .map((es) => ({ documentId: es[0].documentId, documentName: es[0].documentName, written: es.map((e) => e.written) }));
    const hasDoc = docEntries.length > 0, hasPatient = g.entries.some((e) => e.source === 'patient');
    return {
      key: g.key, name: g.generic ?? g.entries[0].written, known: g.known, classes: g.classes,
      writtenNames: uniq(g.entries.map((e) => e.written)).sort(),
      status: hasDoc && hasPatient ? 'documents_and_patient' : hasDoc ? 'documents_only' : 'patient_only',
      entries: [...docEntries, ...g.entries.filter((e) => e.source === 'patient')].map((e) => ({
        source: e.source, documentId: e.documentId, documentName: e.documentName, docType: e.docType, date: e.date, dateMissing: e.source === 'document' && !e.date,
        written: e.written, brand: e.drug.brand, form: e.form, dose: e.dose, frequency: e.frequency, needsReview: e.needsReview,
        confidence: e.confidence ?? null, region: e.region ?? null,
      })),
      doseChanges, duplicatesInDocument,
      needsReview: !g.known || g.entries.some((e) => e.needsReview),
    };
  }).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.key.localeCompare(b.key));
  const a = input.answers;
  return {
    patientReport: { answered: a.currentAny != null, takingAny: a.currentAny === 'yes' ? true : a.currentAny === 'no' ? false : null },
    medications: list,
    totals: { medications: list.length, withDoseChange: list.filter((m) => m.doseChanges.length).length, needingReview: list.filter((m) => m.needsReview).length },
  };
}

// ---------- FR-B10: consolidated lab table ----------
const flagOf = (value, low, high) => (low == null && high == null ? 'range_unavailable' : low != null && value < low ? 'low' : high != null && value > high ? 'high' : 'normal');

function buildLabTable(input) {
  const series = new Map();
  for (const d of input.documents) {
    for (const l of d.labs) {
      const look = lookupTest(l.testName);
      const key = look.known ? look.test.canonical : `unknown:${normKey(l.testName)}`;
      const conv = look.known ? toCanonical(look.test, l.value, l.unit, [l.refLow, l.refHigh]) : { ok: false };
      const date = l.date ?? d.date ?? null;
      const point = conv.ok
        ? { value: conv.value, unit: conv.unit, refLow: conv.extra[0], refHigh: conv.extra[1], converted: conv.converted, original: conv.converted ? { value: l.value, unit: l.unit } : null }
        : { value: l.value, unit: l.unit ?? null, refLow: l.refLow ?? null, refHigh: l.refHigh ?? null, converted: false, original: null };
      if (!series.has(key)) series.set(key, { key, test: look.known ? look.test.canonical : l.testName, known: look.known, canonicalUnit: look.known ? look.test.unit : null, points: [] });
      series.get(key).points.push({
        documentId: d.id, documentName: d.name, sortOrder: d.sortOrder, date, dateMissing: !date, ...point,
        flag: point.value == null ? 'range_unavailable' : flagOf(point.value, point.refLow, point.refHigh),
        confidence: l.confidence ?? null, region: l.region ?? null,
        // a known test whose unit cannot be brought to the canonical unit is not compared, and says so
        needsReview: Boolean(l.needsReview) || !look.known || (look.known && !conv.ok),
        unitMismatch: look.known && !conv.ok,
      });
    }
  }
  const rows = [...series.values()].map((s) => {
    s.points.sort(byDate);
    // the unit every comparison is made in: the canonical unit, or for an unknown test the unit of its first dated result
    const unit = s.canonicalUnit ?? (s.points.find((p) => p.date && p.unit)?.unit ?? null);
    for (const p of s.points) {
      if (!s.known) p.unitMismatch = unit != null && unitKey(p.unit) !== unitKey(unit);
      p.change = null;
    }
    const chain = s.points.filter((p) => p.date && !p.unitMismatch && p.value != null && unitKey(p.unit) === unitKey(unit));
    for (let i = 1; i < chain.length; i++) {
      const prev = chain[i - 1], cur = chain[i];
      cur.change = prev.date === cur.date
        ? { direction: null, sameDate: true, fromDate: prev.date, delta: round(cur.value - prev.value) }
        : { direction: cur.value === prev.value ? 'unchanged' : cur.value > prev.value ? 'up' : 'down', sameDate: false, fromDate: prev.date, delta: round(cur.value - prev.value) };
    }
    const latest = chain.at(-1) ?? null;
    return {
      key: s.key, test: s.test, known: s.known, unit, points: s.points,
      latest: latest ? { documentId: latest.documentId, date: latest.date, value: latest.value, flag: latest.flag, needsReview: latest.needsReview } : null,
      direction: latest?.change?.direction ?? null,
      needsReview: s.points.some((p) => p.needsReview),
    };
  }).sort((a, b) => a.test.toLowerCase().localeCompare(b.test.toLowerCase()) || a.key.localeCompare(b.key));
  // A flag that rests on a value or range the reader was unsure of (a lost decimal point, say) is shown as "to check" and is not counted as out of range.
  const outOfRange = rows.filter((r) => r.latest && !r.latest.needsReview && (r.latest.flag === 'high' || r.latest.flag === 'low')).length;
  return { tests: rows, totals: { tests: rows.length, outOfRange, needingReview: rows.filter((r) => r.needsReview).length } };
}

// ---------- FR-B11: interactions and allergies ----------
const sourcesOf = (m) => m.entries.map((e) => ({ source: e.source, documentId: e.documentId, documentName: e.documentName, date: e.date }));
const SEVERITY = { major: 0, moderate: 1 };

function buildInteractions(input, reconciliation, source) {
  const known = reconciliation.medications.filter((m) => m.known);
  const unknown = reconciliation.medications.filter((m) => !m.known);
  const interactions = [];
  for (let i = 0; i < known.length; i++) {
    for (let j = i + 1; j < known.length; j++) {
      const rule = source.check({ generic: known[i].key, classes: known[i].classes }, { generic: known[j].key, classes: known[j].classes });
      if (rule) interactions.push({ a: known[i].name, b: known[j].name, severity: rule.severity, effect: rule.effect, sources: { a: sourcesOf(known[i]), b: sourcesOf(known[j]) } });
    }
  }
  interactions.sort((x, y) => SEVERITY[x.severity] - SEVERITY[y.severity] || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));

  const a = input.answers;
  const allergies = a.allergyAny === 'yes' ? parseAllergies(a.allergyList) : [];
  const allergyConflicts = [];
  for (const al of allergies) {
    for (const m of known) {
      if (al.kind === 'drug' && al.generic === m.key) allergyConflicts.push({ allergen: al.term, match: 'drug', drug: m.name, sources: sourcesOf(m) });
      if (al.kind === 'class' && m.classes.includes(al.cls)) allergyConflicts.push({ allergen: al.term, match: 'class', allergyClass: al.cls, drug: m.name, sources: sourcesOf(m) });
    }
  }
  allergyConflicts.sort((x, y) => x.allergen.localeCompare(y.allergen) || x.drug.localeCompare(y.drug));
  return {
    interactions, allergyConflicts,
    // a drug that is not in the dictionary cannot be checked; it is listed so that nobody reads "no interactions" as "all checked"
    unchecked: unknown.map((m) => ({ name: m.name, sources: sourcesOf(m) })),
    allergies: { answered: a.allergyAny != null, reported: a.allergyAny === 'yes' ? true : a.allergyAny === 'no' ? false : null, listMissing: a.allergyAny === 'yes' && !allergies.length, items: allergies },
    source: { name: source.name, version: source.version, status: source.status },
  };
}

// ---------- FR-B12: consistency ----------
const SEV_ORDER = { attention: 0, warning: 1, info: 2 };

function identityIssues(input) {
  const issues = [];
  const p = input.patient;
  for (const d of input.documents) {
    const id = d.identity ?? {};
    const signals = [];
    const detail = {};
    if (id.name && p.name) {
      const c = compareNames(id.name, p.name, { matchRatio: ANALYSIS.nameMatchRatio });
      if (c.result === 'mismatch') { signals.push('name'); detail.name = { found: id.name, expected: p.name }; }
      else if (c.result === 'partial') { signals.push('name_partial'); detail.name = { found: id.name, expected: p.name, score: c.score }; }
    }
    const sex = normalizeSex(id.sex), expectedSex = normalizeSex(p.sex);
    if (sex && expectedSex && sex !== expectedSex) { signals.push('sex'); detail.sex = { found: sex, expected: expectedSex }; }
    if (id.age != null && p.dob) {
      const expected = ageAt(p.dob, d.date ?? input.asOf);
      if (expected != null && Math.abs(id.age - expected) > ANALYSIS.ageToleranceYears) { signals.push('age'); detail.age = { found: id.age, expected }; }
    }
    if (!signals.length) continue;
    const strong = signals.filter((s) => s !== 'name_partial').length;
    const likelihood = strong >= 2 ? 'high' : strong === 1 ? 'possible' : 'low';
    issues.push({ code: 'possible_wrong_patient', severity: likelihood === 'high' ? 'attention' : likelihood === 'possible' ? 'warning' : 'info', documentId: d.id, params: { likelihood, signals, ...detail } });
  }
  return issues;
}

function buildConsistency(input, reconciliation, labTable) {
  const issues = identityIssues(input);
  const add = (code, severity, documentId, params = {}) => issues.push({ code, severity, documentId: documentId ?? null, params });

  for (const d of input.documents) {
    if (!d.date) add('date_missing', 'warning', d.id);
    else if (d.date > input.asOf) add('date_in_future', 'warning', d.id, { date: d.date, asOf: input.asOf });
    if (d.status === 'needs_attention') add('document_needs_attention', 'warning', d.id, { reason: d.attentionReason });
  }
  const byText = new Map();
  for (const d of input.documents) if (d.textHash) byText.set(d.textHash, [...(byText.get(d.textHash) ?? []), d.id]);
  for (const ids of byText.values()) if (ids.length > 1) add('duplicate_document', 'info', ids[0], { documentIds: ids });

  // two files on the same day that disagree about the same test or the same medicine
  for (const t of labTable.tests) {
    const seen = new Map();
    for (const p of t.points.filter((x) => x.date && !x.unitMismatch && x.value != null)) seen.set(p.date, [...(seen.get(p.date) ?? []), p]);
    for (const [date, ps] of seen) {
      if (uniq(ps.map((p) => p.value)).length > 1 && uniq(ps.map((p) => p.documentId)).length > 1) {
        add('lab_conflict', 'warning', ps[0].documentId, { test: t.test, date, values: ps.map((p) => ({ documentId: p.documentId, value: p.value, unit: p.unit })) });
      }
    }
  }
  for (const m of reconciliation.medications) {
    const seen = new Map();
    for (const e of m.entries.filter((x) => x.source === 'document' && x.date)) seen.set(e.date, [...(seen.get(e.date) ?? []), e]);
    for (const [date, es] of seen) {
      // each file's set of doses that day; two files conflict when their sets differ (a file naming one drug twice is not a conflict)
      const sets = new Map();
      for (const e of es) {
        const d = parseDose(e.dose);
        if (d) sets.set(e.documentId, [...(sets.get(e.documentId) ?? []), `${d.amount} ${d.unit} ${frequencyInfo(e.frequency).perDay ?? '?'}`]);
      }
      const signatures = uniq([...sets.values()].map((s) => uniq(s).sort().join('|')));
      if (sets.size > 1 && signatures.length > 1) add('medication_conflict', 'warning', es[0].documentId, { drug: m.name, date, entries: es.map((e) => ({ documentId: e.documentId, dose: e.dose, frequency: e.frequency })) });
    }
  }

  // the patient's answers against the files
  const docMeds = reconciliation.medications.filter((m) => m.entries.some((e) => e.source === 'document'));
  if (input.answers.currentAny === 'no' && docMeds.length) {
    add('patient_reports_no_medicines', 'warning', null, { medicines: docMeds.map((m) => m.name), documentIds: uniq(docMeds.flatMap((m) => m.entries.map((e) => e.documentId))).sort() });
  }

  for (const m of reconciliation.medications.filter((x) => !x.known)) add('unknown_drug', 'info', null, { name: m.name, documentIds: uniq(m.entries.map((e) => e.documentId).filter(Boolean)).sort() });
  for (const t of labTable.tests.filter((x) => !x.known)) add('unknown_test', 'info', null, { name: t.test, documentIds: uniq(t.points.map((p) => p.documentId)).sort() });
  for (const t of labTable.tests.filter((x) => x.known && x.points.some((p) => p.unitMismatch))) {
    add('unit_not_comparable', 'warning', null, { test: t.test, units: uniq(t.points.map((p) => p.unit ?? 'none')).sort() });
  }

  issues.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || a.code.localeCompare(b.code) || String(a.documentId).localeCompare(String(b.documentId)) || JSON.stringify(a.params).localeCompare(JSON.stringify(b.params)));
  return { issues, totals: { attention: issues.filter((i) => i.severity === 'attention').length, warning: issues.filter((i) => i.severity === 'warning').length, info: issues.filter((i) => i.severity === 'info').length } };
}

export function analyze(input, { interactionSource = createInteractionSource() } = {}) {
  const entries = medicationEntries(input);
  const med_reconciliation = buildReconciliation(input, entries);
  const lab_table = buildLabTable(input);
  return {
    timeline: buildTimeline(input),
    med_reconciliation,
    lab_table,
    interactions: buildInteractions(input, med_reconciliation, interactionSource),
    consistency: buildConsistency(input, med_reconciliation, lab_table),
  };
}
