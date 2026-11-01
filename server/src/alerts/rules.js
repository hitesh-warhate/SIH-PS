import { RULES } from '../../config/redflag-rules.v1.js';

// answers: { [questionKey]: { value } | { skipped: true } }. A question that was never asked has no entry.
// Returns the keys that made the condition true, or null when it does not hold.
function check(when, answers) {
  if (when.all) {
    const keys = [];
    for (const w of when.all) {
      const k = check(w, answers);
      if (!k) return null;
      keys.push(...k);
    }
    return keys;
  }
  if (when.any) {
    for (const w of when.any) {
      const k = check(w, answers);
      if (k) return k;
    }
    return null;
  }
  const a = answers[when.key];
  if (!a) return null;
  if (when.skipped) return a.skipped ? [when.key] : null;
  if (a.skipped) return null;
  const v = a.value;
  if ('eq' in when) return v === when.eq ? [when.key] : null;
  if ('in' in when) return when.in.includes(v) ? [when.key] : null;
  if ('includes' in when) return Array.isArray(v) && v.includes(when.includes) ? [when.key] : null;
  if ('gte' in when) return typeof v === 'number' && v >= when.gte ? [when.key] : null;
  return null;
}

// Pure and synchronous: the same answers always give the same flags. Used by the alert service and the scenario tests.
export function evaluateRules(answers, rules = RULES) {
  const out = [];
  for (const rule of rules) {
    const keys = check(rule.when, answers);
    if (keys) out.push({ rule, triggerKeys: [...new Set(keys)] });
  }
  return out;
}
