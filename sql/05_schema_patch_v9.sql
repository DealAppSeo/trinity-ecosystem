-- STABILIZATION PATCH V9
-- 1. ADD MISSING SQUAD COLUMN
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_agent_registry' AND column_name = 'squad') THEN
        ALTER TABLE public.trinity_agent_registry ADD COLUMN squad TEXT;
    END IF;
END $$;

-- 2. POPULATE INITIAL SQUAD DATA (ALIGNMENT)
UPDATE public.trinity_agent_registry SET squad = 'ALPHA' WHERE agent_name IN ('trinity-orch', 'trinity-apm', 'trinity-gcm', 'trinity-hdm');
UPDATE public.trinity_agent_registry SET squad = 'BETA' WHERE agent_name IN ('trinity-mel', 'trinity-torch', 'trinity-veritas');
UPDATE public.trinity_agent_registry SET squad = 'GAMMA' WHERE agent_name IN ('trinity-shofet', 'trinity-sophia', 'trinity-nexus', 'trinity-chesed', 'trinity-w3c');

-- 3. ENSURE ARTIFACTS HAVE TASK_ID FOR JOIN
-- (Already confirmed task_id exists, but ensures data integrity for UI joins)
COMMENT ON COLUMN public.trinity_artifacts.task_id IS 'Core link for BFT verification loop';

-- 4. VERIFY STATUS CONSISTENCY
-- Ensure 'online' is used as the standard active status
UPDATE public.trinity_agent_registry SET status = 'online' WHERE status = 'active';

-- 5. RE-INDEX FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_artifacts_task_id ON public.trinity_artifacts(task_id);
