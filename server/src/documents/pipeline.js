import { audit } from '../patients.js';
import { classify } from './classify.js';
import { CONFIDENCE } from './config.js';
import { extract } from './extract.js';
import { checkImageQuality } from './quality.js';
import { AttentionError } from './ocr.js';
import { createJobQueue } from './queue.js';

// Processes one stored document end to end: quality check, read (OCR or text layer), classify, extract, save.
// Failures are isolated per file: a bad file ends in needs_attention with a reason, the others carry on (FR-B6, FR-B7).
export function createDocumentPipeline({ pool, store, reader, workers = 3, maxAttempts = 3, baseDelayMs = 500 }) {
  const setStatus = (id, fields) => {
    const cols = Object.keys(fields);
    return pool.query(`UPDATE documents SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1`, [id, ...Object.values(fields)]);
  };
  const needsAttention = (id, reason, extra = {}) =>
    setStatus(id, { status: 'needs_attention', attention_reason: reason, progress: 100, processed_at: new Date(), ...extra });

  // Listeners hear about every file that finishes (read, or given up on), so the cross-document analysis can be rebuilt (Phase 5).
  const listeners = [];
  const notify = async (id) => {
    const { rows: [d] } = await pool.query('SELECT encounter_id FROM documents WHERE id = $1', [id]);
    if (d) listeners.forEach((fn) => fn(d.encounter_id, id));
  };

  async function process(id, attempt) {
    const { rows: [doc] } = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);
    if (!doc || !doc.storage_ref) return; // removed while waiting
    await setStatus(id, { status: 'reading', progress: 10, attempts: attempt, attention_reason: null, error: null });
    const kind = doc.mime === 'application/pdf' ? 'pdf' : 'image';
    try {
      const buffer = await store.get(doc.storage_ref);

      if (kind === 'image') {
        const q = await checkImageQuality(buffer);
        await setStatus(id, { progress: 30, quality: q.metrics });
        // A poor photo is still read, so the physician is never left with nothing, but the patient is asked to retake it.
        if (q.issues.includes('unreadable')) throw new AttentionError('unreadable');
        doc.qualityIssues = q.issues;
      }

      const read = await reader.read({ buffer, kind });
      await setStatus(id, { progress: 65 });
      const result = extract(read.pages);
      const cls = classify(result.text);
      await setStatus(id, { progress: 85 });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: [still] } = await client.query('SELECT id FROM documents WHERE id = $1 FOR UPDATE', [id]);
        if (!still) { await client.query('ROLLBACK'); return; } // removed while being read
        await client.query('DELETE FROM extracted_entities WHERE document_id = $1', [id]);
        await client.query('DELETE FROM medications WHERE document_id = $1', [id]);
        await client.query('DELETE FROM lab_results WHERE document_id = $1', [id]);
        for (const e of result.entities) {
          await client.query(
            'INSERT INTO extracted_entities (document_id, entity_type, value, confidence, page, region, needs_review) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            [id, e.entity_type, e.value, e.confidence, e.page, e.region, e.needs_review]);
        }
        for (const m of result.medications) {
          await client.query(
            'INSERT INTO medications (document_id, name, form, dose, frequency, prescribed_on, confidence, page, region, needs_review) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
            [id, m.name, m.form, m.dose, m.frequency, m.prescribed_on, m.confidence, m.page, m.region, m.needs_review]);
        }
        for (const l of result.labs) {
          await client.query(
            `INSERT INTO lab_results (document_id, test_name, value, unit, ref_low, ref_high, ref_text, flag, result_date, confidence, page, region, needs_review)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [id, l.test_name, l.value, l.unit, l.ref_low, l.ref_high, l.ref_text, l.flag, l.result_date, l.confidence, l.page, l.region, l.needs_review]);
        }
        const poor = doc.qualityIssues?.[0];
        await client.query(
          `UPDATE documents SET doc_type = $2, classify_confidence = $3, document_date = $4, ocr_confidence = $5, ocr_text = $6, page_count = $7,
                  status = $8, attention_reason = $9, progress = 100, processed_at = now() WHERE id = $1`,
          [id, cls.type, cls.confidence, result.documentDate, result.confidence, result.text, read.pages.length,
            poor ? 'needs_attention' : 'done', poor ?? null]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
      await audit(pool, { actorType: 'system', action: 'document_processed', objectType: 'document', objectId: id, detail: { docType: cls.type, engine: reader.engine } });
      await notify(id);
    } catch (err) {
      if (err instanceof AttentionError) {
        // nothing readable in a poor photo is most usefully explained by the photo problem itself
        const reason = err.reason === 'no_text_found' && doc.qualityIssues?.length ? doc.qualityIssues[0] : err.reason;
        await needsAttention(id, reason);
        await notify(id);
        return; // not worth retrying
      }
      await setStatus(id, { error: String(err.message).slice(0, 300) });
      throw err; // transient: the queue retries with back-off
    }
  }

  const queue = createJobQueue({
    run: process, concurrency: workers, maxAttempts, baseDelayMs,
    isRetryable: (err) => !(err instanceof AttentionError),
    onGiveUp: async (id) => { await needsAttention(id, 'processing_failed'); await notify(id); },
  });

  return {
    queue,
    onDone: (fn) => listeners.push(fn),
    enqueue: (id) => queue.enqueue(id),
    idle: () => queue.idle(),
    // After a restart, files that were waiting or being read go back in the queue.
    async recover() {
      const { rows } = await pool.query(`SELECT id FROM documents WHERE status IN ('waiting', 'reading') AND storage_ref IS NOT NULL`);
      rows.forEach((r) => queue.enqueue(r.id));
      return rows.length;
    },
    CONFIDENCE,
  };
}
