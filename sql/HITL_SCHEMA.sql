-- Migration: Create trinity_hitl_requests
-- Purpose: Orchestrate Human-In-The-Loop decisions for the Trinity Swarm

CREATE TABLE IF NOT EXISTS public.trinity_hitl_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id BIGINT REFERENCES public.trinity_tasks(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL, -- The specialist agent requesting help
    reason TEXT NOT NULL, -- Why is help needed? (e.g., "Confidence < 0.7", "Cost > $5")
    context JSONB, -- Relevant task context for the human to decide
    status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected, modified
    decision_metadata JSONB, -- To store human notes or modified parameters
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT -- Founder/Admin identifier
);

-- Index for fast lookup of active requests
CREATE INDEX IF NOT EXISTS idx_hitl_pending ON public.trinity_hitl_requests (status) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.trinity_hitl_requests ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users (Founders) to manage HITL
CREATE POLICY "Founders can manage HITL" 
ON public.trinity_hitl_requests 
FOR ALL 
TO authenticated 
USING (true);

-- Allow anon to see status (for public dashboard transparency)
CREATE POLICY "Public can view HITL status" 
ON public.trinity_hitl_requests 
FOR SELECT 
TO anon 
USING (true);
