// Help requests (help button, OTP lockout, speech failures, duplicate review). Staff see them beside alerts (FR-A18).
export function createHelp({ pool, hub }) {
  return {
    async create(patientId, reason, detail = {}) {
      const { rows: [r] } = await pool.query(
        'INSERT INTO help_requests (patient_id, reason, detail) VALUES ($1, $2, $3) RETURNING id, reason, detail, created_at', [patientId, reason, detail]);
      const { rows: [p] } = patientId ? await pool.query('SELECT patientcase_id, full_name FROM patients WHERE id = $1', [patientId]) : { rows: [{}] };
      const view = { id: r.id, reason: r.reason, detail: r.detail, createdAt: r.created_at, acknowledgedAt: null, patientcaseId: p?.patientcase_id ?? null, patientName: p?.full_name ?? null };
      hub.publish('help', view, { roles: ['staff'] });
      return view;
    },
    async list() {
      const { rows } = await pool.query(
        `SELECT h.id, h.reason, h.detail, h.created_at, h.acknowledged_at, p.patientcase_id, p.full_name
           FROM help_requests h LEFT JOIN patients p ON p.id = h.patient_id
          WHERE h.acknowledged_at IS NULL OR h.acknowledged_at > now() - interval '4 hours'
          ORDER BY (h.acknowledged_at IS NOT NULL), h.created_at DESC LIMIT 100`);
      return rows.map((r) => ({ id: r.id, reason: r.reason, detail: r.detail, createdAt: r.created_at, acknowledgedAt: r.acknowledged_at, patientcaseId: r.patientcase_id, patientName: r.full_name }));
    },
  };
}
