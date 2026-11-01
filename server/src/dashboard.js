import express from 'express';
import { QUESTIONS } from '../config/questions.v1.js';
import { doctorQueue } from './summary/service.js';

const TZ = 'Asia/Kolkata';
const COMPLAINTS = QUESTIONS.find((q) => q.key === 'cc.main').options;

// IST calendar dates as YYYY-MM-DD, without depending on the server's own time zone.
const istDate = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: TZ });
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const startOf = (iso) => `${iso}T00:00:00+05:30`;
const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] : null);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);

// The numbers behind the dashboards (staff, doctor, admin). Everything is counted from records the system already holds; nothing is invented.
// A doctor sees their department's patients, staff see all, and the admin sees counts and audit events only: no patient name leaves this module for an admin.
export function createDashboardRouter({ pool, reportPool = pool, monitor }) {
  const router = express.Router();
  router.use((req, res, next) => (['staff', 'doctor', 'admin'].includes(req.user?.role) ? next() : res.status(req.user ? 403 : 401).json({ error: req.user ? 'wrong_portal' : 'not_signed_in' })));
  const departmentOf = async (userId) => (await pool.query('SELECT department_id FROM users WHERE id = $1', [userId])).rows[0]?.department_id ?? null;

  // one count per day over the last `days` days (today last); `sql` selects (d text, n int) for rows at or after $1
  async function perDay(db, sql, params, dates) {
    const { rows } = await db.query(sql, [startOf(dates[0]), ...params]);
    const by = Object.fromEntries(rows.map((r) => [r.d, r.n]));
    return dates.map((d) => by[d] ?? 0);
  }

  async function clinical(req, days, range) {
    const dept = req.user.role === 'doctor' ? await departmentOf(req.user.sub) : null;
    const today = istDate();
    const dates = Array.from({ length: days }, (_, i) => addDays(today, i - days + 1));
    const scope = 'AND ($2::uuid IS NULL OR e.department_id IS NULL OR e.department_id = $2::uuid)';
    const day = (col) => `to_char((${col} AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD')`;
    const [newPatients, submitted, alerts, confirmed] = await Promise.all([
      perDay(reportPool, `SELECT ${day('e.started_at')} AS d, count(*)::int AS n FROM encounters e WHERE e.started_at >= $1::timestamptz ${scope} GROUP BY 1`, [dept], dates),
      perDay(reportPool, `SELECT ${day('e.submitted_at')} AS d, count(*)::int AS n FROM encounters e WHERE e.submitted_at >= $1::timestamptz ${scope} GROUP BY 1`, [dept], dates),
      perDay(reportPool, `SELECT ${day('a.raised_at')} AS d, count(*)::int AS n FROM alerts a JOIN encounters e ON e.id = a.encounter_id WHERE a.raised_at >= $1::timestamptz ${scope} GROUP BY 1`, [dept], dates),
      perDay(reportPool, `SELECT ${day('s.decided_at')} AS d, count(*)::int AS n FROM summaries s JOIN encounters e ON e.id = s.encounter_id WHERE s.decided_at >= $1::timestamptz ${scope} GROUP BY 1`, [dept], dates),
    ]);
    const total = (xs) => xs.reduce((a, b) => a + b, 0);
    const tile = (key, series) => ({ key, series, value: series.at(-1), total: total(series), previous: series.at(-2) ?? 0 });

    // complaint mix over the chosen range
    const since = addDays(today, -range + 1);
    const { rows: mix } = await reportPool.query(
      `SELECT r.answer->>'value' AS v, count(*)::int AS n FROM interview_responses r JOIN encounters e ON e.id = r.encounter_id
        WHERE r.question_key = 'cc.main' AND e.started_at >= $1::timestamptz ${scope} AND r.answer ? 'value' GROUP BY 1 ORDER BY 2 DESC, 1`, [startOf(since), dept]);
    const mixTotal = total(mix.map((m) => m.n));
    const items = mix.map((m) => ({ key: m.v, label: COMPLAINTS.find((o) => o.value === m.v)?.label ?? [m.v, m.v, m.v], count: m.n, percent: pct(m.n, mixTotal) }));

    // the last six days' patients by the hour they arrived (a rolling window, so today is always in it, whatever day of the week it is)
    const weekStart = addDays(today, -5);
    const { rows: week } = await reportPool.query(
      `SELECT e.id, e.status, p.full_name, qe.token_number, to_char(e.started_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS d,
              extract(hour FROM e.started_at AT TIME ZONE '${TZ}')::int AS h, extract(minute FROM e.started_at AT TIME ZONE '${TZ}')::int AS m
         FROM encounters e JOIN patients p ON p.id = e.patient_id LEFT JOIN queue_entries qe ON qe.encounter_id = e.id
        WHERE e.started_at >= $1::timestamptz AND e.started_at < $2::timestamptz ${scope.replaceAll('$2', '$3')} ORDER BY e.started_at LIMIT 400`,
      [startOf(weekStart), startOf(addDays(today, 1)), dept]);

    // today in numbers, for the insights
    const { rows: [t0] } = await reportPool.query(
      `SELECT count(*)::int AS patients,
              count(*) FILTER (WHERE EXISTS (SELECT 1 FROM alerts a WHERE a.encounter_id = e.id AND a.acknowledged_at IS NULL))::int AS with_open_alerts,
              count(*) FILTER (WHERE e.status = 'ready')::int AS ready,
              array_remove(array_agg(extract(epoch FROM e.submitted_at - e.started_at) / 60), NULL) AS intake_minutes
         FROM encounters e WHERE e.started_at >= $1::timestamptz ${scope}`, [startOf(today), dept]);
    const { rows: [q] } = await pool.query(
      `SELECT (SELECT count(*)::int FROM deliveries WHERE status = 'failed' AND reason IS DISTINCT FROM 'invalid_bundle') AS failed,
              (SELECT count(*)::int FROM documents WHERE status IN ('waiting', 'reading') AND storage_ref IS NOT NULL) AS reading`);

    const insights = [];
    const mine = tile('newPatients', newPatients);
    insights.push({ key: 'today', params: { n: t0.patients, alerts: t0.with_open_alerts } });
    if (mine.previous > 0 && mine.value !== mine.previous) {
      insights.push({ key: mine.value > mine.previous ? 'trendUp' : 'trendDown', params: { pct: Math.round((Math.abs(mine.value - mine.previous) / mine.previous) * 100) } });
    }
    if (items[0]) insights.push({ key: 'topComplaint', params: { label: items[0].label, pct: items[0].percent, days: range } });
    const med = median((t0.intake_minutes ?? []).map(Number));
    if (med != null) insights.push({ key: 'intake', params: { m: Math.max(1, Math.round(med)) } });
    if (t0.ready > 0) insights.push({ key: 'ready', params: { n: t0.ready } });
    if (q.failed > 0 && req.user.role === 'staff') insights.push({ key: 'failedDeliveries', params: { n: q.failed } });
    if (q.reading > 0) insights.push({ key: 'reading', params: { n: q.reading } });

    const { rows: recent } = await reportPool.query(
      `SELECT e.id, e.status, e.started_at, e.submitted_at, p.full_name, qe.token_number, r.answer->>'value' AS complaint
         FROM encounters e JOIN patients p ON p.id = e.patient_id LEFT JOIN queue_entries qe ON qe.encounter_id = e.id
         LEFT JOIN interview_responses r ON r.encounter_id = e.id AND r.question_key = 'cc.main'
        WHERE true ${scope.replaceAll('$2', '$1')} ORDER BY e.started_at DESC LIMIT 8`, [dept]);

    return {
      tiles: [tile('newPatients', newPatients), tile('submitted', submitted), tile('alerts', alerts), tile('confirmed', confirmed)],
      dates,
      distribution: { range, total: mixTotal, items },
      schedule: { weekStart, days: Array.from({ length: 6 }, (_, i) => addDays(weekStart, i)), today, items: week.map((w) => ({ id: w.id, name: w.full_name, status: w.status, token: w.token_number, date: w.d, hour: w.h, minute: w.m })) },
      insights,
      recent: recent.map((r) => ({
        id: r.id, name: r.full_name, token: r.token_number, status: r.status, startedAt: r.started_at,
        intakeMinutes: r.submitted_at ? Math.max(1, Math.round((new Date(r.submitted_at) - new Date(r.started_at)) / 60000)) : null,
        complaint: r.complaint ? { key: r.complaint, label: COMPLAINTS.find((o) => o.value === r.complaint)?.label ?? [r.complaint, r.complaint, r.complaint] } : null,
      })),
    };
  }

  async function admin(days, range) {
    const today = istDate();
    const dates = Array.from({ length: days }, (_, i) => addDays(today, i - days + 1));
    const day = (col) => `to_char((${col} AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD')`;
    const [registrations, signIns, events, failed] = await Promise.all([
      perDay(reportPool, `SELECT ${day('created_at')} AS d, count(*)::int AS n FROM patients WHERE created_at >= $1::timestamptz GROUP BY 1`, [], dates),
      perDay(reportPool, `SELECT ${day('at')} AS d, count(*)::int AS n FROM audit_logs WHERE action = 'login_success' AND at >= $1::timestamptz GROUP BY 1`, [], dates),
      perDay(reportPool, `SELECT ${day('at')} AS d, count(*)::int AS n FROM audit_logs WHERE at >= $1::timestamptz GROUP BY 1`, [], dates),
      perDay(reportPool, `SELECT ${day('created_at')} AS d, count(*)::int AS n FROM deliveries WHERE status = 'failed' AND created_at >= $1::timestamptz GROUP BY 1`, [], dates),
    ]);
    const total = (xs) => xs.reduce((a, b) => a + b, 0);
    const tile = (key, series) => ({ key, series, value: series.at(-1), total: total(series), previous: series.at(-2) ?? 0 });
    const { rows: mix } = await reportPool.query(
      `SELECT action AS v, count(*)::int AS n FROM audit_logs WHERE at >= $1::timestamptz GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 6`, [startOf(addDays(today, -range + 1))]);
    const mixTotal = total(mix.map((m) => m.n));
    const { rows: [u] } = await pool.query(`SELECT count(*)::int AS users, count(*) FILTER (WHERE disabled_at IS NOT NULL)::int AS disabled, count(*) FILTER (WHERE mfa_enabled)::int AS mfa FROM users`);
    const snap = monitor?.snapshot();
    const insights = [];
    if (snap) insights.push({ key: snap.status === 'ok' ? 'healthOk' : 'healthBad', params: { n: Object.values(snap.components).filter((c) => c.status !== 'ok').length } });
    insights.push({ key: 'accounts', params: { n: u.users, disabled: u.disabled, mfa: u.mfa } });
    if (mix[0]) insights.push({ key: 'topAction', params: { label: mix[0].v, n: mix[0].n, days: range } });
    const { rows: recent } = await reportPool.query(`SELECT id, at, action, actor_type FROM audit_logs ORDER BY at DESC LIMIT 8`);
    return {
      tiles: [tile('registrations', registrations), tile('signIns', signIns), tile('auditEvents', events), tile('deliveriesFailed', failed)],
      dates,
      distribution: { range, total: mixTotal, items: mix.map((m) => ({ key: m.v, label: [m.v, m.v, m.v], count: m.n, percent: pct(m.n, mixTotal) })) },
      schedule: null,
      health: snap ? Object.entries(snap.components).map(([k, c]) => ({ key: k, status: c.status })) : [],
      insights,
      recent: recent.map((r) => ({ id: r.id, action: r.action, actorType: r.actor_type, at: r.at })),
    };
  }

  router.get('/', async (req, res) => {
    const range = [7, 30].includes(Number(req.query.range)) ? Number(req.query.range) : 7;
    const body = req.user.role === 'admin' ? await admin(7, range) : await clinical(req, 7, range);
    res.json({ role: req.user.role, generatedAt: new Date().toISOString(), ...body });
  });

  // Quick search for the top bar: patients waiting today (staff and doctor, a doctor within their department) or accounts (admin).
  router.get('/search', async (req, res) => {
    const q = String(req.query.q ?? '').slice(0, 60).trim();
    if (!q) return res.json({ results: [] });
    if (req.user.role === 'admin') {
      const { rows } = await pool.query(
        `SELECT id, full_name, username, role FROM users WHERE full_name ILIKE $1 OR username ILIKE $1 ORDER BY full_name LIMIT 8`, [`%${q.replace(/[%_\\]/g, '\\$&')}%`]);
      return res.json({ results: rows.map((r) => ({ id: r.id, kind: 'user', title: r.full_name, sub: `${r.username} · ${r.role}` })) });
    }
    const { items } = await doctorQueue(pool, { departmentId: req.user.role === 'doctor' ? await departmentOf(req.user.sub) : null, q, limit: 8 });
    res.json({ results: items.map((i) => ({ id: i.id, kind: 'patient', title: i.name, token: i.token, status: i.chip, complaint: i.complaint?.label ?? null, alerts: i.openAlerts })) });
  });

  return router;
}

