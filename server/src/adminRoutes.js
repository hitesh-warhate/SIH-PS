import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import { computeMetrics } from './metrics.js';
import { audit } from './patients.js';

const UUID = /^[0-9a-f-]{36}$/;
const USERNAME = /^[a-z0-9._-]{3,40}$/;
const ROLES = ['staff', 'doctor', 'admin'];

// A readable one-time password: 12 characters from an alphabet without look-alikes. It is shown once to the admin and stored only as a hash.
export function temporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return Array.from(randomBytes(12), (b) => alphabet[b % alphabet.length]).join('');
}

// Admin console API (FR-P6, Phase 10): accounts, departments, the audit log, reports and the health of the system. Admin role only.
// The admin cannot read patient records through this router: it has no route that returns an encounter, an answer or a document.
export function createAdminRouter({ pool, reportPool = pool, monitor, metricsWindowDays = 30 }) {
  const router = express.Router();
  router.use((req, res, next) => {
    if (req.user?.role !== 'admin') return res.status(req.user ? 403 : 401).json({ error: req.user ? 'wrong_portal' : 'not_signed_in' });
    next();
  });
  const bad = (res, fields) => res.status(400).json({ error: 'invalid_input', fields });
  const log = (req, action, objectId, detail) => audit(pool, { actorType: 'admin', actorId: req.user.sub, userId: req.user.sub, action, objectType: 'user', objectId, detail });

  const view = (u) => ({
    id: u.id, role: u.role, fullName: u.full_name, username: u.username, departmentId: u.department_id, department: u.department ?? null,
    mfaEnabled: u.mfa_enabled, disabledAt: u.disabled_at, createdAt: u.created_at,
  });
  const SELECT = `SELECT u.id, u.role, u.full_name, u.username, u.department_id, d.name AS department, u.mfa_enabled, u.disabled_at, u.created_at
                    FROM users u LEFT JOIN departments d ON d.id = u.department_id`;

  // ---- accounts ----
  router.get('/users', async (_req, res) => res.json({ users: (await pool.query(`${SELECT} ORDER BY u.role, u.full_name`)).rows.map(view) }));

  router.post('/users', async (req, res) => {
    const { role, fullName, username, departmentId = null } = req.body ?? {};
    let { password } = req.body ?? {};
    const fields = [];
    if (!ROLES.includes(role)) fields.push('role');
    if (typeof fullName !== 'string' || fullName.trim().length < 2 || fullName.length > 100) fields.push('fullName');
    if (typeof username !== 'string' || !USERNAME.test(username)) fields.push('username');
    if (departmentId !== null && !UUID.test(String(departmentId))) fields.push('departmentId');
    if (password !== undefined && (typeof password !== 'string' || password.length < 10 || password.length > 100)) fields.push('password');
    if (fields.length) return bad(res, fields);
    if (departmentId && !(await pool.query('SELECT 1 FROM departments WHERE id = $1', [departmentId])).rowCount) return res.status(404).json({ error: 'department_not_found' });
    const generated = password === undefined;
    if (generated) password = temporaryPassword();
    try {
      const { rows: [u] } = await pool.query(
        `INSERT INTO users (role, full_name, username, password_hash, department_id, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [role, fullName.trim(), username, bcrypt.hashSync(password, 10), departmentId, req.user.sub]);
      await log(req, 'user_created', u.id, { role, username, departmentId });
      const { rows: [row] } = await pool.query(`${SELECT} WHERE u.id = $1`, [u.id]);
      res.status(201).json({ user: view(row), ...(generated ? { temporaryPassword: password } : {}) });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'username_taken' });
      throw err;
    }
  });

  // Changing an account's state signs it out everywhere (session_epoch), so a disabled account stops working at once.
  const change = (action, sql, needsOther = true) => async (req, res) => {
    if (!UUID.test(req.params.id)) return bad(res, ['id']);
    if (needsOther && req.params.id === req.user.sub) return res.status(409).json({ error: 'not_on_yourself' });
    const { rowCount } = await pool.query(sql, [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'not_found' });
    await log(req, action, req.params.id);
    const { rows: [row] } = await pool.query(`${SELECT} WHERE u.id = $1`, [req.params.id]);
    res.json({ user: view(row) });
  };
  router.post('/users/:id/disable', change('user_disabled', `UPDATE users SET disabled_at = now(), session_epoch = session_epoch + 1 WHERE id = $1 AND disabled_at IS NULL`));
  router.post('/users/:id/enable', change('user_enabled', `UPDATE users SET disabled_at = NULL, session_epoch = session_epoch + 1 WHERE id = $1 AND disabled_at IS NOT NULL`));
  router.post('/users/:id/reset-mfa', change('user_mfa_reset', `UPDATE users SET mfa_enabled = false, mfa_secret = NULL, session_epoch = session_epoch + 1 WHERE id = $1`));
  router.post('/users/:id/reset-password', async (req, res) => {
    if (!UUID.test(req.params.id)) return bad(res, ['id']);
    const password = temporaryPassword();
    const { rowCount } = await pool.query('UPDATE users SET password_hash = $2, session_epoch = session_epoch + 1 WHERE id = $1', [req.params.id, bcrypt.hashSync(password, 10)]);
    if (!rowCount) return res.status(404).json({ error: 'not_found' });
    await log(req, 'user_password_reset', req.params.id);
    res.json({ temporaryPassword: password });
  });
  router.put('/users/:id', async (req, res) => {
    if (!UUID.test(req.params.id)) return bad(res, ['id']);
    const { departmentId, fullName } = req.body ?? {};
    if ((departmentId !== undefined && departmentId !== null && !UUID.test(String(departmentId))) || (fullName !== undefined && (typeof fullName !== 'string' || fullName.trim().length < 2))) return bad(res, ['departmentId', 'fullName']);
    const { rowCount } = await pool.query(
      `UPDATE users SET department_id = CASE WHEN $2::boolean THEN $3::uuid ELSE department_id END, full_name = COALESCE($4, full_name) WHERE id = $1`,
      [req.params.id, departmentId !== undefined, departmentId ?? null, fullName?.trim() ?? null]);
    if (!rowCount) return res.status(404).json({ error: 'not_found' });
    await log(req, 'user_updated', req.params.id, { departmentId, fullName: fullName !== undefined });
    res.json({ user: view((await pool.query(`${SELECT} WHERE u.id = $1`, [req.params.id])).rows[0]) });
  });

  // ---- departments, including the AYUSH setting ----
  router.get('/departments', async (_req, res) => res.json({ departments: (await pool.query('SELECT id, name, ayush FROM departments ORDER BY name')).rows }));
  router.post('/departments', async (req, res) => {
    const { name, ayush = false } = req.body ?? {};
    if (typeof name !== 'string' || name.trim().length < 2 || name.length > 80 || typeof ayush !== 'boolean') return bad(res, ['name', 'ayush']);
    try {
      const { rows: [d] } = await pool.query('INSERT INTO departments (name, ayush) VALUES ($1, $2) RETURNING id, name, ayush', [name.trim(), ayush]);
      await audit(pool, { actorType: 'admin', actorId: req.user.sub, userId: req.user.sub, action: 'department_created', objectType: 'department', objectId: d.id, detail: { name: d.name, ayush } });
      res.status(201).json({ department: d });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'name_taken' });
      throw err;
    }
  });
  router.put('/departments/:id', async (req, res) => {
    if (!UUID.test(req.params.id)) return bad(res, ['id']);
    const { name, ayush } = req.body ?? {};
    if ((name !== undefined && (typeof name !== 'string' || name.trim().length < 2)) || (ayush !== undefined && typeof ayush !== 'boolean')) return bad(res, ['name', 'ayush']);
    const { rows: [d] } = await pool.query('UPDATE departments SET name = COALESCE($2, name), ayush = COALESCE($3, ayush) WHERE id = $1 RETURNING id, name, ayush', [req.params.id, name?.trim() ?? null, ayush ?? null]);
    if (!d) return res.status(404).json({ error: 'not_found' });
    await audit(pool, { actorType: 'admin', actorId: req.user.sub, userId: req.user.sub, action: 'department_updated', objectType: 'department', objectId: d.id, detail: { name: d.name, ayush: d.ayush } });
    res.json({ department: d });
  });

  // ---- the audit log (read only; the table itself refuses changes) ----
  router.get('/audit', async (req, res) => {
    const { action, actor, object, from, to, before } = req.query;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const where = [], p = [];
    const add = (cond, v) => { p.push(v); where.push(cond.replace('?', `$${p.length}`)); };
    if (typeof action === 'string' && action) add('action = ?', action.slice(0, 60));
    if (typeof actor === 'string' && actor) add('(actor_id = ? OR user_id::text = ?)', actor.slice(0, 60));
    if (typeof object === 'string' && UUID.test(object)) add('object_id = ?', object);
    if (typeof from === 'string' && /^\d{4}-\d{2}-\d{2}/.test(from)) add('at >= ?', from);
    if (typeof to === 'string' && /^\d{4}-\d{2}-\d{2}/.test(to)) add('at < ?', to);
    if (typeof before === 'string' && !Number.isNaN(Date.parse(before))) add('at < ?', before);
    p.push(limit + 1);
    const { rows } = await reportPool.query(
      `SELECT id, at, action, actor_type, actor_id, user_id, object_type, object_id, detail FROM audit_logs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY at DESC LIMIT $${p.length}`, p);
    const page = rows.slice(0, limit);
    await log(req, 'audit_viewed', null, { filters: { action, actor, object, from, to }, rows: page.length });
    res.json({ entries: page.map((r) => ({ id: r.id, at: r.at, action: r.action, actorType: r.actor_type, actorId: r.actor_id, objectType: r.object_type, objectId: r.object_id, detail: r.detail })), next: rows.length > limit ? page.at(-1).at : null });
  });
  router.get('/audit/actions', async (_req, res) => res.json({ actions: (await reportPool.query('SELECT DISTINCT action FROM audit_logs ORDER BY action')).rows.map((r) => r.action) }));

  // ---- reports (optional analytics, PRD Section 18) and system health ----
  router.get('/metrics', async (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days) || metricsWindowDays, 1), 365);
    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    res.json(await computeMetrics(reportPool, { since }));
  });
  router.get('/ops', async (_req, res) => {
    const events = (await pool.query('SELECT component, status, detail, at FROM ops_events ORDER BY at DESC LIMIT 50')).rows;
    res.json({ ...monitor.snapshot(), events });
  });

  return router;
}
