
-- 1. ADD MISSING COLUMNS FIRST (Safety First)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_agent_registry' AND column_name = 'status') THEN
        ALTER TABLE public.trinity_agent_registry ADD COLUMN status TEXT DEFAULT 'active';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_agent_registry' AND column_name = 'current_tier') THEN
        ALTER TABLE public.trinity_agent_registry ADD COLUMN current_tier TEXT DEFAULT 'Assist';
    END IF;

    -- Standardize trinity_tasks columns if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_tasks' AND column_name = 'assigned_to') THEN
        ALTER TABLE public.trinity_tasks ADD COLUMN assigned_to TEXT;
    END IF;
END $$;

-- 2. SEED/NORMALIZE AGENT REGISTRY (The 3x3 + 3 Orchestration)
INSERT INTO public.trinity_agent_registry (agent_name, reputation_score, current_tier, tasks_completed, status)
VALUES 
    ('trinity-orch', 10, 'Assist', 0, 'active'),
    ('trinity-w3c', 10, 'Assist', 0, 'active'),
    ('trinity-shofet', 10, 'Assist', 0, 'active'),
    ('trinity-torch', 10, 'Assist', 0, 'active'),
    ('trinity-veritas', 10, 'Assist', 0, 'active'),
    ('trinity-gcm', 10, 'Assist', 0, 'active'),
    ('trinity-chesed', 10, 'Assist', 0, 'active'),
    ('trinity-mel', 10, 'Assist', 0, 'active'),
    ('trinity-apm', 10, 'Assist', 0, 'active'),
    ('trinity-sophia', 10, 'Assist', 0, 'active'),
    ('trinity-nexus', 10, 'Assist', 0, 'active'),
    ('trinity-hdm', 10, 'Assist', 0, 'active')
ON CONFLICT (agent_name) DO UPDATE 
SET status = 'active', 
    reputation_score = GREATEST(trinity_agent_registry.reputation_score, 10),
    current_tier = COALESCE(trinity_agent_registry.current_tier, 'Assist');

-- 3. ALIGN PENDING TASKS
-- Standardize names to 'trinity-name' prefix and ensured assigned_to is used
UPDATE public.trinity_tasks 
SET assigned_to = 'trinity-mel' WHERE assigned_to = 'MEL';

UPDATE public.trinity_tasks 
SET assigned_to = 'trinity-orch' WHERE assigned_to = 'ORCH' OR assigned_to = 'orch';

UPDATE public.trinity_tasks 
SET assigned_to = 'trinity-gcm' WHERE assigned_to = 'GCM';

-- Ensure Byzantine columns exist for HyperDAG v8.0
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_tasks' AND column_name = 'requires_consensus') THEN
        ALTER TABLE public.trinity_tasks ADD COLUMN requires_consensus BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_tasks' AND column_name = 'consensus_group') THEN
        ALTER TABLE public.trinity_tasks ADD COLUMN consensus_group UUID;
    END IF;
END $$;
