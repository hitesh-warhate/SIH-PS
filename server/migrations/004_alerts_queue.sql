-- Phase 3: red flags, real-time alerts and the triage queue.

-- Every alert records the rule version and level that raised it (evidence already lives in alerts.evidence).
ALTER TABLE alerts
  ADD COLUMN rule_version int NOT NULL DEFAULT 1,
  ADD COLUMN level text NOT NULL DEFAULT 'emergency' CHECK (level IN ('emergency', 'attention'));

-- The same rule never raises two alerts in one encounter, even if the answer is given again.
CREATE UNIQUE INDEX alerts_encounter_rule_uq ON alerts (encounter_id, rule_id);
CREATE INDEX alerts_open_idx ON alerts (raised_at) WHERE acknowledged_at IS NULL;

-- One queue entry per encounter; tokens restart each day.
CREATE UNIQUE INDEX queue_entries_encounter_uq ON queue_entries (encounter_id);
CREATE INDEX queue_entries_order_idx ON queue_entries (priority DESC, token_number);
