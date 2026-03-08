
-- Phase 4.5 Task 0: Foundation Setup

-- 1. Create sprint_updates table
CREATE TABLE IF NOT EXISTS public.sprint_updates (
    id BIGSERIAL PRIMARY KEY,
    agent_id TEXT NOT NULL,
    update_type TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.sprint_updates ENABLE ROW LEVEL SECURITY;

-- Allow all for service role and anon for dev
CREATE POLICY "Enable all for everyone" ON public.sprint_updates FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- 2. Add agent_repid_score to compute_bids
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'compute_bids' AND column_name = 'agent_repid_score') THEN
        ALTER TABLE public.compute_bids ADD COLUMN agent_repid_score NUMERIC;
    END IF;
END $$;
