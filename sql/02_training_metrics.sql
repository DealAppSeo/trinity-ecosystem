-- Add Audit Columns for Directives (from Grok/Claude feedback)
-- Run this in Supabase SQL Editor

ALTER TABLE trinity_agent_registry
ADD COLUMN IF NOT EXISTS directive_source TEXT CHECK (directive_source IN ('human', 'anfis_suggested', 'fallback')) DEFAULT 'human';

ALTER TABLE trinity_agent_registry
ADD COLUMN IF NOT EXISTS suggested_prompt TEXT;

ALTER TABLE trinity_agent_registry
ADD COLUMN IF NOT EXISTS suggestion_confidence FLOAT;

ALTER TABLE trinity_agent_registry
ADD COLUMN IF NOT EXISTS suggestion_timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE trinity_agent_registry
ADD COLUMN IF NOT EXISTS suggestion_accepted BOOLEAN DEFAULT NULL;

-- NEW: Benchmark Tracking Table
CREATE TABLE IF NOT EXISTS trinity_agent_benchmarks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    agent_name TEXT NOT NULL,
    benchmark_type TEXT NOT NULL, -- 'GAIA', 'SWE-Bench', etc.
    score FLOAT NOT NULL, -- 0.0 to 1.0
    metric_name TEXT NOT NULL, -- 'accuracy', 'empathy', 'latency'
    artifact_id BIGINT REFERENCES trinity_artifacts(id), -- Changed from UUID to BIGINT to match existing schema
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- KPI: Average Score Calculation View
CREATE OR REPLACE VIEW view_agent_performance AS
SELECT 
    agent_name,
    benchmark_type,
    AVG(score) as avg_score,
    COUNT(*) as attempts,
    MAX(created_at) as last_attempt
FROM trinity_agent_benchmarks
GROUP BY agent_name, benchmark_type;
