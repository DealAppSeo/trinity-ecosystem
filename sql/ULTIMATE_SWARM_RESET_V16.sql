-- ULTIMATE_SWARM_RESET_V16.sql
-- Goal: Absolute floor-wipe of all legacy ghosts and pre-assignments.
-- This enables TRUE autonomous pull-based behavior for the 12-agent swarm.

DO $$ 
BEGIN
    -- 1. KILL THE GHOSTS: Delete any registry entry that isn't a proper trinity-agent.
    -- (Except for the 'RESERVED' keyword)
    DELETE FROM trinity_agent_registry 
    WHERE agent_name NOT LIKE 'trinity-%' 
    AND agent_name != 'RESERVED';

    -- 2. RESET ALL TASKS: Move every task that is not 'done' or 'verified' back to 'pending'.
    -- This includes 'doing', 'in_progress', and 'pending_clarification'.
    -- We also WIPE all assignments (assigned_to) and claims (claimed_by).
    UPDATE trinity_tasks 
    SET status = 'pending', 
        assigned_to = NULL, 
        claimed_by = NULL, 
        claimed_at = NULL,
        started_at = NULL,
        metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{reset_reason}', '"ULTIMATE_RESET_V16"')
    WHERE status NOT IN ('done', 'verified', 'failed');

    -- 3. Mark all valid agents as 'offline' to force a fresh heartbeat check-in.
    UPDATE trinity_agent_registry SET status = 'offline' WHERE agent_name LIKE 'trinity-%';

END $$;
