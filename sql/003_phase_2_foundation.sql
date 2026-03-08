-- Enable Extensions for Hybrid RAG
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create Schema Governance Table (BFT Foundation)
CREATE TABLE IF NOT EXISTS public.schema_change_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_type TEXT NOT NULL, -- 'drift_auto', 'agent_manual', 'user_manual'
    severity TEXT NOT NULL, -- 'LOW', 'MEDIUM', 'HIGH'
    sql_command TEXT NOT NULL,
    description TEXT,
    proposer_agent TEXT,
    votes_for TEXT[] DEFAULT '{}', -- Array of Agent IDs
    votes_against TEXT[] DEFAULT '{}',
    status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'executed'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    executed_at TIMESTAMPTZ
);

-- Index for BFT performance
CREATE INDEX IF NOT EXISTS idx_proposal_status ON public.schema_change_proposals(status);
