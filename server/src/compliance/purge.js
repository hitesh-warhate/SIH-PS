import { audit } from '../patients.js';

// Temporary data and consent revocation (FR-D7, DBR-7, PRD Section 14).
//
// What counts as temporary: raw voice transcripts kept beside answers, and working files in the store's temp area. Audio itself is never
// recorded (speech is recognised in the browser and only its text reaches the server), so there is no audio file to purge.
// What stays: the structured answers, the original documents the patient added (kept encrypted for the doctor, DBR-4), the analysis and the summary.
export const TEMP_TTL_MS = 15 * 60_000;

export function createPurger({ pool, store, analysis, integration }) {
  // Right after submission: drop the raw transcripts and any working files that have outlived their time-to-live.
  async function afterSubmission(encounterId) {
    const { rowCount } = await pool.query(
      `UPDATE interview_responses SET answer = answer - 'transcript' WHERE encounter_id = $1 AND answer ? 'transcript'`, [encounterId]);
    const files = await store.purgeTemp(TEMP_TTL_MS);
    if (rowCount || files) await audit(pool, { actorType: 'system', action: 'temporary_data_purged', objectType: 'encounter', objectId: encounterId, detail: { transcripts: rowCount, files } });
    return { transcripts: rowCount, files };
  }

  // The consent terms assumed here (to be confirmed by legal or compliance staff, docs/compliance-checklist.md):
  //   history      -> the interview answers of this encounter are deleted, unless the doctor has already confirmed the record
  //   documents    -> the patient's files, what was read from them and their analysis are deleted, unless the record is already confirmed
  //   his_sharing / abha_linking -> deliveries still waiting are cancelled; what was already delivered cannot be recalled by this system
  // A confirmed record is a clinical record the hospital must keep, so revocation stops further use but does not erase it.
  async function onRevoked(encounterId, purposes) {
    const { rows: [e] } = await pool.query('SELECT status FROM encounters WHERE id = $1', [encounterId]);
    const confirmed = ['completed', 'rejected'].includes(e?.status);
    const removed = {};
    for (const purpose of purposes) {
      if (purpose === 'his_sharing' || purpose === 'abha_linking') {
        removed[purpose] = await integration.cancelWaiting(encounterId, purpose);
      } else if (confirmed) {
        removed[purpose] = 'kept_confirmed_record';
      } else if (purpose === 'documents') {
        const { rows } = await pool.query('SELECT id, storage_ref FROM documents WHERE encounter_id = $1', [encounterId]);
        for (const d of rows) await store.remove(d.storage_ref);
        await pool.query('DELETE FROM documents WHERE encounter_id = $1', [encounterId]); // extracted rows and links go with them
        await analysis.run(encounterId, { trigger: 'consent_revoked' });
        removed[purpose] = rows.length;
      } else if (purpose === 'history') {
        const r = await pool.query('DELETE FROM interview_responses WHERE encounter_id = $1', [encounterId]);
        await pool.query('DELETE FROM alerts WHERE encounter_id = $1', [encounterId]);
        await pool.query('DELETE FROM summaries WHERE encounter_id = $1 AND decision IS NULL', [encounterId]);
        removed[purpose] = r.rowCount;
      }
    }
    await audit(pool, { actorType: 'system', action: 'data_removed_on_revocation', objectType: 'encounter', objectId: encounterId, detail: removed });
    return removed;
  }

  return { afterSubmission, onRevoked };
}
