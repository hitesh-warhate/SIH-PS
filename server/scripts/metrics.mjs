// Prints the PRD Section 4.3 success metrics from the database. Usage: node --env-file=.env scripts/metrics.mjs [since] [until]
// (dates as YYYY-MM-DD). Used by the supervised pilot (docs/pilot-protocol.md).
import pg from 'pg';
import { computeMetrics } from '../src/metrics.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const [since, until] = process.argv.slice(2);
console.log(JSON.stringify(await computeMetrics(pool, { ...(since ? { since } : {}), ...(until ? { until } : {}) }), null, 2));
await pool.end();
