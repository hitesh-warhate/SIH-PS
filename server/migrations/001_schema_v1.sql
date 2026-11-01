-- Schema v1: the tables in PRD Section 12.2 (ER diagram).
-- Rules: UUID primary keys, TIMESTAMPTZ times, foreign keys (DBR-2),
-- language is a controlled value enforced by the database (DBR-13).

CREATE DOMAIN language_code AS text
  CHECK (VALUE IN ('en', 'hi', 'mr'));

CREATE TABLE departments (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name  text NOT NULL UNIQUE,
  ayush boolean NOT NULL DEFAULT false
);

-- Staff, doctor and admin accounts. Patients are not users; they hold sessions (Phase 1).
-- username / password_hash / mfa_secret are additions to the ER diagram needed for sign-in (FR-P4).
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role          text NOT NULL CHECK (role IN ('staff', 'doctor', 'admin')),
  full_name     text NOT NULL,
  username      text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  mfa_secret    text,
  department_id uuid REFERENCES departments (id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE patients (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patientcase_id     text NOT NULL UNIQUE,
  full_name          text NOT NULL,
  date_of_birth      date,
  sex                text CHECK (sex IN ('female', 'male', 'other')),
  mobile_hash        text,
  preferred_language language_code NOT NULL DEFAULT 'en',
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE patient_identifiers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      uuid NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
  type            text NOT NULL CHECK (type IN ('abha', 'aadhaar_ref', 'hospital_uhid')),
  value_encrypted text NOT NULL
);

CREATE TABLE consents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  uuid NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
  scope       jsonb NOT NULL DEFAULT '{}'::jsonb,
  language    language_code NOT NULL,
  given_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);

CREATE TABLE encounters (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id     uuid NOT NULL REFERENCES patients (id),
  department_id  uuid REFERENCES departments (id),
  status         text NOT NULL DEFAULT 'registered'
                 CHECK (status IN ('registered', 'in_intake', 'alert', 'ready', 'in_consultation', 'completed')),
  listening_mode text CHECK (listening_mode IN ('listen_speak', 'listen_tap', 'read_tap')),
  started_at     timestamptz NOT NULL DEFAULT now(),
  submitted_at   timestamptz
);

CREATE TABLE interview_responses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES encounters (id) ON DELETE CASCADE,
  question_key text NOT NULL,
  answer       jsonb,
  modality     text CHECK (modality IN ('voice', 'tap')),
  confidence   numeric,
  confirmed    boolean NOT NULL DEFAULT false
);

CREATE TABLE documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id   uuid NOT NULL REFERENCES encounters (id) ON DELETE CASCADE,
  doc_type       text,
  storage_ref    text,
  status         text NOT NULL DEFAULT 'waiting'
                 CHECK (status IN ('waiting', 'reading', 'done', 'needs_attention')),
  ocr_confidence numeric,
  document_date  date
);

CREATE TABLE extracted_entities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  value       text NOT NULL,
  confidence  numeric
);

CREATE TABLE lab_results (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  test_name   text NOT NULL,
  value       numeric,
  unit        text,
  ref_low     numeric,
  ref_high    numeric,
  flag        text CHECK (flag IN ('low', 'high', 'normal', 'range_unavailable')),
  result_date date
);

CREATE TABLE medications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  name          text NOT NULL,
  dose          text,
  frequency     text,
  prescribed_on date
);

CREATE TABLE analysis_results (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES encounters (id) ON DELETE CASCADE,
  kind         text NOT NULL
               CHECK (kind IN ('timeline', 'med_reconciliation', 'lab_table', 'interactions', 'consistency')),
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id    uuid NOT NULL REFERENCES encounters (id) ON DELETE CASCADE,
  rule_id         text NOT NULL,
  evidence        jsonb NOT NULL DEFAULT '{}'::jsonb,
  raised_at       timestamptz NOT NULL DEFAULT now(),
  acknowledged_by uuid REFERENCES users (id),
  acknowledged_at timestamptz
);

CREATE TABLE queue_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES encounters (id) ON DELETE CASCADE,
  token_number int NOT NULL,
  priority     int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE summaries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES encounters (id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'rejected')),
  language     language_code NOT NULL DEFAULT 'en'
);

CREATE TABLE summary_versions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_id uuid NOT NULL REFERENCES summaries (id) ON DELETE CASCADE,
  edited_by  uuid REFERENCES users (id),
  content    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Partitioning and append-only rules for audit_logs come in Phase 8 (DBR-8).
CREATE TABLE audit_logs (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES users (id),
  action      text NOT NULL,
  object_type text,
  object_id   uuid,
  at          timestamptz NOT NULL DEFAULT now()
);

-- Indexes for the foreign keys and queue/status queries that exist today.
CREATE INDEX encounters_patient_idx ON encounters (patient_id);
CREATE INDEX encounters_status_idx ON encounters (status);
CREATE INDEX documents_encounter_idx ON documents (encounter_id);
CREATE INDEX queue_entries_encounter_idx ON queue_entries (encounter_id);
CREATE INDEX audit_logs_user_idx ON audit_logs (user_id);
