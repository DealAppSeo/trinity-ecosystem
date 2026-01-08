-- PART 1: FIX SCHEMA
-- Run this FIRST. It ensures the 'agent_name' column exists.

-- 1. Rename 'agent' to 'agent_name' if it exists (Legacy fix)
DO $$
BEGIN
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_artifacts' AND column_name = 'agent') THEN
        ALTER TABLE trinity_artifacts RENAME COLUMN agent TO agent_name;
    END IF;
END $$;

-- 2. Add 'agent_name' if it is still missing
ALTER TABLE trinity_artifacts ADD COLUMN IF NOT EXISTS agent_name TEXT;

-- 3. Verify (This line is just for output confirmation)
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'trinity_artifacts';
