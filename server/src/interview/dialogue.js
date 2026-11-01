import { QUESTIONS, SECTIONS, UNITS, YES_NO_LABELS } from '../../config/questions.v1.js';
import { AYUSH_QUESTIONS, AYUSH_SECTIONS } from '../../config/ayush.v1.js';

const IDX = { en: 0, hi: 1, mr: 2 };
const byKey = new Map([...QUESTIONS, ...AYUSH_QUESTIONS].map((q) => [q.key, q]));
export const getQuestion = (key) => byKey.get(key);

// answers: { [questionKey]: { value } | { skipped: true } }. A skipped question has no value, so it never satisfies a condition:
// "not answered" is never treated as "no" (FR-A10).
function holds(when, values) {
  if (when.all) return when.all.every((w) => holds(w, values));
  if (when.any) return when.any.some((w) => holds(w, values));
  const v = values[when.key];
  if (v === undefined) return false;
  if ('eq' in when) return v === when.eq;
  if ('in' in when) return when.in.includes(v);
  if ('includes' in when) return Array.isArray(v) && v.includes(when.includes);
  return false;
}

// The dialogue manager can only ask what the ontology lists, in ontology order, when its conditions hold.
// AYUSH questions (Phase 7) follow the standard ones and are asked only in AYUSH mode. Answers already given are kept either way.
export function activeQuestions(answers, { ayush = false } = {}) {
  const values = {};
  const active = [];
  for (const q of ayush ? [...QUESTIONS, ...AYUSH_QUESTIONS] : QUESTIONS) {
    if (q.when && !holds(q.when, values)) continue;
    active.push(q);
    const a = answers[q.key];
    if (a && !a.skipped) values[q.key] = a.value;
  }
  return active;
}

export function nextQuestion(answers, opts) {
  const active = activeQuestions(answers, opts);
  const answered = active.filter((q) => answers[q.key]).length;
  const next = active.find((q) => !answers[q.key]);
  return { question: next ?? null, answered, total: active.length };
}

// Answers whose question is no longer reachable (an earlier answer was changed) are stale.
// AYUSH answers are never stale just because AYUSH mode is off, so switching modes loses nothing.
export function staleKeys(answers) {
  const live = new Set(activeQuestions(answers, { ayush: true }).map((q) => q.key));
  return Object.keys(answers).filter((k) => !live.has(k));
}

export function validateAnswer(q, value) {
  switch (q.type) {
    case 'yes_no': return value === 'yes' || value === 'no';
    case 'single': return q.options.some((o) => o.value === value);
    case 'multi': {
      if (!Array.isArray(value) || !value.length || new Set(value).size !== value.length) return false;
      if (!value.every((v) => q.options.some((o) => o.value === v))) return false;
      return !(value.includes('none') && value.length > 1); // "none of these" excludes everything else
    }
    case 'number': return typeof value === 'number' && Number.isFinite(value) && value >= (q.min ?? 0) && value <= (q.max ?? 120);
    case 'text': return typeof value === 'string' && value.trim().length > 0 && value.length <= 500;
    default: return false;
  }
}

export function presentQuestion(q, lang) {
  const i = IDX[lang] ?? 0;
  const base = { key: q.key, section: q.section, type: q.type, text: q.text[i], critical: Boolean(q.critical), followUp: Boolean(q.when) };
  if (q.options) base.options = q.options.map((o) => ({ value: o.value, label: o.label[i] }));
  if (q.type === 'number') Object.assign(base, { min: q.min ?? 0, max: q.max ?? 120, scale: Boolean(q.scale) });
  return base;
}

export function displayAnswer(q, answer, lang) {
  const i = IDX[lang] ?? 0;
  if (!answer || answer.skipped) return null;
  const { value } = answer;
  if (q.type === 'yes_no') return YES_NO_LABELS[value][i];
  if (q.type === 'single') return q.options.find((o) => o.value === value).label[i];
  if (q.type === 'multi') return value.map((v) => q.options.find((o) => o.value === v).label[i]).join(', ');
  if (q.type === 'number') return `${value}${UNITS[q.key] ? ` ${UNITS[q.key][i]}` : ''}`;
  return value;
}

// Answers as a reviewable list, in ontology order, only for reachable questions.
export function reviewList(answers, lang, opts) {
  const i = IDX[lang] ?? 0;
  return activeQuestions(answers, opts).filter((q) => answers[q.key]).map((q) => ({
    key: q.key, section: q.section, question: q.text[i], critical: Boolean(q.critical),
    skipped: Boolean(answers[q.key].skipped), answer: displayAnswer(q, answers[q.key], lang),
  }));
}

// The standard physician-readable structure (FR-A13). "not answered" (skipped or never asked) stays distinct from "no".
export function structuredHistory(answers, lang, opts) {
  const i = IDX[lang] ?? 0;
  const active = activeQuestions(answers, opts);
  return (opts?.ayush ? [...SECTIONS, ...AYUSH_SECTIONS] : SECTIONS).map(([id, title]) => ({
    section: id,
    title: title[i],
    items: active.filter((q) => q.section === id).map((q) => {
      const a = answers[q.key];
      return {
        key: q.key, question: q.text[i],
        status: !a ? 'not_asked' : a.skipped ? 'not_answered' : 'answered',
        answer: displayAnswer(q, a, lang),
        ...(a?.extracted ? { extracted: a.extracted } : {}),
      };
    }),
  }));
}
