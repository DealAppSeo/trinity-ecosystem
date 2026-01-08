-- CLEANUP ZOMBIE TASKS
-- The user identified 94 tasks stuck in 'in_progress' with no artifacts.
-- This script resets them to 'pending' so they can be picked up again (or failed/archived).

-- 1. Log the count before update
SELECT count(*) as zombie_count 
FROM trinity_tasks 
WHERE status = 'in_progress' 
  AND updated_at < NOW() - INTERVAL '1 hour';

-- 2. Reset tasks stuck for > 1 hour to 'pending' (Retry)
-- We assume if they haven't updated in an hour, the agent crash/died.
UPDATE trinity_tasks
SET 
  status = 'pending',
  claimed_by = NULL,
  started_at = NULL,
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{reset_reason}', '"stale_in_progress_detected_by_cleanup"')
WHERE status = 'in_progress' 
  AND updated_at < NOW() - INTERVAL '1 hour';

-- 3. Verify
SELECT count(*) as remaining_zombies 
FROM trinity_tasks 
WHERE status = 'in_progress';
