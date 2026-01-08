-- FINAL FIX & REPORT
-- The 'agent' column is a Number (ID), but our agents use Names (Text).
-- This script adds the missing 'agent_name' column so they can save their work.

-- 1. ADD MISSING COLUMN
ALTER TABLE trinity_artifacts ADD COLUMN IF NOT EXISTS agent_name TEXT;

-- 2. OVERNIGHT PRODUCTION REPORT
-- now we can select 'agent_name' safely.

SELECT 
    'Completed Tasks' as category,
    title as item,
    assigned_to as agent,
    completed_at as time
FROM trinity_tasks 
WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '12 hours'

UNION ALL

SELECT 
    'New Artifacts' as category,
    artifact_type as item,
    agent_name as agent,
    created_at as time
FROM trinity_artifacts 
WHERE created_at > NOW() - INTERVAL '12 hours'

UNION ALL

SELECT 
    'Research' as category,
    gap as item,
    agent,
    created_at as time
FROM trinity_research_log 
WHERE created_at > NOW() - INTERVAL '12 hours'

ORDER BY time DESC;
