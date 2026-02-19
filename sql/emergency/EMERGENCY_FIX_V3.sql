-- EMERGENCY FIX V3: Restore Bidder Infrastructure (Safe Mode)
-- Run this in Supabase Dashboard > SQL Editor

-- 1. Create Bids Table (With BIGINT task_id)
CREATE TABLE IF NOT EXISTS public.trinity_bids (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id BIGINT REFERENCES public.trinity_tasks(id) ON DELETE CASCADE, -- BIGINT Compatible
    agent_name TEXT,
    bid JSONB NOT NULL,
    score NUMERIC,
    status TEXT CHECK (status IN ('pending', 'won', 'lost', 'expired')) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create Indices
CREATE INDEX IF NOT EXISTS idx_trinity_bids_task_id ON public.trinity_bids(task_id);
CREATE INDEX IF NOT EXISTS idx_trinity_bids_status ON public.trinity_bids(status);

-- 3. Enable Security
ALTER TABLE public.trinity_bids ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for anon/service_role" ON public.trinity_bids FOR ALL USING (true) WITH CHECK (true);

-- 4. Create Mock Calls Table (Optional)
CREATE TABLE IF NOT EXISTS public.trinity_mock_calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    method TEXT NOT NULL,
    args JSONB,
    status TEXT DEFAULT 'pending',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.trinity_mock_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for anon/service_role" ON public.trinity_mock_calls FOR ALL USING (true) WITH CHECK (true);

-- LOGGING REMOVED TO PREVENT ERRORS
