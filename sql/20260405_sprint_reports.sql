-- Migration: Create sprint_reports table
-- Used by adversarial-loop.ts, finalize.js, phase2-poll.js, complete-priorities.js
-- for logging sprint progress, adversarial test results, and agent wake messages.

CREATE TABLE IF NOT EXISTS sprint_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name TEXT,
    report_type TEXT DEFAULT 'general',
    content TEXT,
    report_data JSONB DEFAULT '{}',
    sprint_name TEXT,
    autonomous_session_march20 TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for agent-specific report queries
CREATE INDEX IF NOT EXISTS idx_sprint_reports_agent ON sprint_reports(agent_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sprint_reports_type ON sprint_reports(report_type);

-- RLS: Allow service role full access, anon read-only
ALTER TABLE sprint_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON sprint_reports
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Anon read access" ON sprint_reports
    FOR SELECT USING (true);
