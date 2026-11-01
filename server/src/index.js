import pg from 'pg';
import { createApp } from './app.js';
import { cryptoFromEnv } from './crypto.js';
import { createMockOtpProvider, createStubAbdmProvider } from './providers.js';
import { createHisConnector } from './integration/connectors.js';
import { createIntegration } from './integration/service.js';
import { TEMP_TTL_MS } from './compliance/purge.js';

const { DATABASE_URL, JWT_SECRET, NODE_ENV = 'development', PORT = '4000', OTP_PROVIDER = 'mock', ABDM_MODE = 'stub', HIS_MODE = 'mock', HIS_URL, HIS_TOKEN, REPLICA_DATABASE_URL, PG_POOL_MAX = '20', PG_STATEMENT_TIMEOUT_MS = '15000' } = process.env;
const isProd = NODE_ENV === 'production';

if (!DATABASE_URL) throw new Error('DATABASE_URL is not set. Copy .env.example to server/.env and fill it in.');
if (!JWT_SECRET || (isProd && JWT_SECRET === 'change-me-in-real-environments')) {
  throw new Error('JWT_SECRET must be set to a long random value.');
}
// The mock OTP provider and the ABDM stub must never run in production.
if (isProd && (OTP_PROVIDER === 'mock' || ABDM_MODE === 'stub')) {
  throw new Error('Production needs a real OTP provider and ABDM client (OTP_PROVIDER, ABDM_MODE). See docs/phase0-external-actions.md.');
}

// The mock hospital system must never receive real records either.
if (isProd && HIS_MODE !== 'http') throw new Error('Production needs HIS_MODE=http and HIS_URL (the hospital system connector).');
// Multi-factor sign-in is required for staff and doctors in production unless explicitly switched off (FR-P4).
const requireMfa = process.env.REQUIRE_MFA ? process.env.REQUIRE_MFA === 'true' : isProd;

// Connection pooling (DBR-11): a bounded pool, and a limit on how long any one statement may run so that a bad query cannot hold a connection for ever.
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: Number(PG_POOL_MAX), statement_timeout: Number(PG_STATEMENT_TIMEOUT_MS), application_name: 'patientcase-api' });
// Reporting reads (the admin console's metrics and audit log) go to a read replica when REPLICA_DATABASE_URL is set; otherwise to the primary.
const reportPool = REPLICA_DATABASE_URL
  ? new pg.Pool({ connectionString: REPLICA_DATABASE_URL, max: 5, statement_timeout: 60_000, application_name: 'patientcase-reports' })
  : pool;
const crypto = cryptoFromEnv(process.env, { isProd });
const abdm = createStubAbdmProvider();
const integration = createIntegration({ pool, crypto, his: createHisConnector({ mode: HIS_MODE, url: HIS_URL, token: HIS_TOKEN }), abdm });
const app = createApp({
  pool,
  integration,
  reportPool,
  requireMfa,
  jwtSecret: JWT_SECRET,
  crypto,
  otp: createMockOtpProvider(),
  abdm,
  exposeDevCode: !isProd, // lets the terminal demo show the mock OTP on screen
});
app.listen(Number(PORT), () => console.log(`PatientCase_AI API listening on http://localhost:${PORT}`));

// Background work: deliveries to the hospital system and ABHA, the next months' audit partitions, and the working-file time-to-live (FR-D7, DBR-7, DBR-8).
integration.start();
app.locals.monitor.start(); // health checks every 30 s; a change of state is sent to ALERT_WEBHOOK_URL (or logged)
const maintain = () => pool.query('SELECT ensure_audit_partitions()').catch((err) => console.error('audit partition maintenance failed', err.message));
maintain();
setInterval(maintain, 24 * 3600_000).unref();
setInterval(() => app.locals.docs.store.purgeTemp(TEMP_TTL_MS).catch(() => {}), 5 * 60_000).unref();
