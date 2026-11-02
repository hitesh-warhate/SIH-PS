-- The AI interviewer (Gemini): after the reason for the visit, the emergency screen, medicines and allergies, an AI model writes each
-- further question from the answers so far. Which engine runs an encounter is fixed when its interview starts ('ai' or 'rules'),
-- ai_pending holds the question the model wrote and the patient has not answered yet, and ai_done marks that the model asked enough.
-- Answered AI questions are stored with their answers (interview_responses.answer.question), so summaries need nothing from here.
ALTER TABLE encounters
  ADD COLUMN interview_engine text CHECK (interview_engine IN ('ai', 'rules')),
  ADD COLUMN ai_pending       jsonb,
  ADD COLUMN ai_done          boolean NOT NULL DEFAULT false;
