-- Phase 4: multi-file document pipeline.
-- Original scans live in the encrypted file store; rows keep only storage_ref (DBR-4), never the file bytes.

ALTER TABLE documents
  ADD COLUMN original_name    text,
  ADD COLUMN mime             text,
  ADD COLUMN size_bytes       int,
  ADD COLUMN page_count       int,
  ADD COLUMN sort_order       int NOT NULL DEFAULT 0,
  ADD COLUMN progress         int NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  ADD COLUMN attention_reason text,
  ADD COLUMN attempts         int NOT NULL DEFAULT 0,
  ADD COLUMN error            text,
  ADD COLUMN quality          jsonb,
  ADD COLUMN ocr_text         text,
  ADD COLUMN classify_confidence numeric,
  ADD COLUMN created_at       timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN processed_at     timestamptz;

ALTER TABLE documents ADD CONSTRAINT documents_doc_type_check
  CHECK (doc_type IS NULL OR doc_type IN ('prescription', 'lab_report', 'discharge_summary', 'other'));
CREATE INDEX documents_order_idx ON documents (encounter_id, sort_order);

-- Every extracted field carries a confidence, a review flag and its place on the original scan (FR-B13, FR-B14).
-- region = { page, x0, y0, x1, y1 } in pixels of the stored page image (or points for a PDF text layer).
ALTER TABLE extracted_entities
  ADD COLUMN page         int,
  ADD COLUMN region       jsonb,
  ADD COLUMN needs_review boolean NOT NULL DEFAULT false;

ALTER TABLE lab_results
  ADD COLUMN confidence   numeric,
  ADD COLUMN page         int,
  ADD COLUMN region       jsonb,
  ADD COLUMN needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN ref_text     text;

ALTER TABLE medications
  ADD COLUMN confidence   numeric,
  ADD COLUMN page         int,
  ADD COLUMN region       jsonb,
  ADD COLUMN needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN form         text;
