-- Phase 5: cross-document analysis. One current result per encounter and kind (FR-B8 to FR-B12), a log of runs so the time from
-- upload to "analysis ready" can be measured, and the link from each document to the structured history and identifiers (FR-B15).

-- Keep only the newest row if an earlier build wrote several, then make the pair unique so a re-run replaces instead of piling up.
DELETE FROM analysis_results a USING analysis_results b
 WHERE a.encounter_id = b.encounter_id AND a.kind = b.kind AND (a.created_at, a.id) < (b.created_at, b.id);

ALTER TABLE analysis_results
  ADD COLUMN input_hash text NOT NULL DEFAULT '',
  ADD COLUMN analysis_version int NOT NULL DEFAULT 1,
  ADD COLUMN computed_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE analysis_results ADD CONSTRAINT analysis_results_unique UNIQUE (encounter_id, kind);
CREATE INDEX analysis_results_payload_idx ON analysis_results USING gin (payload jsonb_path_ops); -- DBR-3

-- When the last file arrived (or was replaced), so "upload complete" has a timestamp.
ALTER TABLE documents ADD COLUMN uploaded_at timestamptz NOT NULL DEFAULT now();

-- upload_complete_at = the last file received; ready_ms = from then until the results were stored (includes reading the files);
-- compute_ms = the analysis alone. outcome 'unchanged' means the input hash matched and nothing was rewritten.
CREATE TABLE analysis_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id       uuid NOT NULL REFERENCES encounters (id) ON DELETE CASCADE,
  trigger            text NOT NULL,
  outcome            text NOT NULL CHECK (outcome IN ('stored', 'unchanged')),
  document_count     int NOT NULL,
  upload_complete_at timestamptz,
  started_at         timestamptz NOT NULL,
  finished_at        timestamptz NOT NULL,
  compute_ms         int NOT NULL,
  ready_ms           int,
  input_hash         text NOT NULL
);
CREATE INDEX analysis_runs_encounter_idx ON analysis_runs (encounter_id, finished_at);

-- FR-B15: each digitized document is tied to the encounter's structured history and to the patient. `fhir` is a FHIR R4
-- DocumentReference built from references only (no identifier values), so nothing sensitive is duplicated here; Phase 8 resolves the
-- identifiers (ABHA among them, held encrypted in patient_identifiers) when it pushes the record.
CREATE TABLE document_links (
  document_id      uuid PRIMARY KEY REFERENCES documents (id) ON DELETE CASCADE,
  encounter_id     uuid NOT NULL REFERENCES encounters (id) ON DELETE CASCADE,
  patient_id       uuid NOT NULL REFERENCES patients (id),
  history_sections text[] NOT NULL DEFAULT '{}',
  identifier_types text[] NOT NULL DEFAULT '{}',
  fhir             jsonb NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_links_encounter_idx ON document_links (encounter_id);
CREATE INDEX document_links_fhir_idx ON document_links USING gin (fhir jsonb_path_ops); -- DBR-3
