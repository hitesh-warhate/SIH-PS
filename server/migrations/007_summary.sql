-- Phase 6: physician-ready summary, the doctor's decision on it, and the case lifecycle (PRD 9.5).

-- "Rejected" is a state of its own: the doctor rejected the AI draft and documents the history manually before the case completes.
ALTER TABLE encounters DROP CONSTRAINT encounters_status_check;
ALTER TABLE encounters ADD CONSTRAINT encounters_status_check
  CHECK (status IN ('registered', 'in_intake', 'alert', 'ready', 'in_consultation', 'completed', 'rejected'));

-- One summary per encounter. The doctor's decision, who made it and when are on the summary; every version of the content
-- (the AI draft first, then each amendment, the decision and any manual documentation) is kept in summary_versions (FR-C7, DB-13).
ALTER TABLE summaries
  ADD COLUMN decision    text CHECK (decision IN ('accepted', 'amended', 'rejected')),
  ADD COLUMN decided_by  uuid REFERENCES users (id),
  ADD COLUMN decided_at  timestamptz,
  ADD COLUMN created_at  timestamptz NOT NULL DEFAULT now();
ALTER TABLE summaries ADD CONSTRAINT summaries_encounter_unique UNIQUE (encounter_id);

ALTER TABLE summary_versions
  ADD COLUMN version    int NOT NULL DEFAULT 1,
  ADD COLUMN kind       text NOT NULL DEFAULT 'ai_draft' CHECK (kind IN ('ai_draft', 'amend', 'accept', 'reject', 'manual')),
  ADD COLUMN note       text,
  ADD COLUMN input_hash text;
ALTER TABLE summary_versions ADD CONSTRAINT summary_versions_unique UNIQUE (summary_id, version);
CREATE INDEX summary_versions_content_idx ON summary_versions USING gin (content jsonb_path_ops); -- DBR-3
