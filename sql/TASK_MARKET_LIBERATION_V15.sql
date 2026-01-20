-- TASK_MARKET_LIBERATION_V15.sql
-- Goal: Absolute pull-based model. No 'assigned_to' for ANY pending task.
-- This ensures the "To Do" column in the UI is clean and follows the "one at a time" claim rule.

DO $$ 
BEGIN
    -- 1. Wipe ALL pending assignments.
    UPDATE trinity_tasks 
    SET assigned_to = NULL 
    WHERE status = 'pending';

    -- 2. Final purge of ghost agents or mis-claimed legacy names.
    UPDATE trinity_tasks 
    SET status = 'pending', 
        claimed_by = NULL, 
        claimed_at = NULL,
        metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{reset_reason}', '"FINAL_LIBERATION_V15"')
    WHERE status IN ('doing', 'in_progress', 'pending_clarification')
    AND (claimed_by NOT LIKE 'trinity-%' OR claimed_by IS NULL);

    -- 3. Reset registry to force fresh heartbeats.
    UPDATE trinity_agent_registry SET status = 'offline' WHERE agent_name != 'RESERVED';

END $$;
