import { audit } from '../patients.js';
import { buildBundle } from './fhir.js';
import { validateBundle } from './validate.js';

const TARGETS = [['his', 'his_sharing'], ['abha', 'abha_linking']];

// Pushes the confirmed summary to the hospital system and to the patient's ABHA record (FR-D4, FR-D5, DB-11). Each push is its own delivery
// row: queued, retried with back-off, acknowledged, or visibly failed. A purpose the patient did not consent to is never sent, and the row
// says so ('not_sent'). Revoking a purpose cancels what is still waiting.
export function createIntegration({ pool, crypto, his, abdm, maxAttempts = 5, baseDelayMs = 30_000, log = console }) {
  async function consentScope(encounterId) {
    const { rows: [r] } = await pool.query(
      `SELECT c.scope FROM patient_sessions s JOIN consents c ON c.id = s.consent_id WHERE s.encounter_id = $1 ORDER BY s.created_at DESC LIMIT 1`, [encounterId]);
    return r?.scope ?? {};
  }

  async function loadInput(encounterId) {
    const { rows: [e] } = await pool.query(
      `SELECT e.id, e.patient_id, e.started_at, p.full_name, p.sex, p.date_of_birth, s.id AS summary_id, s.language, s.decided_at, s.decided_by, u.full_name AS doctor
         FROM encounters e JOIN patients p ON p.id = e.patient_id JOIN summaries s ON s.encounter_id = e.id LEFT JOIN users u ON u.id = s.decided_by
        WHERE e.id = $1 AND s.decision IS NOT NULL`, [encounterId]);
    if (!e) return null;
    const { rows: [v] } = await pool.query('SELECT version, content, note, kind FROM summary_versions WHERE summary_id = $1 ORDER BY version DESC LIMIT 1', [e.summary_id]);
    const { rows: results } = await pool.query('SELECT kind, payload FROM analysis_results WHERE encounter_id = $1', [encounterId]);
    const a = Object.fromEntries(results.map((r) => [r.kind, r.payload]));
    const { rows: [abha] } = await pool.query(`SELECT value_encrypted FROM patient_identifiers WHERE patient_id = $1 AND type = 'abha' LIMIT 1`, [e.patient_id]);
    const { rows: links } = await pool.query('SELECT fhir FROM document_links WHERE encounter_id = $1 ORDER BY document_id', [encounterId]);
    const rejected = v.kind === 'manual';
    return {
      abha: abha ? crypto.decrypt(abha.value_encrypted) : null,
      input: {
        patient: { id: e.patient_id, name: e.full_name, sex: e.sex, dob: e.date_of_birth, abha: abha ? crypto.decrypt(abha.value_encrypted) : null },
        encounter: { id: e.id, startedAt: new Date(e.started_at).toISOString() },
        practitioner: { id: e.decided_by, name: e.doctor ?? 'Doctor' },
        summary: { lang: e.language, content: rejected ? { sections: [] } : v.content, note: rejected ? v.note : null, version: v.version, decidedAt: new Date(e.decided_at).toISOString() },
        medications: (a.med_reconciliation?.medications ?? []).map((m) => ({ name: m.name, dose: m.entries.find((x) => x.dose)?.dose ?? null, frequency: m.entries.find((x) => x.frequency)?.frequency ?? null })),
        labs: (a.lab_table?.tests ?? []).flatMap((t) => t.points.filter((p) => !p.unitMismatch).map((p) => ({ test: t.test, value: p.value, unit: p.unit, date: p.date, refLow: p.refLow, refHigh: p.refHigh }))),
        allergies: (a.interactions?.allergies?.items ?? []).map((x) => ({ term: x.term })),
        documents: links,
      },
    };
  }

  // Called when the doctor confirms (accept, amend, or manual documentation after a reject).
  async function onConfirmed(encounterId) {
    const loaded = await loadInput(encounterId);
    if (!loaded) return { queued: [] };
    const scope = await consentScope(encounterId);
    const bundle = buildBundle(loaded.input, { includeAbha: scope.abha_linking === true });
    const validation = validateBundle(bundle);
    const { rows: [b] } = await pool.query(
      `INSERT INTO fhir_bundles (encounter_id, summary_version, bundle, validation) VALUES ($1,$2,$3,$4)
       ON CONFLICT (encounter_id, summary_version) DO UPDATE SET encounter_id = EXCLUDED.encounter_id RETURNING id`,
      [encounterId, loaded.input.summary.version, JSON.stringify(bundle), JSON.stringify(validation)]);
    const queued = [];
    for (const [target, purpose] of TARGETS) {
      let status = 'pending', reason = null;
      if (scope[purpose] !== true) { status = 'not_sent'; reason = 'no_consent'; }
      else if (target === 'abha' && !loaded.abha) { status = 'not_sent'; reason = 'no_abha_identifier'; }
      else if (!validation.valid) { status = 'failed'; reason = 'invalid_bundle'; }
      const { rows: [d] } = await pool.query(
        `INSERT INTO deliveries (encounter_id, bundle_id, target, purpose, status, reason) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (bundle_id, target) DO NOTHING RETURNING id`, [encounterId, b.id, target, purpose, status, reason]);
      if (!d) continue;
      queued.push({ target, status, reason });
      if (status === 'not_sent') await audit(pool, { actorType: 'system', action: 'push_skipped_no_consent', objectType: 'encounter', objectId: encounterId, detail: { target, reason } });
    }
    setImmediate(() => background());
    return { queued, valid: validation.valid };
  }

  async function sendOne(d) {
    const { rows: [b] } = await pool.query('SELECT bundle FROM fhir_bundles WHERE id = $1', [d.bundle_id]);
    if (d.target === 'his') return his.send(b.bundle);
    const { rows: [id] } = await pool.query(
      `SELECT pi.value_encrypted FROM patient_identifiers pi JOIN encounters e ON e.patient_id = pi.patient_id WHERE e.id = $1 AND pi.type = 'abha' LIMIT 1`, [d.encounter_id]);
    return abdm.pushRecord(b.bundle, { abhaId: crypto.decrypt(id.value_encrypted) });
  }

  // Sends every due delivery once. Safe to run from several workers: a row is claimed with FOR UPDATE SKIP LOCKED.
  async function processDue() {
    let handled = 0;
    for (;;) {
      const client = await pool.connect();
      let d;
      try {
        await client.query('BEGIN');
        ({ rows: [d] } = await client.query(
          `SELECT * FROM deliveries WHERE status = 'pending' AND next_attempt_at <= now() ORDER BY next_attempt_at LIMIT 1 FOR UPDATE SKIP LOCKED`));
        if (!d) { await client.query('COMMIT'); return handled; }
        const scope = await consentScope(d.encounter_id);
        if (scope[d.purpose] !== true) {
          await client.query(`UPDATE deliveries SET status = 'cancelled', reason = 'consent_withdrawn' WHERE id = $1`, [d.id]);
        } else {
          try {
            const ack = await sendOne(d);
            await client.query(`UPDATE deliveries SET status = 'delivered', attempts = attempts + 1, ack = $2, delivered_at = now(), last_error = NULL WHERE id = $1`, [d.id, JSON.stringify(ack)]);
            await audit(client, { actorType: 'system', action: 'push_delivered', objectType: 'encounter', objectId: d.encounter_id, detail: { target: d.target, attempts: d.attempts + 1 } });
          } catch (err) {
            const attempts = d.attempts + 1;
            const dead = attempts >= maxAttempts;
            await client.query(
              `UPDATE deliveries SET status = $2, attempts = $3, last_error = $4, next_attempt_at = now() + ($5 || ' milliseconds')::interval WHERE id = $1`,
              [d.id, dead ? 'failed' : 'pending', attempts, String(err.message).slice(0, 300), String(baseDelayMs * 2 ** (attempts - 1))]);
            await audit(client, { actorType: 'system', action: dead ? 'push_failed' : 'push_retry', objectType: 'encounter', objectId: d.encounter_id, detail: { target: d.target, attempts } });
          }
        }
        await client.query('COMMIT');
        handled++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
  }

  async function list() {
    const { rows } = await pool.query(
      `SELECT d.id, d.encounter_id, d.target, d.purpose, d.status, d.attempts, d.last_error, d.reason, d.ack, d.delivered_at, d.created_at, d.next_attempt_at,
              (b.validation->>'valid')::boolean AS valid, b.summary_version, p.full_name, qe.token_number
         FROM deliveries d JOIN fhir_bundles b ON b.id = d.bundle_id JOIN encounters e ON e.id = d.encounter_id JOIN patients p ON p.id = e.patient_id
         LEFT JOIN queue_entries qe ON qe.encounter_id = e.id
        ORDER BY (d.status = 'failed') DESC, d.created_at DESC LIMIT 200`);
    return rows.map((r) => ({
      id: r.id, encounterId: r.encounter_id, token: r.token_number, patientName: r.full_name, target: r.target, purpose: r.purpose, status: r.status,
      attempts: r.attempts, lastError: r.last_error, reason: r.reason, deliveredAt: r.delivered_at, createdAt: r.created_at, nextAttemptAt: r.next_attempt_at, summaryVersion: r.summary_version,
      ack: r.ack ? { id: r.ack.id ?? null, receivedAt: r.ack.receivedAt ?? null } : null,
    }));
  }

  async function retry(id, actor) {
    const { rowCount } = await pool.query(`UPDATE deliveries SET status = 'pending', attempts = 0, next_attempt_at = now(), last_error = NULL WHERE id = $1 AND status = 'failed' AND reason IS DISTINCT FROM 'invalid_bundle'`, [id]);
    if (rowCount) {
      await audit(pool, { actorType: 'staff', actorId: actor, userId: actor, action: 'push_retry_requested', objectType: 'delivery', objectId: id });
      setImmediate(() => background());
    }
    return rowCount === 1;
  }

  // Revocation of a purpose stops anything still waiting for it.
  async function cancelWaiting(encounterId, purpose) {
    const { rowCount } = await pool.query(`UPDATE deliveries SET status = 'cancelled', reason = 'consent_withdrawn' WHERE encounter_id = $1 AND purpose = $2 AND status = 'pending'`, [encounterId, purpose]);
    return rowCount;
  }

  // Runs started in the background are tracked so that a caller (a test, a shutdown) can wait for them.
  const running = new Set();
  function background() {
    const p = processDue().catch((err) => log.error('delivery run failed', err.message)).finally(() => running.delete(p));
    running.add(p);
    return p;
  }
  async function settle() { await Promise.all([...running]); await background(); await Promise.all([...running]); }

  let timer = null;
  return {
    onConfirmed, processDue, settle, list, retry, cancelWaiting, consentScope,
    start(intervalMs = 15_000) { timer = setInterval(() => background(), intervalMs); timer.unref?.(); },
    stop() { clearInterval(timer); },
  };
}
