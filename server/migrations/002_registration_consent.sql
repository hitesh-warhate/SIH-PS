-- Phase 1: registration, identity and consent.

-- Fuzzy matching for duplicate patient detection (DBR-9).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Sensitive fields live only in hashed or encrypted columns (DBR-5).
-- mobile_hash is an HMAC used for lookup; mobile_encrypted lets us send an OTP to a returning patient.
ALTER TABLE patients
  ADD COLUMN mobile_encrypted            text,
  ADD COLUMN address                     text,
  ADD COLUMN emergency_contact_encrypted text,
  ADD COLUMN dob_estimated               boolean NOT NULL DEFAULT false,
  ADD COLUMN registration_channel        text NOT NULL DEFAULT 'self' CHECK (registration_channel IN ('self', 'staff')),
  ADD COLUMN registered_by               uuid REFERENCES users (id);

CREATE INDEX patients_mobile_hash_idx ON patients (mobile_hash);
CREATE INDEX patients_name_trgm_idx ON patients USING gin (lower(full_name) gin_trgm_ops);

-- value_hash is an HMAC of the identifier for lookup. Aadhaar is held by reference only (no number stored).
ALTER TABLE patient_identifiers ADD COLUMN value_hash text;
CREATE UNIQUE INDEX patient_identifiers_type_hash_uq ON patient_identifiers (type, value_hash) WHERE value_hash IS NOT NULL;

-- Patient terminal sessions (PRD Section 12.4 lifecycle).
CREATE TABLE patient_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  uuid NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
  language    language_code NOT NULL,
  state       text NOT NULL DEFAULT 'consent_pending'
              CHECK (state IN ('consent_pending', 'active', 'closed', 'submitted', 'revoked', 'purged')),
  consent_id  uuid REFERENCES consents (id),
  encounter_id uuid REFERENCES encounters (id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  closed_at   timestamptz
);
CREATE INDEX patient_sessions_patient_idx ON patient_sessions (patient_id);

-- Mobile OTP challenges. The code itself is stored only as an HMAC.
CREATE TABLE otp_challenges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile_hash text NOT NULL,
  code_hash   text NOT NULL,
  attempts    int NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  verified_at timestamptz,
  locked_at   timestamptz,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_challenges_mobile_idx ON otp_challenges (mobile_hash, created_at);

-- Calls for staff help (OTP lockout, duplicate review). The staff alert screen arrives in Phase 3.
CREATE TABLE help_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      uuid REFERENCES patients (id) ON DELETE SET NULL,
  reason          text NOT NULL,
  detail          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  acknowledged_by uuid REFERENCES users (id),
  acknowledged_at timestamptz
);

-- Patients are not rows in users, so audit entries carry an actor type and id as well (FR-D10).
ALTER TABLE audit_logs
  ADD COLUMN actor_type text,
  ADD COLUMN actor_id   text,
  ADD COLUMN detail     jsonb;

-- One answer per question per encounter (used by Phase 2 and the consent-guarded write).
CREATE UNIQUE INDEX interview_responses_encounter_question_uq ON interview_responses (encounter_id, question_key);
