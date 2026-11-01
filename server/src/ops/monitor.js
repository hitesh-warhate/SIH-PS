// Health checks and alerting (Phase 10, PRD Section 10 Availability): speech, document reading, the database and its replica, the job queue and the
// integrations. Every check returns { status: 'ok' | 'degraded' | 'down', detail }. The monitor runs them on a timer, keeps the history in ops_events
// and tells the on-call person through a notifier when a component gets worse or recovers, once per change, not once per run.

const RANK = { ok: 0, degraded: 1, down: 2 };
const worst = (a, b) => (RANK[a] >= RANK[b] ? a : b);

export function createWebhookNotifier({ url, fetchImpl = fetch, log = console, timeoutMs = 5000 }) {
  return {
    name: url ? 'webhook' : 'log',
    async send(event) {
      if (!url) { log.error(`ALERT ${event.component} is ${event.status}`, JSON.stringify(event.detail ?? {})); return; }
      try {
        const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(event), signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) log.error(`alert webhook answered ${res.status}`);
      } catch (err) { log.error('alert webhook failed', err.message); }
    },
  };
}

// thresholds are proposals for hospital IT and the clinical lead (docs/monitoring.md)
export const LIMITS = {
  dbSlowMs: 1000, replicaLagDegradedS: 30, replicaLagDownS: 300,
  queueOldestDegradedS: 300, queueOldestDownS: 900,
  deliveryPendingDownS: 3600, speechFailuresDegraded: 10,
};

export function createMonitor({ pool, reportPool = pool, docs, notifier, intervalMs = 30_000, checkTimeoutMs = 30_000, limits = LIMITS, now = () => Date.now(), log = console }) {
  const checks = {
    async database() {
      const t0 = now();
      try {
        await pool.query('SELECT 1');
        const ms = now() - t0;
        return { status: ms > limits.dbSlowMs ? 'degraded' : 'ok', detail: { ms, poolWaiting: pool.waitingCount ?? 0 } };
      } catch (err) { return { status: 'down', detail: { error: String(err.message).slice(0, 200) } }; }
    },

    // Reporting reads (admin metrics, audit view) use the replica when one is configured. Lag is how far behind the primary it is.
    async replica() {
      if (reportPool === pool) return { status: 'ok', detail: { configured: false } };
      try {
        const { rows: [r] } = await reportPool.query(
          `SELECT pg_is_in_recovery() AS replica,
                  (SELECT status FROM pg_stat_wal_receiver LIMIT 1) AS receiver,
                  pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn() AS caught_up,
                  extract(epoch FROM now() - pg_last_xact_replay_timestamp()) AS since_last_replay`);
        if (!r.replica) return { status: 'degraded', detail: { configured: true, warning: 'the reporting database is not in recovery: it is not a replica' } };
        // On a quiet primary the last replayed transaction can be old although nothing is missing, so the time only counts while there is something left to replay.
        const lag = r.caught_up ? 0 : Number(r.since_last_replay ?? 0);
        const streaming = r.receiver === 'streaming';
        const status = lag > limits.replicaLagDownS ? 'down' : !streaming || lag > limits.replicaLagDegradedS ? 'degraded' : 'ok';
        return { status, detail: { configured: true, receiver: r.receiver ?? 'not running', lagSeconds: Math.round(lag) } };
      } catch (err) { return { status: 'down', detail: { configured: true, error: String(err.message).slice(0, 200) } }; }
    },

    async ocr() {
      try {
        const h = await docs.reader.health();
        return { status: h.ok ? 'ok' : 'down', detail: h };
      } catch (err) { return { status: 'down', detail: { error: String(err.message).slice(0, 200) } }; }
    },

    // The reading queue: is anything waiting too long, or giving up?
    async jobQueue() {
      try {
        const { rows: [r] } = await pool.query(
          `SELECT extract(epoch FROM now() - min(uploaded_at) FILTER (WHERE status IN ('waiting','reading')))::int AS oldest,
                  count(*) FILTER (WHERE status IN ('waiting','reading'))::int AS waiting,
                  count(*) FILTER (WHERE attention_reason = 'processing_failed' AND processed_at > now() - interval '1 hour')::int AS gave_up
             FROM documents WHERE storage_ref IS NOT NULL AND (status IN ('waiting','reading') OR processed_at > now() - interval '1 hour')`);
        const oldest = r.oldest ?? 0;
        let status = oldest > limits.queueOldestDownS ? 'down' : oldest > limits.queueOldestDegradedS ? 'degraded' : 'ok';
        if (r.gave_up > 0) status = worst(status, 'degraded');
        return { status, detail: { waiting: r.waiting, oldestWaitingSeconds: oldest, gaveUpLastHour: r.gave_up, inProcess: docs.pipeline.queue.size } };
      } catch (err) { return { status: 'down', detail: { error: String(err.message).slice(0, 200) } }; }
    },

    // The hospital system and ABHA: failed pushes need a person; a push stuck for an hour means the connector is down.
    async integrations() {
      try {
        const { rows: [r] } = await pool.query(
          `SELECT count(*) FILTER (WHERE status = 'failed' AND reason IS DISTINCT FROM 'invalid_bundle')::int AS failed,
                  count(*) FILTER (WHERE status = 'failed' AND reason = 'invalid_bundle')::int AS invalid,
                  count(*) FILTER (WHERE status = 'pending')::int AS pending,
                  extract(epoch FROM now() - min(created_at) FILTER (WHERE status = 'pending'))::int AS oldest
             FROM deliveries WHERE created_at > now() - interval '7 days'`);
        let status = r.failed > 0 || r.invalid > 0 ? 'degraded' : 'ok';
        if ((r.oldest ?? 0) > limits.deliveryPendingDownS) status = 'down';
        return { status, detail: { failed: r.failed, invalidBundles: r.invalid, pending: r.pending, oldestPendingSeconds: r.oldest ?? 0 } };
      } catch (err) { return { status: 'down', detail: { error: String(err.message).slice(0, 200) } }; }
    },

    // Speech recognition runs in the patient's browser, so the server cannot probe it. What it can see is patients who could not be
    // understood three times and asked for help: a jump in those is the sign that recognition (or the room) has gone wrong.
    async speech() {
      try {
        const { rows: [r] } = await pool.query(`SELECT count(*)::int AS n FROM help_requests WHERE reason = 'speech_recognition_failed' AND created_at > now() - interval '15 minutes'`);
        return { status: r.n >= limits.speechFailuresDegraded ? 'degraded' : 'ok', detail: { helpRequestsLast15Min: r.n, note: 'recognition runs in the browser; this is an indirect signal' } };
      } catch (err) { return { status: 'down', detail: { error: String(err.message).slice(0, 200) } }; }
    },
  };

  let state = {};
  let timer = null;
  let running = null;

  // One check, with a time limit: a check that hangs (a stuck engine start, a database that accepts the connection and never answers) is itself a failure.
  async function guarded(fn) {
    let t;
    try {
      return await Promise.race([fn(), new Promise((resolve) => { t = setTimeout(() => resolve({ status: 'down', detail: { error: `check did not finish in ${checkTimeoutMs / 1000} s` } }), checkTimeoutMs); })]);
    } finally { clearTimeout(t); }
  }

  // Record a result as soon as it is known, so a slow check (the first start of the reading engine takes many seconds) does not hide the others.
  async function settle(name, r) {
    const before = state[name]?.status;
    state = { ...state, [name]: { ...r, checkedAt: new Date(now()).toISOString() } };
    if (before === r.status) return;
    // record every change, and tell the on-call person when something got worse or recovered (not on the very first "ok")
    try { await pool.query('INSERT INTO ops_events (component, status, detail) VALUES ($1,$2,$3)', [name, r.status, JSON.stringify(r.detail)]); } catch { /* the database may be the thing that is down */ }
    if (before !== undefined || r.status !== 'ok') {
      await notifier.send({ component: name, status: r.status, previous: before ?? null, detail: r.detail, at: new Date(now()).toISOString() }).catch((err) => log.error('notifier failed', err.message));
    }
  }

  async function run() {
    await Promise.all(Object.entries(checks).map(async ([name, fn]) => settle(name, await guarded(fn))));
    return state;
  }
  // a second call while one is running waits for it instead of starting another
  const check = () => (running ??= run().finally(() => { running = null; }));

  return {
    check, checks,
    snapshot: () => ({ status: Object.values(state).reduce((w, r) => worst(w, r.status), 'ok'), components: state }),
    start() { check().catch((err) => log.error('monitor run failed', err.message)); timer = setInterval(() => check().catch((err) => log.error('monitor run failed', err.message)), intervalMs); timer.unref?.(); },
    stop() { clearInterval(timer); },
    // Prometheus text format, for the hospital's own monitoring stack
    prometheus() {
      const lines = ['# HELP patientcase_component_status 0 ok, 1 degraded, 2 down', '# TYPE patientcase_component_status gauge'];
      for (const [name, r] of Object.entries(state)) lines.push(`patientcase_component_status{component="${name}"} ${RANK[r.status]}`);
      const q = state.jobQueue?.detail;
      if (q) lines.push(`patientcase_documents_waiting ${q.waiting}`, `patientcase_documents_oldest_waiting_seconds ${q.oldestWaitingSeconds}`);
      const i = state.integrations?.detail;
      if (i) lines.push(`patientcase_deliveries_failed ${i.failed}`, `patientcase_deliveries_pending ${i.pending}`);
      const rep = state.replica?.detail;
      if (rep?.lagSeconds != null) lines.push(`patientcase_replica_lag_seconds ${rep.lagSeconds}`);
      return `${lines.join('\n')}\n`;
    },
  };
}
