-- Create Hallucination Logs for the Immune System Dashboard
CREATE TABLE IF NOT EXISTS trinity_hallucination_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    agent_id TEXT NOT NULL,
    task_id TEXT,
    injected_inputs JSONB,
    veto_reason TEXT,
    dissent_score FLOAT,
    proof_hash TEXT,
    metadata JSONB
);

-- Enable Realtime for the dashboard
ALTER PUBLICATION supabase_realtime ADD TABLE trinity_hallucination_logs;
