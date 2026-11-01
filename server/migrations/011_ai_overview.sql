-- The overview of a patient's history written after the patient submits: one for the doctor, one for the patient (what they told us).
-- provider and model say who wrote it (the rule-based writer, or a named AI model), fallback_reason says why a model's text was replaced.
CREATE TABLE ai_narratives (
  encounter_id    uuid NOT NULL REFERENCES encounters (id) ON DELETE CASCADE,
  audience        text NOT NULL CHECK (audience IN ('doctor', 'patient')),
  provider        text NOT NULL,
  model           text,
  status          text NOT NULL CHECK (status IN ('pending', 'ready')),
  text            jsonb,
  fallback_reason text,
  input_hash      text NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (encounter_id, audience)
);
