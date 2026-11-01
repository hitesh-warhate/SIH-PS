// First tested restore (Phase 8, DBR-12): dumps the application database with pg_dump, restores it into a throw-away database with pg_restore,
// and checks that every table has the same number of rows and that the audit log's partitions, triggers and the row-level security policies came back.
// This proves a logical backup can be restored. It is NOT point-in-time recovery, which needs WAL archiving on the database server
// (docs/backup-and-retention.md). Run: node --env-file=.env scripts/backup-restore-test.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const bin = process.env.PG_BIN ?? ['C:/Program Files/PostgreSQL/18/bin', '/usr/bin', '/usr/local/bin'].find((d) => existsSync(path.join(d, process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump'))) ?? '';
const exe = (n) => path.join(bin, process.platform === 'win32' ? `${n}.exe` : n);
const withDb = (name) => { const u = new URL(url); u.pathname = `/${name}`; return u.toString(); };

const dir = mkdtempSync(path.join(os.tmpdir(), 'pc-backup-'));
const file = path.join(dir, 'backup.dump');
const restoredName = `pc_restore_check_${Date.now()}`;
const admin = new pg.Client({ connectionString: process.env.TEST_ADMIN_DATABASE_URL ?? withDb('postgres') });
await admin.connect();
const counts = async (conn) => {
  const c = new pg.Client({ connectionString: conn });
  await c.connect();
  const { rows } = await c.query(`SELECT c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition ORDER BY 1`);
  const out = {};
  for (const { t } of rows) out[t] = (await c.query(`SELECT count(*)::int AS n FROM "${t}"`)).rows[0].n;
  const parts = (await c.query(`SELECT count(*)::int AS n FROM pg_inherits i JOIN pg_class p ON p.oid = i.inhparent WHERE p.relname = 'audit_logs'`)).rows[0].n;
  const triggers = (await c.query(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname LIKE 'audit_logs%no_%' AND NOT tgisinternal`)).rows[0].n;
  const policies = (await c.query(`SELECT count(*)::int AS n FROM pg_policies WHERE policyname = 'doctor_scope'`)).rows[0].n;
  await c.end();
  return { rows: out, partitions: parts, auditTriggers: triggers, policies };
};

try {
  const t0 = Date.now();
  execFileSync(exe('pg_dump'), ['--format=custom', '--no-owner', '--file', file, url], { stdio: 'inherit' });
  const dumped = Date.now();
  await admin.query(`CREATE DATABASE ${restoredName}`);
  execFileSync(exe('pg_restore'), ['--no-owner', '--dbname', withDb(restoredName), file], { stdio: 'inherit' });
  const restored = Date.now();
  const [a, b] = [await counts(url), await counts(withDb(restoredName))];
  const verified = Date.now();
  const diff = Object.keys(a.rows).filter((k) => a.rows[k] !== b.rows[k]);
  const ok = !diff.length && a.partitions === b.partitions && a.auditTriggers === b.auditTriggers && a.policies === b.policies && Object.keys(a.rows).length === Object.keys(b.rows).length;
  console.log(JSON.stringify({
    ok, tables: Object.keys(a.rows).length, totalRows: Object.values(a.rows).reduce((x, y) => x + y, 0), mismatched: diff,
    auditPartitions: [a.partitions, b.partitions], auditTriggers: [a.auditTriggers, b.auditTriggers], rlsPolicies: [a.policies, b.policies],
    dumpKB: Math.round(statSync(file).size / 1024), dumpSeconds: (dumped - t0) / 1000, restoreSeconds: (restored - dumped) / 1000,
    // recovery time = from deciding to restore until the restored copy is checked; data-loss window for a scheduled dump = the interval between dumps plus the time a dump takes
    recoveryTimeSeconds: (verified - dumped) / 1000, dataLossWindow: `${process.env.BACKUP_INTERVAL_HOURS ?? 24} hours between dumps, plus ${((dumped - t0) / 1000).toFixed(1)} s for the dump itself`,
  }, null, 2));
  if (!ok) process.exitCode = 1;
} finally {
  await admin.query(`DROP DATABASE IF EXISTS ${restoredName} WITH (FORCE)`).catch(() => {});
  await admin.end();
  rmSync(dir, { recursive: true, force: true });
}
