-- TRINITY BIDDER SYSTEM SCHEMA
-- Enables "Marketplace" logic for Task Assignment

CREATE TABLE IF NOT EXISTS public.trinity_bids (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES public.trinity_tasks(id) ON DELETE CASCADE,
    agent_name TEXT, -- Loose reference to allow flexible agents
    bid JSONB NOT NULL, 
    -- Format: { cost: number, efficiency: number, redundancy: string, flexibility: string, proposal: string }
    score NUMERIC, -- ANFIS computed score
    status TEXT CHECK (status IN ('pending', 'won', 'lost', 'expired')) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for fast frequent polling
CREATE INDEX IF NOT EXISTS idx_trinity_bids_task_id ON public.trinity_bids(task_id);
CREATE INDEX IF NOT EXISTS idx_trinity_bids_status ON public.trinity_bids(status);

-- TRINITY MOCK CALLS (For Learning Loop)
CREATE TABLE IF NOT EXISTS public.trinity_mock_calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    method TEXT NOT NULL,
    args JSONB,
    status TEXT DEFAULT 'pending', -- pending, analyzed, enhanced
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS POLICIES (Open for Swarm)
ALTER TABLE public.trinity_bids ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for anon/service_role" ON public.trinity_bids FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.trinity_mock_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for anon/service_role" ON public.trinity_mock_calls FOR ALL USING (true) WITH CHECK (true);
