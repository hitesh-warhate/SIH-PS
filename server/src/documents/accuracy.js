// Scores what the pipeline extracted against the ground truth of a synthetic document. Used by the benchmark script and the tests.
const norm = (s) => String(s ?? '').normalize('NFC').replace(/[‌‍]/g, '').replace(/[.\s]+$/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

// Every score is [correct, total]. A field only counts as correct when it matches the truth exactly (after light normalisation).
export function score(truth, got) {
  const s = { class: [0, 1], date: [0, 1], diagnoses: [0, truth.diagnoses.length], procedures: [0, truth.procedures.length], medications: [0, truth.meds.length], labs: [0, truth.labs.length] };
  if (got.docType === truth.docType) s.class[0]++;
  if ((got.date ?? null) === (truth.date ?? null)) s.date[0]++;

  const has = (list, text) => list.some((e) => norm(e) === norm(text));
  for (const d of truth.diagnoses) if (has(got.diagnoses, d)) s.diagnoses[0]++;
  for (const p of truth.procedures) if (has(got.procedures, p)) s.procedures[0]++;

  for (const m of truth.meds) {
    if (got.meds.some((g) => norm(g.name) === norm(m.name) && norm(g.dose) === norm(m.dose) && norm(g.frequency).startsWith(norm(m.frequency)))) s.medications[0]++;
  }
  for (const l of truth.labs) {
    if (got.labs.some((g) => norm(g.test_name) === norm(l.test_name) && Number(g.value) === l.value && norm(g.unit) === norm(l.unit) && g.flag === l.flag)) s.labs[0]++;
  }
  // false positives: extracted items that are not in the truth (precision)
  s.extra = {
    medications: got.meds.filter((g) => !truth.meds.some((m) => norm(m.name) === norm(g.name))).length,
    labs: got.labs.filter((g) => !truth.labs.some((l) => norm(l.test_name) === norm(g.test_name))).length,
    diagnoses: got.diagnoses.filter((g) => !has(truth.diagnoses, g)).length,
    procedures: got.procedures.filter((g) => !has(truth.procedures, g)).length,
  };
  return s;
}

export function addScores(a, b) {
  const out = { extra: { medications: 0, labs: 0, diagnoses: 0, procedures: 0 } };
  for (const k of ['class', 'date', 'diagnoses', 'procedures', 'medications', 'labs']) out[k] = [(a?.[k]?.[0] ?? 0) + b[k][0], (a?.[k]?.[1] ?? 0) + b[k][1]];
  for (const k of Object.keys(out.extra)) out.extra[k] = (a?.extra?.[k] ?? 0) + b.extra[k];
  return out;
}

export const pct = ([c, t]) => (t ? `${((c / t) * 100).toFixed(0)}% (${c}/${t})` : 'n/a');
