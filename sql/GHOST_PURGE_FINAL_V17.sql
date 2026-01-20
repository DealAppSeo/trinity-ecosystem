-- GHOST_PURGE_FINAL_V17.sql
-- THE ULTIMATE RESET FOR PURE AUTONOMY

-- 1. PURGE LEGACY REGISTRY ENTRIES
-- Delete any agent that doesn't follow the 'trinity-' prefix (except reserved keywords)
DELETE FROM trinity_agent_registry 
WHERE agent_name NOT LIKE 'trinity-%' 
AND agent_name != 'RESERVED';

-- 2. RESET ALL GHOST TASKS
-- Any task that is NOT in a final state (done, verified, failed) must be reset.
-- This includes 'doing', 'in_progress', 'pending_clarification', and 'running'.
-- We clear claimed_by and assigned_to to allow fresh pulling.
UPDATE trinity_tasks 
SET status = 'pending', 
    assigned_to = NULL, 
    claimed_by = NULL, 
    claimed_at = NULL,
    started_at = NULL,
    result = NULL,
    verification_result = NULL
WHERE status NOT IN ('done', 'verified', 'failed');

-- 3. RESET LEGACY HEARTBEATS
DELETE FROM agent_heartbeat WHERE agent_name NOT LIKE 'trinity-%';
DELETE FROM trinity_heartbeat WHERE agent NOT LIKE 'trinity-%';

-- 4. MARK ALL VALID AGENTS AS OFFLINE
-- This forces them to re-sync state and re-claim 1 task at a time.
UPDATE trinity_agent_registry 
SET status = 'offline',
    current_task_summary = 'Idle (Post-Purge)'
WHERE agent_name LIKE 'trinity-%';

-- 5. LOG THE PURGE
DO $$
BEGIN
    INSERT INTO trinity_agent_logs (agent, action, message, category)
    VALUES ('SYSTEM', 'GHOST_PURGE', 'Universal alignment and task reset completed (Phase 20).', 'maintenance')
    ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN
    -- Fallback for different log schema
    NULL;
END $$;
