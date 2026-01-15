-- RESET STUCK TASKS
-- This un-sticks the swarm by moving "Running" tasks back to "Pending"
-- if they have been stuck for more than 10 minutes.

UPDATE public.trinity_tasks
SET 
    status = 'pending',
    assigned_to = NULL,
    updated_at = NOW()
WHERE 
    status IN ('processing', 'running') -- Check both keywords just in case
    AND updated_at < NOW() - INTERVAL '10 minutes';

-- Verify the result
SELECT status, count(*) FROM public.trinity_tasks GROUP BY status;
