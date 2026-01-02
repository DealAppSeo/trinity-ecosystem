-- Create the Agent Registry Table for RepID and Governance
CREATE TABLE IF NOT EXISTS trinity_agent_registry (
    agent_name TEXT PRIMARY KEY,
    reputation_score FLOAT DEFAULT 0,
    current_tier TEXT DEFAULT 'Assist',
    tasks_completed INT DEFAULT 0,
    tasks_failed INT DEFAULT 0,
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE trinity_agent_registry ENABLE ROW LEVEL SECURITY;

-- Allow all access for now (Development Mode)
CREATE POLICY "Allow all access to agents"
ON trinity_agent_registry
FOR ALL
USING (true)
WITH CHECK (true);

-- Comment
COMMENT ON TABLE trinity_agent_registry IS 'The Immutable Ledger of Agent Reputation and Autonomy Tiers';
