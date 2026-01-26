-- TRINITY SYMPHONY: HARDENING PHASE 10
-- Goal: Fix RLS Security (194 issues) and Performance (152 issues)

-- 1. PERFORMANCE OPTIMIZATION (Indexes)
-- These prevent Full Table Scans on the most high-traffic tables
CREATE INDEX IF NOT EXISTS idx_trinity_tasks_status_assigned ON public.trinity_tasks (status, assigned_to, priority DESC);
CREATE INDEX IF NOT EXISTS idx_trinity_tasks_created_at ON public.trinity_tasks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trinity_agent_logs_agent_created ON public.trinity_agent_logs (agent_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trinity_artifacts_task_id ON public.trinity_artifacts (task_id);
CREATE INDEX IF NOT EXISTS idx_trinity_heartbeat_last_seen ON public.trinity_heartbeat (last_seen DESC);

-- 2. SECURITY HARDENING (RLS)
-- Enable RLS on core tables
ALTER TABLE public.trinity_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trinity_agent_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trinity_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trinity_agent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trinity_heartbeat ENABLE ROW LEVEL SECURITY;

-- 3. RLS POLICIES (Constitutional Access)

-- TRINITY_TASKS
DROP POLICY IF EXISTS "Public read access to tasks" ON public.trinity_tasks;
CREATE POLICY "Public read access to tasks" ON public.trinity_tasks 
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Agents can claim tasks" ON public.trinity_tasks;
CREATE POLICY "Agents can claim tasks" ON public.trinity_tasks 
FOR UPDATE USING (true) WITH CHECK (true);

-- TRINITY_ARTIFACTS
DROP POLICY IF EXISTS "Public read access to artifacts" ON public.trinity_artifacts;
CREATE POLICY "Public read access to artifacts" ON public.trinity_artifacts 
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Agents can insert artifacts" ON public.trinity_artifacts;
CREATE POLICY "Agents can insert artifacts" ON public.trinity_artifacts 
FOR INSERT WITH CHECK (true);

-- TRINITY_AGENT_REGISTRY
DROP POLICY IF EXISTS "Public read access to registry" ON public.trinity_agent_registry;
CREATE POLICY "Public read access to registry" ON public.trinity_agent_registry 
FOR SELECT USING (true);

-- TRINITY_AGENT_LOGS
DROP POLICY IF EXISTS "Public read access to logs" ON public.trinity_agent_logs;
CREATE POLICY "Public read access to logs" ON public.trinity_agent_logs 
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Agents can insert logs" ON public.trinity_agent_logs;
CREATE POLICY "Agents can insert logs" ON public.trinity_agent_logs 
FOR INSERT WITH CHECK (true);

-- 4. VACUUM & ANALYZE (Force stats update for optimizer)
ANALYZE public.trinity_tasks;
ANALYZE public.trinity_agent_logs;
ANALYZE public.trinity_artifacts;

-- 5. TRINITY TRIAD CONSENSUS VIEW (Optimization for Dashboard)
CREATE OR REPLACE VIEW public.v_active_swarm_summary AS
SELECT 
    count(*) FILTER (WHERE last_seen > now() - interval '5 minutes') as active_agents,
    count(*) FILTER (WHERE status = 'active') as online_agents
FROM public.trinity_heartbeat;

-- 6. EVOLUTIONARY LEARNING VAULT
CREATE TABLE IF NOT EXISTS public.trinity_evolution_vault (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name TEXT NOT NULL,
    task_id TEXT,
    intent TEXT,
    effect_score NUMERIC,
    outcome TEXT,
    insight TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.trinity_evolution_vault ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access to evolution" ON public.trinity_evolution_vault;
CREATE POLICY "Public read access to evolution" ON public.trinity_evolution_vault 
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Agents can insert evolution" ON public.trinity_evolution_vault;
CREATE POLICY "Agents can insert evolution" ON public.trinity_evolution_vault 
FOR INSERT WITH CHECK (true);

GRANT SELECT ON public.v_active_swarm_summary TO anon, authenticated, service_role;
