-- Phase 8: integration and compliance hardening.

-- ---------- 1. Append-only, time-partitioned audit log (FR-D10, DBR-8) ----------
ALTER TABLE audit_logs RENAME TO audit_logs_old;
DROP INDEX audit_logs_user_idx;

CREATE TABLE audit_logs (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users (id),
  action      text NOT NULL,
  object_type text,
  object_id   uuid,
  at          timestamptz NOT NULL DEFAULT now(),
  actor_type  text,
  actor_id    text,
  detail      jsonb,
  PRIMARY KEY (id, at)
) PARTITION BY RANGE (at);
CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;

-- No UPDATE, DELETE or TRUNCATE on any audit row, for any role that does not own the trigger (the owner must drop it first, which is itself a schema change).
CREATE FUNCTION audit_logs_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (% refused)', TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER audit_logs_no_change BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_immutable();
CREATE TRIGGER audit_logs_default_no_truncate BEFORE TRUNCATE ON audit_logs_default FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_immutable();

-- One partition per month. Called here, at server start, and by the monthly maintenance job.
CREATE FUNCTION ensure_audit_partitions(months_before int DEFAULT 1, months_ahead int DEFAULT 3) RETURNS int LANGUAGE plpgsql AS $$
DECLARE m date; made int := 0; part text;
BEGIN
  FOR i IN -months_before..months_ahead LOOP
    m := (date_trunc('month', now()) + make_interval(months => i))::date;
    part := format('audit_logs_%s', to_char(m, 'YYYY_MM'));
    IF to_regclass(part) IS NULL THEN
      EXECUTE format('CREATE TABLE %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)', part, m, (m + interval '1 month')::date);
      EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_immutable()', part || '_no_truncate', part);
      made := made + 1;
    END IF;
  END LOOP;
  RETURN made;
END $$;
SELECT ensure_audit_partitions();

INSERT INTO audit_logs (id, user_id, action, object_type, object_id, at, actor_type, actor_id, detail)
  SELECT id, user_id, action, object_type, object_id, at, actor_type, actor_id, detail FROM audit_logs_old;
DROP TABLE audit_logs_old;
CREATE INDEX audit_logs_user_idx ON audit_logs (user_id);
CREATE INDEX audit_logs_object_idx ON audit_logs (object_id, at);
CREATE INDEX audit_logs_action_idx ON audit_logs (action, at);

-- ---------- 2. Multi-factor sign-in for staff and doctors (FR-P4) ----------
ALTER TABLE users ADD COLUMN mfa_enabled boolean NOT NULL DEFAULT false;

-- ---------- 3. FHIR bundles and delivery to the hospital system and ABHA (FR-D4, FR-D5, DBR-3) ----------
CREATE TABLE fhir_bundles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id    uuid NOT NULL REFERENCES encounters (id) ON DELETE CASCADE,
  summary_version int NOT NULL,
  bundle          jsonb NOT NULL,
  validation      jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (encounter_id, summary_version)
);
CREATE INDEX fhir_bundles_gin ON fhir_bundles USING gin (bundle jsonb_path_ops);

-- One row per bundle and target. 'not_sent' records that a purpose was not consented to, so the absence of a push is visible and explained.
CREATE TABLE deliveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id    uuid NOT NULL REFERENCES encounters (id) ON DELETE CASCADE,
  bundle_id       uuid NOT NULL REFERENCES fhir_bundles (id) ON DELETE CASCADE,
  target          text NOT NULL CHECK (target IN ('his', 'abha')),
  purpose         text NOT NULL CHECK (purpose IN ('his_sharing', 'abha_linking')),
  status          text NOT NULL CHECK (status IN ('pending', 'delivered', 'failed', 'not_sent', 'cancelled')),
  attempts        int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  reason          text,
  ack             jsonb,
  delivered_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bundle_id, target)
);
CREATE INDEX deliveries_due_idx ON deliveries (status, next_attempt_at);

-- ---------- 4. Row-level security for a doctor-scoped database role (DBR-6) ----------
-- The application connects as the table owner today, so these policies are defence in depth and are exercised by the tests
-- by switching to the role. A deployment should connect the doctor-facing code paths as pc_doctor (docs/security-report.md).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pc_doctor') THEN CREATE ROLE pc_doctor NOLOGIN; END IF;
END $$;

CREATE FUNCTION app_department_ok(dept uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.department_id', true), '') = 'all'
      OR dept IS NULL
      OR dept::text = coalesce(current_setting('app.department_id', true), '')
$$;

GRANT USAGE ON SCHEMA public TO pc_doctor;
GRANT SELECT ON encounters, patients, interview_responses, documents, extracted_entities, medications, lab_results, analysis_results,
  summaries, summary_versions, alerts, queue_entries, document_links, departments TO pc_doctor;
GRANT EXECUTE ON FUNCTION app_department_ok(uuid) TO pc_doctor;

ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;
CREATE POLICY doctor_scope ON encounters FOR SELECT TO pc_doctor USING (app_department_ok(department_id));
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY doctor_scope ON patients FOR SELECT TO pc_doctor USING (EXISTS (SELECT 1 FROM encounters e WHERE e.patient_id = patients.id));

DO $$ DECLARE t text; col text; BEGIN
  FOREACH t IN ARRAY ARRAY['interview_responses', 'documents', 'analysis_results', 'summaries', 'alerts', 'queue_entries', 'document_links'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY doctor_scope ON %I FOR SELECT TO pc_doctor USING (EXISTS (SELECT 1 FROM encounters e WHERE e.id = %I.encounter_id))', t, t);
  END LOOP;
END $$;
ALTER TABLE summary_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY doctor_scope ON summary_versions FOR SELECT TO pc_doctor USING (EXISTS (SELECT 1 FROM summaries s WHERE s.id = summary_versions.summary_id));
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['extracted_entities', 'medications', 'lab_results'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY doctor_scope ON %I FOR SELECT TO pc_doctor USING (EXISTS (SELECT 1 FROM documents d WHERE d.id = %I.document_id))', t, t);
  END LOOP;
END $$;
