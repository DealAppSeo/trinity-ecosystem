
-- 1. SEED/NORMALIZE AGENT REGISTRY (The 3x3 + 3 Orchestration)
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
SET status = 'active', reputation_score = GREATEST(trinity_agent_registry.reputation_score, 10);

-- 2. ALIGN PENDING TASKS
-- If a task is assigned to "MEL", update it to "trinity-mel" to match registry
UPDATE public.trinity_tasks 
SET assigned_to = 'trinity-mel' WHERE assigned_to = 'MEL';
UPDATE public.trinity_tasks 
SET assigned_to = 'trinity-orch' WHERE assigned_to = 'ORCH';
-- Repeat for other short names if necessary

-- 3. ENSURE BFT COLUMNS (If missing)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_tasks' AND column_name = 'requires_consensus') THEN
        ALTER TABLE public.trinity_tasks ADD COLUMN requires_consensus BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_tasks' AND column_name = 'consensus_group') THEN
        ALTER TABLE public.trinity_tasks ADD COLUMN consensus_group UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_tasks' AND column_name = 'signatures') THEN
        ALTER TABLE public.trinity_tasks ADD COLUMN signatures JSONB DEFAULT '[]';
    END IF;
END $$;
