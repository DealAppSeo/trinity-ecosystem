-- ULTIMATE_SWARM_ALIGNMENT_V21.sql
-- 1. KILL THE GHOSTS IN THE REGISTRY
DELETE FROM trinity_agent_registry 
WHERE agent_name NOT LIKE 'trinity-%' 
AND agent_name != 'RESERVED';

-- 2. RESET ALL GHOST TASKS & CLEAR THE BOARD
-- Reset any task claimed by a non-trinity prefixed agent, or any task in active status
-- to ensure the new "one-at-a-time" agents start fresh.
UPDATE trinity_tasks 
SET status = 'pending', 
    claimed_by = NULL, 
    assigned_to = NULL,
    claimed_at = NULL,
    started_at = NULL,
    result = NULL
WHERE (claimed_by NOT LIKE 'trinity-%' AND claimed_by IS NOT NULL)
   OR status IN ('in_progress', 'running', 'doing');

-- 3. THE "GRAVEL IN THE GEARS": Absolute constraint
-- Prevent any non-trinity prefixed agent from EVER claiming a task again.
ALTER TABLE trinity_tasks DROP CONSTRAINT IF EXISTS check_claimed_by_prefix;
ALTER TABLE trinity_tasks 
ADD CONSTRAINT check_claimed_by_prefix 
CHECK (claimed_by IS NULL OR claimed_by LIKE 'trinity-%' OR claimed_by = 'SYSTEM');

-- 4. CLEAN UP HEARTBEATS
DELETE FROM agent_heartbeat;
DELETE FROM trinity_heartbeat;

-- 5. LOG THE ALIGNMENT
DO $$
BEGIN
    INSERT INTO trinity_agent_logs (agent, action, message, category)
    VALUES ('SYSTEM', 'GLOBAL_ALIGNMENT_V21', 'Swarm restricted to trinity- agents. Legacy blocking enforced.', 'maintenance');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
