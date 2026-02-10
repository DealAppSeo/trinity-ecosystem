-- DIAGNOSTIC: Check Agent Activity
-- Run this in the Supabase SQL Editor to see why agents might be stalling.

-- 1. Check last active times for all agents
SELECT 
    agent_name, 
    last_active, 
    NOW() - last_active as idle_duration,
    status,
    current_task_summary
FROM trinity_agent_registry
ORDER BY last_active DESC;

-- 2. Check if Sophia, Nexus, or Chesed have pending tasks
SELECT id, title, status, claimed_by, created_at
FROM trinity_tasks
WHERE status IN ('pending', 'doing', 'pending_clarification')
AND (claimed_by IN ('trinity-sophia', 'trinity-nexus', 'trinity-chesed') OR assigned_to IN ('trinity-sophia', 'trinity-nexus', 'trinity-chesed'));

-- 3. Check for recent errors in logs for these agents
SELECT * 
FROM trinity_agent_logs
WHERE agent_name IN ('trinity-sophia', 'trinity-nexus', 'trinity-chesed')
ORDER BY created_at DESC
LIMIT 20;
