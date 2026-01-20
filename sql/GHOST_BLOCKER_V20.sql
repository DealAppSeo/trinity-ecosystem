-- GHOST_BLOCKER_V20.sql
-- EFFECTIVELY "STOPS" LEGACY AGENTS BY BLOCKING DB WRITES

-- 1. DROP LEGACY AGENTS FROM REGISTRY (Redundant but safe)
DELETE FROM trinity_agent_registry 
WHERE agent_name NOT LIKE 'trinity-%' 
AND agent_name != 'RESERVED';

-- 2. CREATE A TRIGGER TO BLOCK NON-TRINITY CLAIMANTS
-- This is the "Nuclear Barrier". Even if the processes are running, 
-- they will be blocked from claiming tasks.
CREATE OR REPLACE FUNCTION block_legacy_agents_fn()
RETURNS TRIGGER AS $$
BEGIN
    -- Only allow trinity- prefixed agents or NULL (for reset)
    IF NEW.claimed_by IS NOT NULL AND NEW.claimed_by NOT LIKE 'trinity-%' AND NEW.claimed_by != 'SYSTEM' THEN
        RETURN OLD; -- Silently ignore the update instead of crashing the agent
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_legacy_agents ON trinity_tasks;
CREATE TRIGGER trg_block_legacy_agents
BEFORE UPDATE ON trinity_tasks
FOR EACH ROW
WHEN (NEW.claimed_by IS DISTINCT FROM OLD.claimed_by)
EXECUTE FUNCTION block_legacy_agents_fn();

-- 3. PERFORM ONE LAST WIPE
UPDATE trinity_tasks 
SET status = 'pending', 
    claimed_by = NULL, 
    assigned_to = NULL,
    claimed_at = NULL,
    started_at = NULL,
    result = NULL
WHERE status NOT IN ('done', 'verified', 'failed');
