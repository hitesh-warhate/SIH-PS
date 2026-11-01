import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from './helpers.js';
import { migrate } from '../src/migrate.js';

// ER tables from PRD Section 12.2
const ER_TABLES = [
  'users', 'departments', 'patients', 'patient_identifiers', 'consents', 'encounters',
  'interview_responses', 'documents', 'extracted_entities', 'lab_results', 'medications',
  'analysis_results', 'alerts', 'queue_entries', 'summaries', 'summary_versions', 'audit_logs',
];

let db;
before(async () => { db = await createTestDatabase({ migrated: false }); });
after(async () => { await db.drop(); });

test('a fresh database migrates to schema v1, and migrating again is a no-op', async () => {
  const first = await migrate(db.url);
  assert.deepEqual(first, ['001_schema_v1.sql', '002_registration_consent.sql', '003_interview.sql', '004_alerts_queue.sql', '005_documents.sql', '006_analysis.sql', '007_summary.sql', '008_ayush.sql', '009_compliance.sql', '010_admin_ops.sql', '011_ai_overview.sql']);
  assert.deepEqual(await migrate(db.url), []);
});

test('every ER table exists with a UUID primary key', async () => {
  const { rows } = await db.pool.query(
    `SELECT c.table_name, c.column_name, c.data_type
       FROM information_schema.columns c
       JOIN information_schema.table_constraints t
         ON t.table_name = c.table_name AND t.constraint_type = 'PRIMARY KEY' AND t.table_schema = c.table_schema
       JOIN information_schema.key_column_usage k
         ON k.constraint_name = t.constraint_name AND k.table_schema = t.table_schema AND k.column_name = c.column_name
      WHERE c.table_schema = 'public'`,
  );
  // audit_logs is partitioned by time, so its key is (id, at); the id is the uuid
  const pk = Object.fromEntries(rows.filter((r) => r.column_name === 'id').map((r) => [r.table_name, r.data_type]));
  for (const table of ER_TABLES) assert.equal(pk[table], 'uuid', `${table} needs a uuid primary key`);
});

test('all time columns are TIMESTAMPTZ and no plain timestamp is used', async () => {
  const { rows } = await db.pool.query(
    `SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type LIKE 'timestamp%'`,
  );
  assert.ok(rows.length > 0);
  for (const r of rows) assert.equal(r.data_type, 'timestamp with time zone', `${r.table_name}.${r.column_name}`);
});

test('foreign keys are declared on every *_id reference column', async () => {
  const { rows } = await db.pool.query(
    `SELECT kcu.table_name, kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`,
  );
  const fks = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
  for (const expected of [
    'users.department_id', 'patient_identifiers.patient_id', 'consents.patient_id', 'encounters.patient_id',
    'interview_responses.encounter_id', 'documents.encounter_id', 'extracted_entities.document_id',
    'lab_results.document_id', 'medications.document_id', 'analysis_results.encounter_id', 'alerts.encounter_id',
    'alerts.acknowledged_by', 'queue_entries.encounter_id', 'summaries.encounter_id',
    'summary_versions.summary_id', 'summary_versions.edited_by', 'audit_logs.user_id',
  ]) assert.ok(fks.has(expected), `missing foreign key ${expected}`);
});

test('the database itself rejects a language other than en, hi or mr', async () => {
  for (const lang of ['en', 'hi', 'mr']) {
    await db.pool.query(`INSERT INTO patients (patientcase_id, full_name, preferred_language) VALUES ($1, 'Synthetic', $2)`, [`PC-${lang}`, lang]);
  }
  await assert.rejects(
    db.pool.query(`INSERT INTO patients (patientcase_id, full_name, preferred_language) VALUES ('PC-bad', 'Synthetic', 'fr')`),
    /language_code/,
  );
  const { rows } = await db.pool.query(`SELECT id FROM patients LIMIT 1`);
  await assert.rejects(
    db.pool.query(`INSERT INTO consents (patient_id, language) VALUES ($1, 'ta')`, [rows[0].id]),
    /language_code/,
  );
  await assert.rejects(
    db.pool.query(`INSERT INTO summaries (encounter_id, language) VALUES (gen_random_uuid(), 'de')`),
    /language_code|foreign key/,
  );
});
