-- Phase 2: voice and touch interview.

-- Consecutive failed speech recognitions per question, for the "offer tapping, then alert staff" policy (PRD 8.5).
ALTER TABLE patient_sessions ADD COLUMN speech_failures jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Interview answers are JSONB; index them for the doctor-side queries that read them (DBR-3).
CREATE INDEX interview_responses_answer_gin ON interview_responses USING gin (answer jsonb_path_ops);
