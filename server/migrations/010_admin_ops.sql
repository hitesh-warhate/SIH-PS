-- Phase 10: admin console, session revocation, monitoring and the queue indexes.

-- Accounts can be disabled without deleting them (the audit log keeps pointing at them). session_epoch is carried in every session token; raising it
-- signs the user out everywhere, which is what logout, a password reset and disabling an account all do (closes defect D-05).
ALTER TABLE users
  ADD COLUMN disabled_at   timestamptz,
  ADD COLUMN session_epoch int NOT NULL DEFAULT 0,
  ADD COLUMN created_by    uuid REFERENCES users (id);

-- Component health history for the admin console and for working out how long something was down.
CREATE TABLE ops_events (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component text NOT NULL,
  status    text NOT NULL CHECK (status IN ('ok', 'degraded', 'down')),
  detail    jsonb,
  at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ops_events_at_idx ON ops_events (at DESC);

-- The queue screens read today's encounters; these keep them an index range read at a hospital's daily volume (DBR-11).
CREATE INDEX encounters_started_idx ON encounters (started_at);
CREATE INDEX queue_entries_created_idx ON queue_entries (created_at);
