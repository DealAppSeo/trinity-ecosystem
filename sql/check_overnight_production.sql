-- OVERNIGHT PRODUCTION REPORT
-- Run this to see what the agents built while you slept (Last 12 Hours).

-- 1. COMPLETED MISSIONS (The "Done" List)
SELECT 
    t.title,
    t.assigned_to as agent,
    t.result as summary,
    t.completed_at,
    t.task_type
FROM trinity_tasks t
WHERE t.status = 'completed'
AND t.completed_at > NOW() - INTERVAL '12 hours'
ORDER BY t.completed_at DESC;

-- 2. NEW ARTIFACTS (The "Deliverables")
SELECT 
    a.agent_name,
    a.artifact_type,
    a.content_preview,
    a.created_at
FROM trinity_artifacts a
WHERE a.created_at > NOW() - INTERVAL '12 hours'
ORDER BY a.created_at DESC;

-- 3. AUDIT & RESEARCH FINDINGS
SELECT 
    agent,
    gap as topic,
    summary,
    created_at
FROM trinity_research_log
WHERE created_at > NOW() - INTERVAL '12 hours'
ORDER BY created_at DESC;
