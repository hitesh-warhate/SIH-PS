-- Phase 7: AYUSH mode. It is on when the encounter's department is an AYUSH department, and staff can override it either way.
-- ayush_source records which of the two decided, so an override is visible and the department rule can still be applied later.
ALTER TABLE encounters
  ADD COLUMN ayush_mode   boolean NOT NULL DEFAULT false,
  ADD COLUMN ayush_source text CHECK (ayush_source IN ('department', 'staff'));
