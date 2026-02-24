-- trinity_hitl_decisions table
-- Status: REAL
-- Author: ANTIGRAV via Sean Patrick Goodwin

CREATE TABLE IF NOT EXISTS trinity_hitl_decisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id TEXT NOT NULL, -- references trinity_tasks(id)
  agent_id TEXT NOT NULL,
  agent_repid TEXT NOT NULL,
  mission_summary TEXT NOT NULL,
  confidence_score NUMERIC(4,3),
  s_pi_score NUMERIC(8,4),
  escalation_reason TEXT NOT NULL,
  signature TEXT NOT NULL,
  telegram_message_id BIGINT,
  decision TEXT CHECK (decision IN ('APPROVED', 'ESCALATED', 'PENDING')) DEFAULT 'PENDING',
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hitl_pending ON trinity_hitl_decisions(decision) WHERE decision = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_hitl_task ON trinity_hitl_decisions(task_id);
