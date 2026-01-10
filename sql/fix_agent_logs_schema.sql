-- FIX SCHEMA MISMATCH
-- The code expects 'action' and 'metadata', but the DB might be missing them.

-- 1. Add 'action' column if missing
ALTER TABLE trinity_agent_logs 
ADD COLUMN IF NOT EXISTS action TEXT;

-- 2. Add 'metadata' column if missing (Code uses it for storing version/virtue)
ALTER TABLE trinity_agent_logs 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 3. Verify 'agent' column exists (or rename agent_name if needed)
-- (No-op if 'agent' exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_agent_logs' AND column_name = 'agent') THEN
        ALTER TABLE trinity_agent_logs RENAME COLUMN agent_name TO agent;
    END IF;
EXCEPTION
    WHEN undefined_column THEN
        -- Do nothing if agent_name doesn't exist either
        NULL; 
END $$;
