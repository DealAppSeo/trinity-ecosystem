-- CHECK ACTIVE AGENT TASKS
-- Run this to see exactly what is being worked on right now.

SELECT 
    id,
    title,
    assigned_to as agent,
    status,
    task_type,
    started_at,
    -- Calculate duration in minutes
    EXTRACT(EPOCH FROM (NOW() - started_at))/60 as duration_min
FROM trinity_tasks
WHERE status = 'in_progress'
ORDER BY started_at DESC;

-- PENDING QUEUE (What's next?)
SELECT 
    id,
    title,
    assigned_to,
    priority
FROM trinity_tasks
WHERE status = 'pending'
ORDER BY priority DESC, created_at ASC
LIMIT 5;
