import { activeQuestions } from './interview/dialogue.js';
import { SECTIONS } from '../config/questions.v1.js';

// Success metrics from PRD Section 4.3, computed from what the system already records, so the supervised pilot can read them without extra
// instrumentation. Each metric states how it is defined here and what it cannot see. These are measurements, not targets: the targets are
// "set after pilot" and belong to the product owner and clinical lead (docs/pilot-protocol.md).

const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] : null);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const rate = (n, d) => (d ? Number((n / d).toFixed(4)) : null);

export async function computeMetrics(pool, { since = '1970-01-01', until = '9999-12-31' } = {}) {
  const win = [since, until];
  const { rows: encs } = await pool.query(
    `SELECT e.id, e.patient_id, e.started_at, e.submitted_at, e.listening_mode, e.ayush_mode,
            (SELECT min(a.at) FROM audit_logs a WHERE a.actor_id = e.patient_id::text AND a.action = 'consent_given') AS consent_at,
            (SELECT min(a.at) FROM audit_logs a WHERE a.actor_id = e.patient_id::text AND a.action IN ('history_answer_saved', 'document_uploaded') AND a.at >= e.started_at) AS first_capture_at,
            (SELECT count(*)::int FROM help_requests h WHERE h.patient_id = e.patient_id AND h.created_at BETWEEN e.started_at AND coalesce(e.submitted_at, now())) AS help
       FROM encounters e WHERE e.started_at >= $1 AND e.started_at < $2`, win);
  const submitted = encs.filter((e) => e.submitted_at);

  const staffRegistered = new Set((await pool.query(`SELECT object_id::text AS id FROM audit_logs WHERE action = 'patient_registered' AND actor_type = 'staff'`)).rows.map((r) => r.id));
  const independent = submitted.filter((e) => e.help === 0 && !staffRegistered.has(e.patient_id));

  const intake = submitted.map((e) => (new Date(e.submitted_at) - new Date(e.started_at)) / 1000);

  const modes = {};
  for (const e of encs) modes[e.listening_mode ?? 'not_chosen'] = (modes[e.listening_mode ?? 'not_chosen'] ?? 0) + 1;

  // History completeness: of the questions reachable from a patient's own answers, how many were answered, and how many of the seven standard sections have an answer.
  const { rows: ans } = submitted.length
    ? await pool.query('SELECT encounter_id, question_key, answer FROM interview_responses WHERE encounter_id = ANY($1)', [submitted.map((e) => e.id)])
    : { rows: [] };
  const by = {};
  for (const r of ans) (by[r.encounter_id] ??= {})[r.question_key] = r.answer;
  const completeness = submitted.map((e) => {
    const answers = by[e.id] ?? {};
    const active = activeQuestions(answers, { ayush: e.ayush_mode });
    const answered = active.filter((q) => answers[q.key] && !answers[q.key].skipped);
    const sections = SECTIONS.filter(([id]) => answered.some((q) => q.section === id));
    return { questions: rate(answered.length, active.length), sections: rate(sections.length, SECTIONS.length) };
  });

  const { rows: decisions } = await pool.query(
    `SELECT s.decision, s.encounter_id FROM summaries s JOIN encounters e ON e.id = s.encounter_id WHERE s.decision IS NOT NULL AND e.started_at >= $1 AND e.started_at < $2`, win);
  const { rows: amends } = await pool.query(
    `SELECT v.content, p.content AS before FROM summary_versions v JOIN summaries s ON s.id = v.summary_id
       JOIN summary_versions p ON p.summary_id = v.summary_id AND p.version = v.version - 1
       JOIN encounters e ON e.id = s.encounter_id WHERE v.kind = 'amend' AND e.started_at >= $1 AND e.started_at < $2`, win);
  const items = (c) => Object.fromEntries((c?.sections ?? []).flatMap((s) => s.items.filter((i) => i.status === 'answered').map((i) => [i.id, JSON.stringify(i.text)])));
  const editedShare = amends.map((a) => { const b = items(a.before), n = items(a.content); const all = Object.keys(n).length; return rate(Object.keys(n).filter((k) => b[k] !== n[k]).length, all); });
  const count = (d) => decisions.filter((x) => x.decision === d).length;

  const captured = encs.filter((e) => e.first_capture_at);
  const consentOk = captured.filter((e) => e.consent_at && new Date(e.consent_at) <= new Date(e.first_capture_at));

  const { rows: regs } = await pool.query(
    `SELECT actor_type, count(*)::int AS n FROM audit_logs WHERE action = 'patient_registered' AND at >= $1 AND at < $2 GROUP BY actor_type`, win);
  const { rows: runs } = await pool.query(
    `SELECT ready_ms FROM analysis_runs WHERE ready_ms IS NOT NULL AND finished_at >= $1 AND finished_at < $2 ORDER BY ready_ms`, win);

  return {
    window: { since, until },
    sessions: { started: encs.length, submitted: submitted.length },
    independentCompletion: {
      rate: rate(independent.length, encs.length), independent: independent.length, started: encs.length,
      definition: 'submitted without a help request and without staff registering the patient, over all sessions that reached consent',
    },
    selfRegistration: {
      byRoute: Object.fromEntries(regs.map((r) => [r.actor_type ?? 'unknown', r.n])),
      rate: null, cannotSee: 'registrations that were started and abandoned are not recorded, so there is no denominator',
    },
    medianIntakeSeconds: { value: median(intake), n: intake.length, definition: 'consent given to intake submitted; language selection is not recorded, so this starts slightly late' },
    listeningMode: { sessions: modes, definition: 'the mode the patient chose; "not_chosen" means they left before choosing' },
    historyCompleteness: { meanQuestionsAnswered: mean(completeness.map((c) => c.questions)), meanSectionsWithAnAnswer: mean(completeness.map((c) => c.sections)), n: completeness.length },
    physicianEdits: {
      decided: decisions.length, accepted: count('accepted'), amended: count('amended'), rejected: count('rejected'),
      amendedOrRejectedRate: rate(count('amended') + count('rejected'), decisions.length), meanShareOfItemsEditedWhenAmended: mean(editedShare),
    },
    multiFileAnalysisMs: { median: median(runs.map((r) => r.ready_ms)), max: runs.length ? runs.at(-1).ready_ms : null, n: runs.length, definition: 'last upload received to all five results stored, including reading the files' },
    consentIntegrity: { rate: rate(consentOk.length, captured.length), valid: consentOk.length, withCapture: captured.length, definition: 'consent recorded before the first answer or file, over sessions with any capture' },
    notMeasurableHere: ['ASR word error rate (needs recordings: harness in web/scripts/benchmark-wer.js)', 'OCR field accuracy on real documents (harness in server/scripts/benchmark-ocr.mjs)', 'red-flag alert latency on real screens (measured in the load test with a stand-in client)'],
  };
}
