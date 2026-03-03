-- [EVIDENCE CLOCK] ANFIS Cost Reduction & Patent Alignment
-- This table stores the verifiable data for Patent #4 (ANFIS routing)
-- Run this in the Supabase SQL Editor to start the 72.5% evidence clock.

CREATE TABLE IF NOT EXISTS public.anfis_decisions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now(),
    agent_id text,
    truth_score double precision,
    task_complexity integer,
    reward_output double precision,
    provider_selected text, -- The LLM chosen (e.g., DeepSeek-V3.2 vs Claude-3.5)
    cost_selected double precision, -- Cost per 1M tokens of selected model
    cost_alternative double precision, -- Cost per 1M tokens of the premium alternative
    quality_score double precision, -- Verification score of the result
    metadata jsonb
);

-- Enable RLS
ALTER TABLE public.anfis_decisions ENABLE ROW LEVEL SECURITY;

-- Governance Policies
CREATE POLICY "Allow service_role insert" ON public.anfis_decisions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated read" ON public.anfis_decisions FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Indexing for performance and reporting
CREATE INDEX IF NOT EXISTS idx_anfis_agent_id ON public.anfis_decisions(agent_id);
CREATE INDEX IF NOT EXISTS idx_anfis_created_at ON public.anfis_decisions(created_at);
