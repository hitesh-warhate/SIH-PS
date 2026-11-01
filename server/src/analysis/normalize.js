import { ALLERGY_CLASS_TERMS, DRUGS, DRUG_NAME_SUFFIXES } from '../../config/drugs.v1.js';
import { LAB_TESTS } from '../../config/labs.v1.js';

// Common forms for drug names, lab tests, units, doses, names and dates. Nothing here guesses: a name that is not in the
// dictionaries comes back as `known: false`, and the caller flags it for review.

// lower-case letters and digits (Latin or Devanagari, U+0900 to U+097F) only, so "Taxim-O" and "taxim o" are the same key
const keepChar = (ch) => /[a-z0-9]/.test(ch) || (ch.codePointAt(0) >= 0x900 && ch.codePointAt(0) <= 0x97f);
export const normKey = (s) => [...String(s ?? '').normalize('NFKC').toLowerCase()].filter(keepChar).join('');

// ---------- drugs ----------
const drugIndex = new Map();
for (const drug of DRUGS) {
  const info = { generic: drug.generic, classes: drug.classes };
  drugIndex.set(normKey(drug.generic), { ...info, brand: false });
  for (const a of drug.aliases ?? []) drugIndex.set(normKey(a), { ...info, brand: false });
  for (const b of drug.brands ?? []) drugIndex.set(normKey(b), { ...info, brand: true });
}
const SUFFIX = new Set(DRUG_NAME_SUFFIXES);

// Exact dictionary match on the whole name, then with presentation words ("SR", "tablet") removed. No fuzzy matching.
export function lookupDrug(raw) {
  const words = String(raw ?? '').normalize('NFKC').toLowerCase().split(/[\s/]+/).filter(Boolean);
  const tries = [words.join(' ')];
  const core = words.filter((w) => !SUFFIX.has(w.replace(/[^a-z]/g, '')));
  if (core.length && core.length !== words.length) tries.push(core.join(' '));
  for (const attempt of tries) {
    const hit = drugIndex.get(normKey(attempt));
    if (hit) return { known: true, ...hit };
  }
  return { known: false, generic: null, classes: [], brand: false };
}

// ---------- doses and frequencies ----------
export function parseDose(text) {
  const m = String(text ?? '').match(/(\d+(?:\.\d+)?)\s*(mg|mcg|µg|ug|g|ml|iu|units?)\b/i);
  if (!m) return null;
  const unit = m[2].toLowerCase().replace('µg', 'mcg').replace('ug', 'mcg').replace(/^units?$/, 'units');
  return { amount: Number(m[1]), unit };
}

const PER_DAY = { 'once daily': 1, 'twice daily': 2, 'three times daily': 3, 'four times daily': 4, 'at bedtime': 1 };
export function frequencyInfo(text) {
  const t = String(text ?? '').toLowerCase();
  if (!t) return { perDay: null, prn: false };
  if (t.startsWith('as needed')) return { perDay: null, prn: true };
  const label = Object.keys(PER_DAY).find((k) => t.startsWith(k));
  return { perDay: label ? PER_DAY[label] : null, prn: false };
}

// ---------- allergies ----------
const splitTerms = (s) => String(s ?? '').split(/\s*(?:[,;\n/]|\band\b|\bor\b|और|आणि|तथा)\s*/i).map((x) => x.trim()).filter(Boolean);

// One allergy phrase becomes a drug, a drug class, or neither (a food allergy, say), which is kept for display only.
export function parseAllergies(text) {
  return splitTerms(text).map((term) => {
    const cleaned = term.replace(/\b(allergy|allergic|to|a|an|the)\b/gi, ' ').replace(/\s+/g, ' ').trim() || term;
    const cls = ALLERGY_CLASS_TERMS[normKey(cleaned)];
    if (cls) return { term, kind: 'class', cls };
    const drug = lookupDrug(cleaned);
    if (drug.known) return { term, kind: 'drug', generic: drug.generic };
    return { term, kind: 'other' };
  });
}

// ---------- patient-reported medicines ----------
export function parsePatientMedicines(text) {
  return splitTerms(text).map((piece) => {
    const dose = parseDose(piece);
    const name = piece.replace(/\d+(?:\.\d+)?\s*(mg|mcg|µg|ug|g|ml|iu|units?)\b/gi, ' ').replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim();
    return { name: name || piece, dose: dose ? `${dose.amount} ${dose.unit}` : null };
  }).filter((m) => m.name.length >= 2);
}

// ---------- lab tests and units ----------
const testIndex = new Map();
for (const test of LAB_TESTS) {
  testIndex.set(normKey(test.canonical), test);
  for (const n of test.names) testIndex.set(normKey(n), test);
}
export const unitKey = (u) => String(u ?? '').normalize('NFKC').toLowerCase().replace(/µ/g, 'u').replace(/\s+/g, '');
const sameUnit = (a, b) => unitKey(a) === unitKey(b) || (unitKey(a) === 'u/l' && unitKey(b) === 'iu/l') || (unitKey(a) === 'iu/l' && unitKey(b) === 'u/l');

export function lookupTest(raw) {
  const test = testIndex.get(normKey(raw));
  return test ? { known: true, test } : { known: false, test: null };
}

// Brings a result into the test's canonical unit when that is safe. Returns { ok, value, unit, converted }.
// ok is false when the unit is missing, unknown for this test, or the test itself is unknown.
export function toCanonical(test, value, unit, extra = []) {
  const bring = (v) => (v == null ? null : Number(Number(v).toPrecision(10)));
  if (!test) return { ok: false, unit };
  if (!unit) return { ok: false, unit: null };
  if (sameUnit(unit, test.unit)) return { ok: true, value, unit: test.unit, converted: false, extra: extra.map(bring) };
  const fn = test.convert[unitKey(unit)];
  if (!fn) return { ok: false, unit };
  const out = (v) => (v == null ? null : Number(fn(Number(v)).toPrecision(10)));
  return { ok: true, value: out(value), unit: test.unit, converted: true, extra: extra.map(out) };
}

// ---------- patient identity ----------
const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'smt', 'shri', 'shree', 'sri', 'master', 'baby', 'dr', 'kumari', 'kum', 'श्री', 'श्रीमती', 'कु']);
const isDevanagari = (s) => /[ऀ-ॿ]/.test(s);
const nameTokens = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[.,]/g, ' ').split(/\s+/).filter((w) => w && !TITLES.has(w));

function edit1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, miss = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++miss > 1) return false;
    if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
  }
  return miss + (a.length - i) + (b.length - j) <= 1;
}
const tokenMatch = (a, b) => a === b || (a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b)) || (a.length >= 5 && b.length >= 5 && edit1(a, b));

// 'match', 'partial', 'mismatch', or 'not_comparable' (one name in Devanagari and the other in Latin letters, or no usable words).
export function compareNames(a, b, { matchRatio }) {
  if (isDevanagari(a) !== isDevanagari(b)) return { result: 'not_comparable', score: null };
  const ta = nameTokens(a), tb = nameTokens(b);
  if (!ta.length || !tb.length) return { result: 'not_comparable', score: null };
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const pool = [...long];
  let matched = 0;
  for (const w of short) {
    const k = pool.findIndex((p) => tokenMatch(w, p));
    if (k >= 0) { matched++; pool.splice(k, 1); }
  }
  const score = matched / short.length;
  return { result: score >= matchRatio ? 'match' : score > 0 ? 'partial' : 'mismatch', score: Number(score.toFixed(2)) };
}

export function normalizeSex(s) {
  const t = String(s ?? '').trim().toLowerCase();
  if (/^(m|male|man|boy|पुरुष|पुरुष|मुलगा|पु)$/.test(t)) return 'male';
  if (/^(f|female|woman|girl|स्त्री|महिला|मुलगी|स्री)$/.test(t)) return 'female';
  return null;
}

// ---------- dates ----------
export function ageAt(dob, date) {
  if (!dob || !date) return null;
  const [by, bm, bd] = dob.split('-').map(Number);
  const [y, m, d] = date.split('-').map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age--;
  return age;
}
