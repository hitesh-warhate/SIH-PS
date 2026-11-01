// Response time of the queue queries with a hospital-sized day (Phase 10, DBR-11).
//   node --env-file=.env scripts/queue-benchmark.mjs [encountersToday=10000] [runs=30]
// Builds a throw-away database, bulk-inserts synthetic encounters (with queue entries, complaint answers, alerts, documents and analysis rows),
// then times the doctor queue and the staff queue. Reports p50, p95 and max. Synthetic data on one laptop: it shows the shape, not a deployment's numbers.
import { createTestDatabase } from '../test/helpers.js';
import { seed } from '../src/seed.js';
import { createAlertHub } from '../src/alerts/hub.js';
import { createAlertService } from '../src/alerts/service.js';
import { doctorQueue } from '../src/summary/service.js';
import '../src/pgTypes.js';

const [N = 10000, RUNS = 30] = process.argv.slice(2).map(Number);
const db = await createTestDatabase();
await seed(db.url, { staffPassword: 'x-staff-pw-1', doctorPassword: 'x-doctor-pw-1' });
const q = (sql, p) => db.pool.query(sql, p);

const t0 = performance.now();
await q(`INSERT INTO patients (patientcase_id, full_name, date_of_birth, sex, mobile_hash)
         SELECT 'PC-B' || g, 'Bench Patient ' || g, date '1960-01-01' + (g % 20000), CASE WHEN g % 2 = 0 THEN 'male' ELSE 'female' END, md5(g::text) FROM generate_series(1, $1) g`, [N]);
await q(`INSERT INTO encounters (patient_id, status, started_at, submitted_at)
         SELECT p.id, (ARRAY['registered','in_intake','ready','ready','in_consultation','completed','completed'])[1 + (row_number() OVER ())::int % 7],
                now() - ((row_number() OVER ())::int % 600) * interval '1 minute', now()
           FROM patients p WHERE p.patientcase_id LIKE 'PC-B%'`);
await q(`INSERT INTO queue_entries (encounter_id, token_number, priority, created_at)
         SELECT e.id, (row_number() OVER (ORDER BY e.started_at))::int, CASE WHEN random() < 0.03 THEN 100 ELSE 0 END, e.started_at FROM encounters e`);
await q(`INSERT INTO interview_responses (encounter_id, question_key, answer, modality, confirmed)
         SELECT e.id, 'cc.main', jsonb_build_object('value', (ARRAY['fever','cough','back_pain','headache','chest_pain'])[1 + (row_number() OVER ())::int % 5]), 'tap', true FROM encounters e`);
await q(`INSERT INTO alerts (encounter_id, rule_id, level, evidence, rule_version) SELECT e.id, 'bench-rule', 'emergency', '{"reason":["x","x","x"],"triggers":[]}', 1 FROM encounters e WHERE random() < 0.03`);
await q(`INSERT INTO documents (encounter_id, storage_ref, status, original_name, mime, doc_type, processed_at)
         SELECT e.id, gen_random_uuid() || '.enc', 'done', 'f.png', 'image/png', 'lab_report', now() FROM encounters e, generate_series(1, 2) WHERE random() < 0.3`);
await q(`INSERT INTO analysis_results (encounter_id, kind, payload)
         SELECT e.id, k, CASE k WHEN 'lab_table' THEN '{"totals":{"outOfRange":2}}'::jsonb WHEN 'interactions' THEN '{"interactions":[],"allergyConflicts":[],"allergies":{"items":[]}}'::jsonb
                                WHEN 'consistency' THEN '{"issues":[]}'::jsonb ELSE '{}'::jsonb END
           FROM encounters e, unnest(ARRAY['timeline','med_reconciliation','lab_table','interactions','consistency']) k WHERE random() < 0.5`);
await q('ANALYZE');
const loaded = (performance.now() - t0) / 1000;

const service = createAlertService({ pool: db.pool, hub: createAlertHub() });
const pct = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];
const time = async (fn) => { const xs = []; for (let i = 0; i < RUNS; i++) { const s = performance.now(); await fn(); xs.push(performance.now() - s); } return { p50: Math.round(pct(xs, 50)), p95: Math.round(pct(xs, 95)), max: Math.round(Math.max(...xs)) }; };

const out = {
  encountersToday: N, loadSeconds: Number(loaded.toFixed(1)), runs: RUNS,
  doctorQueueMs: await time(() => doctorQueue(db.pool, {})),
  doctorQueueSearchMs: await time(() => doctorQueue(db.pool, { q: 'fever', status: 'ready' })),
  staffQueueMs: await time(() => service.queue()),
  alertListMs: await time(() => service.list({ role: 'doctor' })),
};
const { rows: plan } = await q(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
  SELECT e.id FROM encounters e LEFT JOIN queue_entries qe ON qe.encounter_id = e.id LEFT JOIN interview_responses r ON r.encounter_id = e.id AND r.question_key = 'cc.main'
   WHERE e.started_at >= date_trunc('day', now())`);
out.explainTail = plan.slice(-3).map((r) => r['QUERY PLAN']);
console.log(JSON.stringify(out, null, 2));
await db.drop();
