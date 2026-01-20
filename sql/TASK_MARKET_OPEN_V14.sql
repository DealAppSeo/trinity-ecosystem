-- TASK_MARKET_OPEN_V14.sql
-- Goal: Decouple 'Intent' (assigned_to) from 'Action' (claimed_by) to stop UI confusion.
-- Force strict pull-based claiming for the 12-agent swarm.

DO $$ 
BEGIN
    -- 1. Decouple Pending Tasks: Remove assigned_to from all non-heartbeat pending tasks.
    -- This makes them "Open Market" so the first available agent can pull them by priority.
    UPDATE trinity_tasks 
    SET assigned_to = NULL 
    WHERE status = 'pending' 
    AND task_type != 'heartbeat' 
    AND title NOT LIKE '[HEARTBEAT]%';

    -- 2. Purge Legacy Claimants: Any task claimed by a non-trinity prefixed agent is reset.
    -- This stops legacy/ghost agents from holding onto tasks.
    UPDATE trinity_tasks 
    SET status = 'pending', 
        claimed_by = NULL, 
        claimed_at = NULL,
        metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{reset_reason}', '"LEGACY_PURGE_V14"')
    WHERE status IN ('doing', 'in_progress', 'pending_clarification')
    AND (claimed_by NOT LIKE 'trinity-%' OR claimed_by IS NULL);

    -- 3. Enforce Universal Status: Ensure 'doing' is the only active status (sync with code).
    UPDATE trinity_tasks SET status = 'doing' WHERE status = 'in_progress';

    -- 4. Registry Cleanup: Mark all as 'offline' to force a fresh heartbeat check-in.
    UPDATE trinity_agent_registry SET status = 'offline' WHERE agent_name != 'RESERVED';

END $$;
