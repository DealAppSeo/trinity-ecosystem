-- Run in Supabase SQL editor
CREATE TABLE IF NOT EXISTS approval_queue (
  id              BIGSERIAL PRIMARY KEY,
  task_id         TEXT,
  agent_id        TEXT NOT NULL,
  task_type       TEXT NOT NULL,
  output_summary  TEXT NOT NULL,
  full_output     JSONB,
  rep_id_score    FLOAT,
  wsce_score      FLOAT,
  u_score         FLOAT,
  cost_saved      FLOAT,
  domain          TEXT DEFAULT 'general',
  status          TEXT DEFAULT 'pending',  -- pending | approved | rejected | redirected
  redirect_note   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     TEXT
);

CREATE INDEX IF NOT EXISTS idx_approval_queue_status ON approval_queue(status);
CREATE INDEX IF NOT EXISTS idx_approval_queue_agent  ON approval_queue(agent_id);
