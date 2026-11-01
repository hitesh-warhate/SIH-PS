import express from 'express';
import { ageYears, audit } from './patients.js';
import { checkIdentifiers, createPatient, validateRegistration } from './registration.js';
import { findDuplicates } from './patients.js';
import { alertStream } from './alerts/sse.js';

// Staff portal API. Every route requires the staff role (FR-P2, FR-P4).
export function createStaffRouter({ pool, crypto, abdm, hub, service, help, integration }) {
  const router = express.Router();
  router.use((req, res, next) => {
    if (req.user?.role !== 'staff') return res.status(req.user ? 403 : 401).json({ error: req.user ? 'wrong_portal' : 'not_signed_in' });
    next();
  });

  // Register a patient on their behalf (FR-R8). Staff confirm identity in person, so no OTP; the same duplicate check runs.
  router.post('/patients', async (req, res) => {
    const body = req.body ?? {};
    const { errors, value } = validateRegistration(body);
    const ids = await checkIdentifiers(body, abdm);
    if (errors.length || ids.errors.length) return res.status(400).json({ error: 'invalid_input', fields: [...errors, ...ids.errors] });

    const candidates = await findDuplicates(pool, { fullName: value.fullName, dob: value.born.dob, mobileHash: crypto.hash(value.mobile) });
    const decision = body.duplicateDecision;
    if (candidates.length && !decision) {
      return res.status(409).json({
        error: 'possible_duplicate',
        candidates: candidates.map((c) => ({
          patientId: c.id, patientcaseId: c.patientcase_id, fullName: c.full_name, ageYears: ageYears(c.date_of_birth),
          match: c.kind, sameMobile: c.viaMobile,
        })),
      });
    }
    if (decision?.confirmExistingId) {
      const existing = candidates.find((c) => c.id === decision.confirmExistingId);
      if (!existing) return res.status(400).json({ error: 'invalid_input', fields: ['duplicateDecision'] });
      await audit(pool, { actorType: 'staff', actorId: req.user.sub, userId: req.user.sub, action: 'duplicate_resolved_to_existing', objectType: 'patient', objectId: existing.id });
      return res.json({ existing: true, patientcaseId: existing.patientcase_id, fullName: existing.full_name });
    }
    const patient = await createPatient(pool, crypto, { value, abhaId: ids.abhaId, aadhaar: ids.aadhaar, channel: 'staff', staffId: req.user.sub });
    if (candidates.length) {
      await audit(pool, { actorType: 'staff', actorId: req.user.sub, userId: req.user.sub, action: 'duplicate_overridden', objectType: 'patient', objectId: patient.id, detail: { candidateIds: candidates.map((c) => c.id) } });
    }
    res.status(201).json({ existing: false, patientcaseId: patient.patientcase_id, fullName: patient.full_name });
  });

  // ---- Priority alerts and queue (FR-T1, FR-P2) ----
  router.get('/alerts', async (_req, res) => res.json({ alerts: await service.list({ role: 'staff' }), help: await help.list() }));
  router.get('/alerts/stream', alertStream({ pool, hub, service, help, role: 'staff' }));
  router.get('/queue', async (_req, res) => res.json({ queue: await service.queue() }));

  // ---- AYUSH mode (Phase 7): follows the department's AYUSH setting; staff can override it either way ----
  router.get('/departments', async (_req, res) => res.json({ departments: (await pool.query('SELECT id, name, ayush FROM departments ORDER BY name')).rows }));

  // body: { departmentId?: uuid, ayush?: true | false | null }. null returns to the department's own setting.
  router.put('/encounters/:id/mode', async (req, res) => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) return res.status(400).json({ error: 'invalid_input' });
    const { departmentId, ayush } = req.body ?? {};
    if ((departmentId !== undefined && departmentId !== null && !/^[0-9a-f-]{36}$/.test(String(departmentId))) || (ayush !== undefined && ayush !== null && typeof ayush !== 'boolean')) {
      return res.status(400).json({ error: 'invalid_input' });
    }
    const { rows: [e] } = await pool.query('SELECT id, department_id FROM encounters WHERE id = $1', [req.params.id]);
    if (!e) return res.status(404).json({ error: 'not_found' });
    const deptId = departmentId === undefined ? e.department_id : departmentId;
    let dept = null;
    if (deptId) {
      dept = (await pool.query('SELECT id, ayush FROM departments WHERE id = $1', [deptId])).rows[0];
      if (!dept) return res.status(404).json({ error: 'department_not_found' });
    }
    const fromDept = ayush === undefined || ayush === null;
    const mode = fromDept ? Boolean(dept?.ayush) : ayush;
    const source = fromDept ? (dept ? 'department' : null) : 'staff';
    await pool.query('UPDATE encounters SET department_id = $2, ayush_mode = $3, ayush_source = $4 WHERE id = $1', [e.id, dept?.id ?? null, mode, source]);
    await audit(pool, { actorType: 'staff', actorId: req.user.sub, action: 'ayush_mode_set', objectType: 'encounter', objectId: e.id, detail: { ayush: mode, source, departmentId: dept?.id ?? null } });
    res.json({ ayush: mode, source, departmentId: dept?.id ?? null });
  });

  // ---- Delivery to the hospital system and ABHA (Phase 8): staff see failures and can retry ----
  router.get('/deliveries', async (_req, res) => res.json({ deliveries: await integration.list() }));
  router.post('/deliveries/:id/retry', async (req, res) => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) return res.status(400).json({ error: 'invalid_input' });
    if (!await integration.retry(req.params.id, req.user.sub)) return res.status(409).json({ error: 'not_retryable' });
    res.json({ queued: true });
  });

  router.post('/alerts/:id/ack', async (req, res) => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) return res.status(400).json({ error: 'invalid_input' });
    const view = await service.acknowledge(req.params.id, req.user.sub);
    if (!view) return res.status(404).json({ error: 'not_found' });
    res.json({ acknowledged: true, alert: view });
  });

  router.get('/help-requests', async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT h.id, h.reason, h.detail, h.created_at, h.acknowledged_at, p.patientcase_id
         FROM help_requests h LEFT JOIN patients p ON p.id = h.patient_id
        ORDER BY h.acknowledged_at NULLS FIRST, h.created_at DESC LIMIT 100`);
    res.json({ helpRequests: rows });
  });

  router.post('/help-requests/:id/ack', async (req, res) => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) return res.status(400).json({ error: 'invalid_input' });
    const { rowCount } = await pool.query(
      'UPDATE help_requests SET acknowledged_by = $2, acknowledged_at = now() WHERE id = $1 AND acknowledged_at IS NULL', [req.params.id, req.user.sub]);
    if (!rowCount) return res.status(404).json({ error: 'not_found' });
    await audit(pool, { actorType: 'staff', actorId: req.user.sub, userId: req.user.sub, action: 'help_request_acknowledged', objectType: 'help_request', objectId: req.params.id });
    hub.publish('help-ack', { id: req.params.id, acknowledgedAt: new Date().toISOString() }, { roles: ['staff'] });
    res.json({ acknowledged: true });
  });

  return router;
}
