-- FINAL SCHEMA FIX (One Transaction)
-- Run this script ALONE.
-- It will fix 'trinity_artifacts' so the reports work.

DO $$
BEGIN
    -- 1. Rename 'agent' to 'agent_name' if the old column exists
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_artifacts' AND column_name = 'agent') THEN
        ALTER TABLE trinity_artifacts RENAME COLUMN agent TO agent_name;
    END IF;

    -- 2. Add 'agent_name' if it is still missing (e.g., table was empty/new)
    IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_artifacts' AND column_name = 'agent_name') THEN
        ALTER TABLE trinity_artifacts ADD COLUMN agent_name TEXT;
    END IF;
END $$;
