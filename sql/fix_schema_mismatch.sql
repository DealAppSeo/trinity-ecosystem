-- FIX SCHEMA MISMATCH
-- The code expects 'agent_name' in 'trinity_artifacts'.
-- The database seems to have 'agent' or is missing the column.

-- 1. Check/Add agent_name column to trinity_artifacts
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'trinity_artifacts' 
        AND column_name = 'agent_name'
    ) THEN
        -- If 'agent' exists, rename it. Otherwise add 'agent_name'.
        IF EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'trinity_artifacts' 
            AND column_name = 'agent'
        ) THEN
            ALTER TABLE trinity_artifacts RENAME COLUMN agent TO agent_name;
        ELSE
            ALTER TABLE trinity_artifacts ADD COLUMN agent_name TEXT;
        END IF;
    END IF;
END $$;

-- 2. Ensure trinity_agent_registry also has agent_name (it should)
-- Just in case.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'trinity_agent_registry' 
        AND column_name = 'agent'
    ) THEN
        ALTER TABLE trinity_agent_registry RENAME COLUMN agent TO agent_name;
    END IF;
END $$;
