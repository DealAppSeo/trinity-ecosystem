-- Migration: Create team_coordination_log table
-- This table enables cross-agent sprint visibility for Sean's mobile dashboard.
-- Referenced by ConstitutionalAgent.ts line 2901 (writes on every task completion).

CREATE TABLE IF NOT EXISTS team_coordination_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    posted_by TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'info',
    content TEXT NOT NULL,
    sprint TEXT DEFAULT 'sprint1',
    requires_sean_action BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for mobile dashboard queries (filter by sprint + recency)
CREATE INDEX IF NOT EXISTS idx_coord_log_sprint ON team_coordination_log(sprint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coord_log_action ON team_coordination_log(requires_sean_action) WHERE requires_sean_action = TRUE;

-- RLS: Allow service role full access, anon read-only
ALTER TABLE team_coordination_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON team_coordination_log
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Anon read access" ON team_coordination_log
    FOR SELECT USING (true);
