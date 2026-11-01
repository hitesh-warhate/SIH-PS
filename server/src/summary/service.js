import { QUESTIONS } from '../../config/questions.v1.js';
import { ageAt } from '../analysis/normalize.js';
import { audit } from '../patients.js';
import { LANG_KEYS, findDiagnosticWording, generateSummary, summaryHash } from './generate.js';
import { canMove, transition } from './lifecycle.js';

const COMPLAINTS = QUESTIONS.find((q) => q.key === 'cc.main').options;

// Draft, versions and the doctor's decision (FR-C1, C3, C4, C7, DB-5, DB-13). The AI draft is always kept as version 1; every later
// change is a new version saying who made it, when and what it was.
export function createSummaryService({ pool, analysis, ai }) {
  async function loadAnswers(db, encounterId) {
    const { rows } = await db.query('SELECT question_key, answer, modality FROM interview_responses WHERE encounter_id = $1', [encounterId]);
    return Object.fromEntries(rows.map((r) => [r.question_key, { ...r.answer, modality: r.modality }]));
  }
  const loadDocuments = async (db, encounterId) => (await db.query(
    `SELECT id, original_name AS name, status, attention_reason FROM documents WHERE encounter_id = $1 AND storage_ref IS NOT NULL ORDER BY sort_order, created_at, id`, [encounterId])).rows
    .map((d) => ({ id: d.id, name: d.name, status: d.status, attentionReason: d.attention_reason }));

  async function build(encounterId) {
    const answers = await loadAnswers(pool, encounterId);
    const documents = await loadDocuments(pool, encounterId);
    const read = await analysis.read(encounterId);
    const { rows: [e] } = await pool.query('SELECT e.ayush_mode, p.date_of_birth FROM encounters e JOIN patients p ON p.id = e.patient_id WHERE e.id = $1', [encounterId]);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const patient = { age: e.date_of_birth ? ageAt(e.date_of_birth, today) : null };
    const content = generateSummary({ answers, analysis: read.results, documents, ayush: e.ayush_mode, patient });
    return { content, hash: summaryHash({ answers, results: read.results, documents, ayush: e.ayush_mode, age: patient.age }) };
  }

  const latest = async (db, summaryId) => (await db.query('SELECT * FROM summary_versions WHERE summary_id = $1 ORDER BY version DESC LIMIT 1', [summaryId])).rows[0];

  // Saves the AI draft (version 1, or a newer draft while nobody has decided anything yet). Returns { summaryId, changed }.
  async function generate(encounterId, { trigger = 'submit' } = {}) {
    const { content, hash } = await build(encounterId);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`summary:${encounterId}`]);
      const { rows: [pat] } = await client.query(
        'SELECT p.preferred_language FROM encounters e JOIN patients p ON p.id = e.patient_id WHERE e.id = $1', [encounterId]);
      let { rows: [s] } = await client.query('SELECT * FROM summaries WHERE encounter_id = $1', [encounterId]);
      if (!s) ({ rows: [s] } = await client.query('INSERT INTO summaries (encounter_id, language) VALUES ($1, $2) RETURNING *', [encounterId, pat.preferred_language]));
      const last = await latest(client, s.id);
      // never overwrite or stack drafts once the doctor has acted on one
      if (last && (last.kind !== 'ai_draft' || last.input_hash === hash)) { await client.query('COMMIT'); return { summaryId: s.id, changed: false }; }
      await client.query(
        `INSERT INTO summary_versions (summary_id, version, kind, content, input_hash) VALUES ($1, $2, 'ai_draft', $3, $4)`,
        [s.id, (last?.version ?? 0) + 1, JSON.stringify(content), hash]);
      await audit(client, { actorType: 'system', action: 'summary_generated', objectType: 'encounter', objectId: encounterId, detail: { trigger, generator: content.generator } });
      await client.query('COMMIT');
      ai?.schedule(encounterId); // the overview is written in the background, from the draft that was just saved
      return { summaryId: s.id, changed: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // The patient has submitted: lock the intake, analyse the files, save the draft summary and mark the case Ready.
  async function submit(encounterId) {
    const { rowCount } = await pool.query('UPDATE encounters SET submitted_at = now() WHERE id = $1 AND submitted_at IS NULL', [encounterId]);
    await analysis.run(encounterId, { trigger: 'submit' });
    await generate(encounterId, { trigger: 'submit' });
    await transition(pool, encounterId, 'ready');
    return { first: rowCount === 1 };
  }

  const view = (v) => ({ version: v.version, kind: v.kind, at: v.created_at, by: v.edited_by_name ?? null, note: v.note });

  async function versions(summaryId) {
    const { rows } = await pool.query(
      `SELECT v.version, v.kind, v.created_at, v.note, u.full_name AS edited_by_name, v.content FROM summary_versions v
         LEFT JOIN users u ON u.id = v.edited_by WHERE v.summary_id = $1 ORDER BY v.version`, [summaryId]);
    // what each version changed against the one before it, as item ids (DB-13)
    return rows.map((v, i) => {
      const prev = rows[i - 1]?.content;
      const texts = (c) => Object.fromEntries((c?.sections ?? []).flatMap((s) => s.items.map((it) => [it.id, JSON.stringify(it.text)])));
      const before = texts(prev), after = texts(v.content);
      return { ...view(v), changed: prev ? Object.keys(after).filter((k) => before[k] !== after[k]) : [] };
    });
  }

  // A case submitted before overviews existed has none: opening it starts one, and the doctor sees it as pending until it is written.
  async function narrativeFor(encounterId) {
    const have = await ai.get(encounterId, 'doctor');
    if (have) return have;
    ai.schedule(encounterId);
    return { status: 'pending', text: null, provider: null, model: null, fellBack: false, at: null };
  }

  // A patient who is still answering has no saved draft yet. The doctor still sees what has been said so far, marked as live and not yet submitted.
  async function live(encounterId, status) {
    const answers = await loadAnswers(pool, encounterId);
    const documents = await loadDocuments(pool, encounterId);
    const { rows: [e] } = await pool.query('SELECT e.ayush_mode, p.date_of_birth FROM encounters e JOIN patients p ON p.id = e.patient_id WHERE e.id = $1', [encounterId]);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const content = generateSummary({ answers, analysis: null, documents, ayush: e.ayush_mode, patient: { age: e.date_of_birth ? ageAt(e.date_of_birth, today) : null } });
    return { status, submitted: false, live: true, summary: { id: null, state: 'live', decision: null, version: 0, kind: 'live', note: null, content }, versions: [], diagnosticWording: [], narrative: null };
  }

  // What the doctor opens. A draft that nobody has acted on is refreshed when files or answers changed since it was written.
  async function read(encounterId) {
    const { rows: [e] } = await pool.query('SELECT status, submitted_at FROM encounters WHERE id = $1', [encounterId]);
    if (!e) return null;
    if (e.status === 'ready') await generate(encounterId, { trigger: 'refresh' });
    const { rows: [s] } = await pool.query('SELECT * FROM summaries WHERE encounter_id = $1', [encounterId]);
    if (!s) return live(encounterId, e.status);
    const cur = await latest(pool, s.id);
    return {
      status: e.status, submitted: Boolean(e.submitted_at),
      summary: { id: s.id, state: s.status, decision: s.decision, decidedAt: s.decided_at, version: cur.version, kind: cur.kind, note: cur.note, content: cur.content },
      versions: await versions(s.id),
      diagnosticWording: findDiagnosticWording(cur.content),
      narrative: ai ? await narrativeFor(encounterId) : null,
    };
  }

  // Accept, amend, reject, or document manually. Each is one transaction: the case moves, the version is saved, the doctor and time recorded.
  async function decide(encounterId, doctorId, action, { edits = [], note = null } = {}) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [e] } = await client.query('SELECT status FROM encounters WHERE id = $1 FOR UPDATE', [encounterId]);
      const { rows: [s] } = await client.query('SELECT * FROM summaries WHERE encounter_id = $1 FOR UPDATE', [encounterId]);
      const to = action === 'reject' ? 'rejected' : 'completed';
      const fromOk = action === 'manual' ? e?.status === 'rejected' : e?.status === 'in_consultation';
      if (!e || !s || !fromOk || !canMove(e.status, to)) { await client.query('ROLLBACK'); return { error: 'invalid_transition', status: e?.status ?? null }; }
      const cur = await latest(client, s.id);
      let content = cur.content;
      if (action === 'amend') {
        const byId = new Map(edits.map((x) => [x.id, String(x.text).slice(0, 2000)]));
        content = JSON.parse(JSON.stringify(content));
        for (const sec of content.sections) {
          for (const it of sec.items) {
            if (byId.has(it.id)) Object.assign(it, { status: 'answered', edited: true, quoted: [], text: Object.fromEntries(LANG_KEYS.map((l) => [l, byId.get(it.id)])) });
          }
        }
      }
      if (action === 'manual') content = { version: 1, generator: 'manual', manual: true, sections: [], files: content.files, completeness: content.completeness };
      const kind = { accept: 'accept', amend: 'amend', reject: 'reject', manual: 'manual' }[action];
      await client.query(
        `INSERT INTO summary_versions (summary_id, version, kind, content, edited_by, note, input_hash) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [s.id, cur.version + 1, kind, JSON.stringify(content), doctorId, note, cur.input_hash]);
      const decision = { accept: 'accepted', amend: 'amended', reject: 'rejected' }[action];
      await client.query(
        `UPDATE summaries SET status = $2, decision = COALESCE($3, decision), decided_by = $4, decided_at = now() WHERE id = $1`,
        [s.id, action === 'reject' ? 'rejected' : action === 'manual' ? s.status : 'confirmed', decision ?? null, doctorId]);
      await client.query('UPDATE encounters SET status = $2 WHERE id = $1', [encounterId, to]);
      await audit(client, { actorType: 'doctor', actorId: doctorId, action: `summary_${kind}`, objectType: 'encounter', objectId: encounterId, detail: { version: cur.version + 1, edited: edits.map((x) => x.id) } });
      await client.query('COMMIT');
      return { ok: true, status: to };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // The doctor calls the patient: Ready -> In consultation (FR-C3).
  async function consult(encounterId, doctorId) {
    const ok = await transition(pool, encounterId, 'in_consultation');
    if (ok) await audit(pool, { actorType: 'doctor', actorId: doctorId, action: 'case_opened', objectType: 'encounter', objectId: encounterId });
    return ok;
  }

  return { generate, submit, read, decide, consult };
}

// ---------- the doctor's queue (DB-1 to DB-3, DB-6, DB-8) ----------
const CHIP = { registered: 'not_started', in_intake: 'in_intake', alert: 'alert', ready: 'ready', in_consultation: 'in_consultation', completed: 'completed', rejected: 'rejected' };

export const QUEUE_LIMIT = 300;

export async function doctorQueue(pool, { departmentId = null, q = '', status = '', alert = false, limit = QUEUE_LIMIT } = {}) {
  const { rows } = await pool.query(
    `SELECT e.id, e.status, e.department_id, e.ayush_mode, qe.token_number, qe.priority, p.full_name, p.patientcase_id, p.date_of_birth, p.sex,
            r.answer->>'value' AS complaint,
            (SELECT count(*)::int FROM alerts a WHERE a.encounter_id = e.id AND a.acknowledged_at IS NULL) AS open_alerts,
            (SELECT count(*)::int FROM documents d WHERE d.encounter_id = e.id AND d.storage_ref IS NOT NULL) AS documents
       FROM encounters e JOIN patients p ON p.id = e.patient_id
       LEFT JOIN queue_entries qe ON qe.encounter_id = e.id
       LEFT JOIN interview_responses r ON r.encounter_id = e.id AND r.question_key = 'cc.main'
      WHERE e.started_at >= date_trunc('day', now())
        AND ($1::uuid IS NULL OR e.department_id IS NULL OR e.department_id = $1::uuid)`, [departmentId]);
  const ids = rows.map((r) => r.id);
  const { rows: an } = ids.length ? await pool.query(`SELECT encounter_id, kind, payload FROM analysis_results WHERE encounter_id = ANY($1)`, [ids]) : { rows: [] };
  const byEnc = {};
  for (const a of an) (byEnc[a.encounter_id] ??= {})[a.kind] = a.payload;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const age = (dob) => (dob ? Number(today.slice(0, 4)) - Number(dob.slice(0, 4)) - (today.slice(5) < dob.slice(5) ? 1 : 0) : null);

  const items = rows.map((r) => {
    const a = byEnc[r.id] ?? {};
    const issues = a.consistency?.issues ?? [];
    const complaint = r.complaint ? { key: r.complaint, label: COMPLAINTS.find((o) => o.value === r.complaint)?.label ?? [r.complaint, r.complaint, r.complaint] } : null;
    return {
      id: r.id, token: r.token_number, priority: r.priority ?? 0, name: r.full_name, patientcaseId: r.patientcase_id, age: age(r.date_of_birth), sex: r.sex,
      status: r.status, ayush: r.ayush_mode, chip: CHIP[r.status], openAlerts: r.open_alerts, documents: r.documents, complaint,
      // warning chips (DB-6): each says how many and which tab to jump to
      warnings: {
        labs: a.lab_table?.totals?.outOfRange ?? 0,
        interactions: a.interactions?.interactions?.length ?? 0,
        allergies: (a.interactions?.allergyConflicts?.length ?? 0) + (a.interactions?.allergies?.items?.length ?? 0),
        mismatches: issues.filter((i) => ['possible_wrong_patient', 'lab_conflict', 'medication_conflict', 'patient_reports_no_medicines'].includes(i.code)).length,
      },
    };
  });
  const done = (i) => i.status === 'completed' || i.status === 'rejected';
  items.sort((x, y) => Number(done(x)) - Number(done(y)) || Number(y.openAlerts > 0) - Number(x.openAlerts > 0) || y.priority - x.priority
    || (x.token ?? 1e9) - (y.token ?? 1e9) || x.name.localeCompare(y.name));

  const counters = {
    waiting: items.filter((i) => ['registered', 'in_intake', 'ready', 'alert'].includes(i.status)).length,
    notStarted: items.filter((i) => i.status === 'registered').length,
    inIntake: items.filter((i) => i.status === 'in_intake').length,
    ready: items.filter((i) => i.status === 'ready').length,
    alerts: items.filter((i) => i.openAlerts > 0).length,
    inConsultation: items.filter((i) => i.status === 'in_consultation').length,
    completed: items.filter(done).length,
  };

  const needle = q.trim().toLowerCase();
  // a number (or #number) is a token; anything else is searched in the name, the patient id and the complaint in every language
  const isToken = /^#?\d+$/.test(needle);
  const match = (i) => !needle || (isToken ? String(i.token ?? '') === needle.replace(/^#/, '')
    : i.name.toLowerCase().includes(needle) || i.patientcaseId.toLowerCase().includes(needle) || (i.complaint?.label ?? []).some((l) => l.toLowerCase().includes(needle)));
  const filtered = items.filter((i) => match(i) && (!status || i.chip === status || (status === 'alert' && i.openAlerts > 0)) && (!alert || i.openAlerts > 0));
  // a screen never needs thousands of rows; the counters above still count the whole day
  return { items: filtered.slice(0, limit), counters, truncated: filtered.length > limit, total: filtered.length };
}
