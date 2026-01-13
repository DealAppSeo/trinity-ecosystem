-- PHASE 10: THE NEURAL GRID (Graph Architecture)
-- Defines the Edges between Agent Nodes for future GNN training.

CREATE TABLE IF NOT EXISTS public.trinity_collaborations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- EDGE DEFINITION
    source_agent TEXT NOT NULL,         -- The agent initiating (e.g., 'trinity-constructor')
    target_agent TEXT NOT NULL,         -- The agent receiving (e.g., 'trinity-test-suite')
    interaction_type TEXT NOT NULL,     -- 'handoff', 'verification', 'bidding', 'healing'
    
    -- EDGE WEIGHTS (For GNN)
    success BOOLEAN,                    -- Did the interaction succeed?
    weight FLOAT DEFAULT 1.0,           -- Default weight, updated by ANFIS/success
    
    -- CONTEXT
    task_id UUID,                       -- Associated task
    context_snippet TEXT,               -- Vectorizable summary of the interaction
    
    -- METADATA
    metadata JSONB DEFAULT '{}'::jsonb  -- Extra GNN features (latency, cost, etc.)
);

-- Index for graph queries (finding neighbors)
CREATE INDEX IF NOT EXISTS idx_trinity_collab_source ON public.trinity_collaborations(source_agent);
CREATE INDEX IF NOT EXISTS idx_trinity_collab_target ON public.trinity_collaborations(target_agent);

-- RLS (Open for now, agents need full access)
ALTER TABLE public.trinity_collaborations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agents can read/write collaborations" ON public.trinity_collaborations FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.trinity_collaborations IS 'Stores agent Interaction Graph (Edges) for GNN training.';
