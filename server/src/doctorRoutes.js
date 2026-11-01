import express from 'express';
import { alertStream } from './alerts/sse.js';
import { ageAt } from './analysis/normalize.js';
import { audit } from './patients.js';
import { doctorQueue } from './summary/service.js';

const UUID = /^[0-9a-f-]{36}$/;

// Doctor portal API (Phase 3: the alert banner; Phase 5: the cross-document analysis; the full workspace arrives in Phase 6).
// Every route needs the doctor role. Analysis results are decision support for the physician and never reach the Patient portal.
export function createDoctorRouter({ pool, hub, service, help, analysis, summary, store, integration }) {
  const router = express.Router();
  router.use((req, res, next) => {
    if (req.user?.role !== 'doctor') return res.status(req.user ? 403 : 401).json({ error: req.user ? 'wrong_portal' : 'not_signed_in' });
    next();
  });

  async function departmentOf(userId) {
    const { rows: [u] } = await pool.query('SELECT department_id FROM users WHERE id = $1', [userId]);
    return u?.department_id ?? null;
  }

  router.get('/alerts', async (req, res) => {
    res.json({ alerts: await service.list({ role: 'doctor', departmentId: await departmentOf(req.user.sub) }) });
  });
  router.get('/alerts/stream', alertStream({ pool, hub, service, help, role: 'doctor' }));

  // Today's queue (DB-1 to DB-3, DB-6, DB-8): alerts first, then token order, with status chips, counters and warning chips.
  router.get('/encounters', async (req, res) => {
    const { q = '', status = '', alert = '' } = req.query;
    res.json(await doctorQueue(pool, { departmentId: await departmentOf(req.user.sub), q: String(q).slice(0, 80), status: String(status), alert: alert === '1' }));
  });

  async function reachable(req, res) {
    if (!UUID.test(req.params.id)) { res.status(400).json({ error: 'invalid_input' }); return null; }
    const { rows: [e] } = await pool.query(
      `SELECT e.id, e.status, p.full_name, p.date_of_birth, p.sex, e.department_id FROM encounters e JOIN patients p ON p.id = e.patient_id WHERE e.id = $1`, [req.params.id]);
    const dept = await departmentOf(req.user.sub);
    if (!e || (dept && e.department_id && e.department_id !== dept)) { res.status(404).json({ error: 'not_found' }); return null; }
    return e;
  }

  // The five analysis results for one encounter (FR-B8 to B12) with the document links (FR-B15).
  router.get('/encounters/:id/analysis', async (req, res) => {
    const e = await reachable(req, res);
    if (!e) return;
    const out = await analysis.read(e.id);
    await audit(pool, { actorType: 'doctor', actorId: req.user.sub, action: 'analysis_viewed', objectType: 'encounter', objectId: e.id });
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    res.json({ encounter: { id: e.id, status: e.status, name: e.full_name, age: ageAt(e.date_of_birth, today), sex: e.sex }, ...out });
  });

  router.post('/encounters/:id/analysis/rerun', async (req, res) => {
    const e = await reachable(req, res);
    if (!e) return;
    await analysis.run(e.id, { trigger: 'doctor_rerun', force: true });
    await audit(pool, { actorType: 'doctor', actorId: req.user.sub, action: 'analysis_rerun', objectType: 'encounter', objectId: e.id });
    res.json({ results: (await analysis.read(e.id)).results });
  });


  // ---- Summary and decision (Phase 6) ----
  router.get('/encounters/:id/summary', async (req, res) => {
    const e = await reachable(req, res);
    if (!e) return;
    await audit(pool, { actorType: 'doctor', actorId: req.user.sub, action: 'summary_viewed', objectType: 'encounter', objectId: e.id });
    res.json(await summary.read(e.id));
  });

  // The doctor calls the patient: Ready -> In consultation. The summary is already on screen (FR-C3).
  router.post('/encounters/:id/consult', async (req, res) => {
    const e = await reachable(req, res);
    if (!e) return;
    if (!await summary.consult(e.id, req.user.sub)) return res.status(409).json({ error: 'invalid_transition', status: e.status });
    res.json({ status: 'in_consultation' });
  });

  const decision = (action) => async (req, res) => {
    const e = await reachable(req, res);
    if (!e) return;
    const { edits, note } = req.body ?? {};
    if (action === 'amend' && (!Array.isArray(edits) || !edits.length || edits.some((x) => typeof x?.id !== 'string' || typeof x?.text !== 'string' || !x.text.trim()))) {
      return res.status(400).json({ error: 'invalid_input' });
    }
    if (action === 'manual' && (typeof note !== 'string' || !note.trim())) return res.status(400).json({ error: 'invalid_input' });
    const r = await summary.decide(e.id, req.user.sub, action, { edits, note: typeof note === 'string' ? note.slice(0, 10000) : null });
    if (r.error) return res.status(409).json(r);
    // accept, amend and manual documentation complete the case, so the confirmed record goes out; a reject has nothing to send yet
    if (r.status === 'completed') await integration.onConfirmed(e.id);
    res.json(r);
  };
  router.post('/encounters/:id/summary/accept', decision('accept'));
  router.post('/encounters/:id/summary/amend', decision('amend'));
  router.post('/encounters/:id/summary/reject', decision('reject'));
  router.post('/encounters/:id/summary/manual', decision('manual'));

  // The original scan, so each extracted value can be checked beside it (DB-7).
  router.get('/encounters/:id/documents/:docId/file', async (req, res) => {
    const e = await reachable(req, res);
    if (!e || !UUID.test(req.params.docId)) return e && res.status(400).json({ error: 'invalid_input' });
    const { rows: [d] } = await pool.query('SELECT storage_ref, mime FROM documents WHERE id = $1 AND encounter_id = $2 AND storage_ref IS NOT NULL', [req.params.docId, e.id]);
    if (!d) return res.status(404).json({ error: 'not_found' });
    await audit(pool, { actorType: 'doctor', actorId: req.user.sub, action: 'document_viewed', objectType: 'document', objectId: req.params.docId });
    res.set({ 'content-type': d.mime, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' }).send(await store.get(d.storage_ref));
  });

  return router;
}
