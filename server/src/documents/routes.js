import express from 'express';
import { audit } from '../patients.js';
import { pdfPageCount, sniff } from './files.js';

// Patient-portal document routes. They return status only: never extracted values, document types, flags or confidence (FR-P5).
// Mounted behind a live session and the "documents" consent, so nothing is stored for a patient who refused it.
export function createDocumentsRouter({ pool, store, pipeline, limits, analysis }) {
  const router = express.Router();
  const body = express.raw({ type: () => true, limit: limits.maxBytes });
  const bad = (res, status, error, extra = {}) => res.status(status).json({ error, ...extra });

  const view = (d) => ({
    id: d.id, name: d.original_name, kind: d.mime === 'application/pdf' ? 'pdf' : 'image', status: d.status, progress: d.progress,
    attentionReason: d.attention_reason, order: d.sort_order,
  });
  const list = async (encounterId) => (await pool.query('SELECT * FROM documents WHERE encounter_id = $1 AND storage_ref IS NOT NULL ORDER BY sort_order, created_at', [encounterId])).rows;

  const locked = async (req, res, next) => {
    const { rows: [e] } = await pool.query('SELECT submitted_at FROM encounters WHERE id = $1', [req.pSession.encounter_id]);
    if (e.submitted_at) return bad(res, 409, 'already_submitted');
    next();
  };

  // Type by magic bytes, size by the limit, pages for a PDF. Quality is judged by the worker, which can ask for a retake.
  async function inspect(buf) {
    if (!Buffer.isBuffer(buf) || !buf.length) return { error: [400, 'empty_file'] };
    const type = sniff(buf);
    if (!type) return { error: [415, 'unsupported_type'] };
    let pages = null;
    if (type.kind === 'pdf') {
      pages = await pdfPageCount(buf);
      if (pages && pages > limits.maxPages) return { error: [422, 'too_many_pages', { maxPages: limits.maxPages }] };
    }
    return { type, pages };
  }
  const name = (req) => { try { return decodeURIComponent(String(req.headers['x-file-name'] ?? 'document')).replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120); } catch { return 'document'; } };

  router.get('/', async (req, res) => {
    res.json({ documents: (await list(req.pSession.encounter_id)).map(view), limits });
  });

  router.post('/', locked, body, async (req, res) => {
    const enc = req.pSession.encounter_id;
    const current = await list(enc);
    if (current.length >= limits.maxFiles) return bad(res, 409, 'too_many_files', { maxFiles: limits.maxFiles });
    const found = await inspect(req.body);
    if (found.error) return bad(res, ...found.error);
    const ref = await store.put(req.body);
    const order = current.reduce((m, d) => Math.max(m, d.sort_order), 0) + 1;
    const { rows: [d] } = await pool.query(
      `INSERT INTO documents (encounter_id, storage_ref, original_name, mime, size_bytes, page_count, sort_order, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'waiting') RETURNING *`,
      [enc, ref, name(req), found.type.mime, req.body.length, found.pages, order]);
    await audit(pool, { actorType: 'patient', actorId: req.user.sub, action: 'document_uploaded', objectType: 'document', objectId: d.id });
    pipeline.enqueue(d.id);
    analysis?.schedule(enc, 'document_added');
    res.status(202).json({ document: view(d) });
  });

  // Reorder before submission. Registered before /:id so "order" is not read as an id.
  router.put('/order', locked, async (req, res) => {
    const ids = req.body?.ids;
    const current = await list(req.pSession.encounter_id);
    if (!Array.isArray(ids) || ids.length !== current.length || !current.every((d) => ids.includes(d.id))) return bad(res, 400, 'invalid_input');
    for (let i = 0; i < ids.length; i++) await pool.query('UPDATE documents SET sort_order = $2 WHERE id = $1', [ids[i], i + 1]);
    await audit(pool, { actorType: 'patient', actorId: req.user.sub, action: 'documents_reordered', objectType: 'encounter', objectId: req.pSession.encounter_id });
    analysis?.schedule(req.pSession.encounter_id, 'documents_reordered');
    res.json({ documents: (await list(req.pSession.encounter_id)).map(view) });
  });

  const own = async (req, res) => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) { bad(res, 400, 'invalid_input'); return null; }
    const { rows: [d] } = await pool.query('SELECT * FROM documents WHERE id = $1 AND encounter_id = $2 AND storage_ref IS NOT NULL', [req.params.id, req.pSession.encounter_id]);
    if (!d) { bad(res, 404, 'not_found'); return null; }
    return d;
  };

  router.delete('/:id', locked, async (req, res) => {
    const d = await own(req, res);
    if (!d) return;
    await pool.query('DELETE FROM documents WHERE id = $1', [d.id]); // extracted rows go with it (ON DELETE CASCADE)
    await store.remove(d.storage_ref);
    await audit(pool, { actorType: 'patient', actorId: req.user.sub, action: 'document_removed', objectType: 'document', objectId: d.id });
    analysis?.schedule(d.encounter_id, 'document_removed');
    res.json({ removed: true });
  });

  // Retake: replace the file, keep its place, and process it again.
  router.put('/:id', locked, body, async (req, res) => {
    const d = await own(req, res);
    if (!d) return;
    const found = await inspect(req.body);
    if (found.error) return bad(res, ...found.error);
    const ref = await store.put(req.body);
    await pool.query('DELETE FROM extracted_entities WHERE document_id = $1', [d.id]);
    await pool.query('DELETE FROM medications WHERE document_id = $1', [d.id]);
    await pool.query('DELETE FROM lab_results WHERE document_id = $1', [d.id]);
    const { rows: [n] } = await pool.query(
      `UPDATE documents SET storage_ref = $2, original_name = $3, mime = $4, size_bytes = $5, page_count = $6, status = 'waiting', progress = 0,
              attention_reason = NULL, attempts = 0, error = NULL, quality = NULL, doc_type = NULL, ocr_text = NULL, ocr_confidence = NULL, processed_at = NULL,
              document_date = NULL, uploaded_at = now()
        WHERE id = $1 RETURNING *`,
      [d.id, ref, name(req), found.type.mime, req.body.length, found.pages]);
    await store.remove(d.storage_ref);
    await audit(pool, { actorType: 'patient', actorId: req.user.sub, action: 'document_replaced', objectType: 'document', objectId: d.id });
    pipeline.enqueue(d.id);
    analysis?.schedule(d.encounter_id, 'document_replaced');
    res.status(202).json({ document: view(n) });
  });

  return router;
}
