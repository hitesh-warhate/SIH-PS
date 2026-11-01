import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createInteractionSource } from '../../config/interactions.v1.js';
import { ANALYSIS } from './config.js';
import { analyze } from './engine.js';

export const KINDS = ['timeline', 'med_reconciliation', 'lab_table', 'interactions', 'consistency'];

// Which parts of the structured history (question-bank sections) a document type relates to (FR-B15).
const HISTORY_SECTIONS = { prescription: ['drug_allergy', 'past_history'], discharge_summary: ['drug_allergy', 'past_history'], lab_report: ['past_history'], other: [] };
// LOINC document type codes for the FHIR DocumentReference.
const LOINC = { prescription: ['57833-6', 'Prescription for medication'], lab_report: ['11502-2', 'Laboratory report'], discharge_summary: ['18842-5', 'Discharge summary'] };

const sha = (s) => createHash('sha256').update(s).digest('hex');
const answerValue = (a) => (a && !a.skipped && a.value != null ? a.value : null);

// FHIR R4 DocumentReference built from references only. Identifier values stay in patient_identifiers (encrypted); Phase 8 resolves
// them when it pushes the record. Status is 'preliminary' because the content was read by machine and not yet reviewed.
export function documentReference(doc, { patientId, encounterId }) {
  const loinc = LOINC[doc.doc_type];
  return {
    resourceType: 'DocumentReference', id: doc.id, status: 'current', docStatus: 'preliminary',
    ...(loinc ? { type: { coding: [{ system: 'http://loinc.org', code: loinc[0], display: loinc[1] }], text: loinc[1] } } : { type: { text: 'Other document' } }),
    subject: { reference: `Patient/${patientId}` },
    ...(doc.document_date ? { date: doc.document_date } : {}),
    context: { encounter: [{ reference: `Encounter/${encounterId}` }] },
    content: [{ attachment: { contentType: doc.mime, title: doc.original_name, url: `urn:patientcase:document:${doc.id}` } }],
  };
}

// Loads everything the engine needs for one encounter and shapes it as the engine's input. Row order is fixed so the same data
// always gives the same input (and so the same input hash).
export async function loadInput(pool, encounterId) {
  const { rows: [enc] } = await pool.query(
    `SELECT e.id, e.patient_id, to_char(e.started_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS visit_date, p.full_name, p.date_of_birth, p.sex
       FROM encounters e JOIN patients p ON p.id = e.patient_id WHERE e.id = $1`, [encounterId]);
  if (!enc) return null;

  const { rows: docs } = await pool.query(
    `SELECT * FROM documents WHERE encounter_id = $1 AND storage_ref IS NOT NULL ORDER BY sort_order, created_at, id`, [encounterId]);
  const processed = docs.filter((d) => d.processed_at);
  const ids = processed.map((d) => d.id);
  const rowsOf = async (sql) => (ids.length ? (await pool.query(sql, [ids])).rows : []);
  const order = `ORDER BY document_id, page NULLS LAST, (region->>'y0')::numeric NULLS LAST`;
  const [meds, labs, ents] = await Promise.all([
    rowsOf(`SELECT * FROM medications WHERE document_id = ANY($1) ${order}, name, id`),
    rowsOf(`SELECT * FROM lab_results WHERE document_id = ANY($1) ${order}, test_name, id`),
    rowsOf(`SELECT * FROM extracted_entities WHERE document_id = ANY($1) ${order}, entity_type, value, id`),
  ]);
  const of = (rows, id) => rows.filter((r) => r.document_id === id);

  const { rows: ans } = await pool.query(
    `SELECT question_key, answer FROM interview_responses WHERE encounter_id = $1 AND question_key IN ('drug.current_any','drug.current_list','allergy.any','allergy.list')`, [encounterId]);
  const a = Object.fromEntries(ans.map((r) => [r.question_key, answerValue(r.answer)]));

  return {
    pending: docs.length - processed.length,
    patientId: enc.patient_id,
    input: {
      asOf: enc.visit_date,
      patient: { name: enc.full_name, dob: enc.date_of_birth, sex: enc.sex },
      answers: { currentAny: a['drug.current_any'] ?? null, currentList: a['drug.current_list'] ?? null, allergyAny: a['allergy.any'] ?? null, allergyList: a['allergy.list'] ?? null },
      documents: processed.map((d) => {
        const entities = of(ents, d.id);
        const identity = (type) => entities.find((e) => e.entity_type === type)?.value ?? null;
        const text = (d.ocr_text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
        return {
          id: d.id, name: d.original_name, docType: d.doc_type, date: d.document_date, sortOrder: d.sort_order, status: d.status, attentionReason: d.attention_reason,
          textHash: text.length > 40 ? sha(text) : null,
          meds: of(meds, d.id).map((m) => ({ name: m.name, form: m.form, dose: m.dose, frequency: m.frequency, date: m.prescribed_on, needsReview: m.needs_review,
            confidence: m.confidence == null ? null : Number(m.confidence), region: m.region })),
          labs: of(labs, d.id).map((l) => ({ testName: l.test_name, value: l.value == null ? null : Number(l.value), unit: l.unit, refLow: l.ref_low == null ? null : Number(l.ref_low),
            refHigh: l.ref_high == null ? null : Number(l.ref_high), date: l.result_date, needsReview: l.needs_review,
            confidence: l.confidence == null ? null : Number(l.confidence), region: l.region })),
          diagnoses: entities.filter((e) => e.entity_type === 'diagnosis').map((e) => ({ value: e.value, needsReview: e.needs_review })),
          procedures: entities.filter((e) => e.entity_type === 'procedure').map((e) => ({ value: e.value, needsReview: e.needs_review })),
          identity: { name: identity('patient_name'), age: identity('patient_age') == null ? null : Number(identity('patient_age')), sex: identity('patient_sex') },
        };
      }),
    },
  };
}

// Stores and re-runs the cross-document analysis. Results are saved by kind in analysis_results (FR-B8 to B12) and rebuilt whenever
// a file is added, removed, replaced or reordered, a file finishes processing, or a medicine or allergy answer changes.
export function createAnalysisService({ pool, interactionSource = createInteractionSource(), delayMs = 100, log = console }) {
  async function run(encounterId, { trigger = 'manual', force = false } = {}) {
    const started = new Date();
    const t0 = performance.now();
    const loaded = await loadInput(pool, encounterId);
    if (!loaded) return null;
    const { input, patientId, pending } = loaded;
    const results = analyze(input, { interactionSource });
    const computeMs = Math.round(performance.now() - t0);
    const hash = sha(JSON.stringify([ANALYSIS.version, input]));

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`analysis:${encounterId}`]);
      const { rows: have } = await client.query('SELECT kind, input_hash FROM analysis_results WHERE encounter_id = $1', [encounterId]);
      const unchanged = !force && have.length === KINDS.length && have.every((r) => r.input_hash === hash);
      if (!unchanged) {
        for (const kind of KINDS) {
          await client.query(
            `INSERT INTO analysis_results (encounter_id, kind, payload, input_hash, analysis_version, computed_at)
             VALUES ($1,$2,$3,$4,$5,now())
             ON CONFLICT (encounter_id, kind) DO UPDATE SET payload = $3, input_hash = $4, analysis_version = $5, computed_at = now()`,
            [encounterId, kind, JSON.stringify(results[kind]), hash, ANALYSIS.version]);
        }
        await storeLinks(client, encounterId, patientId);
      }
      const { rows: [u] } = await client.query('SELECT max(uploaded_at) AS at FROM documents WHERE encounter_id = $1 AND storage_ref IS NOT NULL', [encounterId]);
      const finished = new Date();
      await client.query(
        `INSERT INTO analysis_runs (encounter_id, trigger, outcome, document_count, upload_complete_at, started_at, finished_at, compute_ms, ready_ms, input_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [encounterId, trigger, unchanged ? 'unchanged' : 'stored', input.documents.length, u.at, started, finished, computeMs,
          u.at && !pending ? Math.max(0, finished - u.at) : null, hash]);
      await client.query('COMMIT');
      return { stored: !unchanged, computeMs, hash, results };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // FR-B15: tie each document to the history sections it relates to and to the identifiers the patient holds.
  async function storeLinks(client, encounterId, patientId) {
    const { rows: docs } = await client.query(
      `SELECT * FROM documents WHERE encounter_id = $1 AND storage_ref IS NOT NULL AND processed_at IS NOT NULL`, [encounterId]);
    const { rows: ids } = await client.query('SELECT DISTINCT type FROM patient_identifiers WHERE patient_id = $1 ORDER BY type', [patientId]);
    for (const d of docs) {
      await client.query(
        `INSERT INTO document_links (document_id, encounter_id, patient_id, history_sections, identifier_types, fhir, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,now())
         ON CONFLICT (document_id) DO UPDATE SET history_sections = $4, identifier_types = $5, fhir = $6, updated_at = now()`,
        [d.id, encounterId, patientId, HISTORY_SECTIONS[d.doc_type] ?? [], ids.map((r) => r.type), JSON.stringify(documentReference(d, { patientId, encounterId }))]);
    }
  }

  // ---- automatic re-runs: changes arriving close together are coalesced into one run ----
  const state = new Map(); // encounterId -> { timer, running, again, trigger }
  function schedule(encounterId, trigger = 'change') {
    let s = state.get(encounterId);
    if (!s) state.set(encounterId, (s = { timer: null, running: false, again: false, trigger }));
    s.trigger = trigger;
    if (s.running) { s.again = true; return; }
    if (s.timer) return;
    s.timer = setTimeout(() => start(encounterId), delayMs);
  }
  async function start(encounterId) {
    const s = state.get(encounterId);
    s.timer = null;
    s.running = true;
    try {
      await run(encounterId, { trigger: s.trigger });
    } catch (err) {
      log.error('analysis failed', encounterId, err);
    }
    s.running = false;
    if (s.again) { s.again = false; s.timer = setTimeout(() => start(encounterId), delayMs); } else state.delete(encounterId);
  }
  const idle = async () => { while (state.size) await new Promise((r) => setTimeout(r, 5)); };

  // What the doctor screen reads: the five kinds, when they were computed, and whether files are still being read.
  async function read(encounterId) {
    let { rows } = await pool.query('SELECT kind, payload, computed_at FROM analysis_results WHERE encounter_id = $1', [encounterId]);
    if (rows.length < KINDS.length) {
      if (!await run(encounterId, { trigger: 'first_read' })) return null;
      ({ rows } = await pool.query('SELECT kind, payload, computed_at FROM analysis_results WHERE encounter_id = $1', [encounterId]));
    }
    const { rows: [c] } = await pool.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'done')::int AS done, count(*) FILTER (WHERE status = 'needs_attention')::int AS needs_attention,
              count(*) FILTER (WHERE status IN ('waiting','reading'))::int AS pending
         FROM documents WHERE encounter_id = $1 AND storage_ref IS NOT NULL`, [encounterId]);
    const { rows: links } = await pool.query(
      'SELECT document_id, history_sections, identifier_types, fhir FROM document_links WHERE encounter_id = $1 ORDER BY document_id', [encounterId]);
    return {
      results: Object.fromEntries(rows.map((r) => [r.kind, r.payload])),
      computedAt: new Date(Math.max(...rows.map((r) => +r.computed_at))).toISOString(),
      documents: { total: c.total, done: c.done, needsAttention: c.needs_attention, pending: c.pending },
      links: links.map((l) => ({ documentId: l.document_id, historySections: l.history_sections, identifierTypes: l.identifier_types, fhir: l.fhir })),
    };
  }

  return { run, schedule, idle, read, interactionSource };
}
