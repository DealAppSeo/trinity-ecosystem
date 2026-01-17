-- DASHBOARD_COLUMNS_V11.sql
-- Fixes schema mismatch for agent heartbeats

DO $$ 
BEGIN
    -- 1. Add current_task_summary to trinity_agent_registry
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_agent_registry' AND column_name = 'current_task_summary') THEN
        ALTER TABLE trinity_agent_registry ADD COLUMN current_task_summary TEXT DEFAULT 'Idle';
    END IF;

    -- 2. Ensure reputation_score has a default
    ALTER TABLE trinity_agent_registry ALTER COLUMN reputation_score SET DEFAULT 50;

    -- 3. Ensure tasks_completed has a default
    ALTER TABLE trinity_agent_registry ALTER COLUMN tasks_completed SET DEFAULT 0;

END $$;

-- Verify the column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'trinity_agent_registry' AND column_name = 'current_task_summary';
