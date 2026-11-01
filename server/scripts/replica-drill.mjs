// Read-replica drill (Phase 10, DBR-11). Needs a primary and a streaming replica that already exist:
//   DATABASE_URL         the primary (read and write)
//   REPLICA_DATABASE_URL the replica (read only)
//   PG_BIN, REPLICA_DIR  to stop and start the replica for the failure step (optional; without them that step is skipped)
// It checks that reporting queries run on the replica and writes are refused there, measures how long a write on the primary takes to appear on
// the replica, runs the monitor's replica check, then stops the replica and checks that the monitor raises "down" and recovers when it is back.
// Setup used for the recorded run is in docs/monitoring.md.
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';
import { computeMetrics } from '../src/metrics.js';
import { createMonitor } from '../src/ops/monitor.js';
import { doctorQueue } from '../src/summary/service.js';
import '../src/pgTypes.js';

const { DATABASE_URL, REPLICA_DATABASE_URL, PG_BIN, REPLICA_DIR } = process.env;
if (!DATABASE_URL || !REPLICA_DATABASE_URL) throw new Error('DATABASE_URL and REPLICA_DATABASE_URL are required');
const primary = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
const replica = new pg.Pool({ connectionString: REPLICA_DATABASE_URL, max: 4 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
const alerts = [];

out.replicaIsInRecovery = (await replica.query('SELECT pg_is_in_recovery() AS r')).rows[0].r;
await replica.query('BEGIN READ ONLY').catch(() => {});
try { await replica.query(`INSERT INTO ops_events (component, status) VALUES ('drill', 'ok')`); out.writeOnReplica = 'ACCEPTED (wrong)'; } catch (err) { out.writeOnReplica = `refused: ${err.message}`; }
await replica.query('ROLLBACK').catch(() => {});

// how long a committed write takes to be visible on the replica
const delays = [];
for (let i = 0; i < 15; i++) {
  const { rows: [r] } = await primary.query(`INSERT INTO ops_events (component, status, detail) VALUES ('drill', 'ok', $1) RETURNING id`, [JSON.stringify({ run: i })]);
  const t0 = performance.now();
  for (;;) {
    const { rowCount } = await replica.query('SELECT 1 FROM ops_events WHERE id = $1', [r.id]);
    if (rowCount) break;
    if (performance.now() - t0 > 10_000) throw new Error('write did not reach the replica in 10 s');
    await sleep(2);
  }
  delays.push(performance.now() - t0);
}
delays.sort((a, b) => a - b);
out.replicationDelayMs = { samples: delays.length, p50: Math.round(delays[7]), max: Math.round(delays.at(-1)) };

// reporting queries on the replica
const time = async (fn) => { const t0 = performance.now(); const r = await fn(); return [Math.round(performance.now() - t0), r]; };
const [mReplicaMs, metrics] = await time(() => computeMetrics(replica));
const [mPrimaryMs] = await time(() => computeMetrics(primary));
const [qReplicaMs, queue] = await time(() => doctorQueue(replica, {}));
const [auditMs, audit] = await time(() => replica.query('SELECT count(*)::int n FROM audit_logs WHERE at > now() - interval \'30 days\''));
out.reportingOnReplica = { metricsMs: mReplicaMs, metricsOnPrimaryMs: mPrimaryMs, sessionsSeen: metrics.sessions.started, queueMs: qReplicaMs, queueRows: queue.items.length, auditCountMs: auditMs, auditRows: audit.rows[0].n };

// the monitor's view, and the failure step
const monitor = createMonitor({ pool: primary, reportPool: replica, docs: { reader: { health: async () => ({ ok: true }) }, pipeline: { queue: { size: 0 } } }, notifier: { async send(e) { alerts.push(`${e.component}:${e.previous}->${e.status}`); } } });
await monitor.check();
out.monitorWhileHealthy = monitor.snapshot().components.replica;

if (PG_BIN && REPLICA_DIR) {
  const ctl = path.join(PG_BIN, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl');
  const t0 = performance.now();
  execFileSync(ctl, ['-D', REPLICA_DIR, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
  await replica.query('SELECT 1').catch(() => {}); // the first query after a stop fails and the pool drops the dead connection
  await monitor.check();
  out.monitorWhileStopped = monitor.snapshot().components.replica.status;
  spawn(ctl, ['-D', REPLICA_DIR, '-o', '-p 5433', 'start'], { detached: true, stdio: 'ignore' }).unref();
  let back = null;
  for (let i = 0; i < 60 && !back; i++) { await sleep(500); await monitor.check(); if (monitor.snapshot().components.replica.status === 'ok') back = (performance.now() - t0) / 1000; }
  out.replicaStoppedAndRecovered = { recovered: back != null, secondsFromStopToHealthy: back == null ? null : Number(back.toFixed(1)) };
}
out.alertsRaised = alerts;
console.log(JSON.stringify(out, null, 2));
await primary.query(`DELETE FROM ops_events WHERE component = 'drill'`).catch(() => {});
await primary.end();
await replica.end();
