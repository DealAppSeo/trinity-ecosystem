-- CHECK AGENT ACTIVITY
-- Run this in Supabase SQL Editor to see what the swarm is working on.

SELECT 
    id,
    title,
    status, -- 'pending', 'processing', 'completed', 'failed'
    assigned_to,
    priority,
    created_at,
    updated_at
FROM 
    public.trinity_tasks
WHERE 
    status != 'completed' -- Hide old finished stuff, show Active and Pending
    OR 
    updated_at > NOW() - INTERVAL '1 hour' -- Show recently finished stuff
ORDER BY 
    CASE WHEN status = 'processing' THEN 1 ELSE 2 END, -- Show Active first
    updated_at DESC;

-- OPTIONAL: Check Agent Heartbeats (Who is online?)
SELECT * FROM public.trinity_heartbeat ORDER BY last_seen DESC LIMIT 20;
