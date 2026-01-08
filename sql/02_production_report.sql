-- PART 2: PRODUCTION REPORT
-- Run this AFTER the schema fix.

-- A. COMPLETED MISSIONS
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

-- B. NEW ARTIFACTS
SELECT 
    a.agent_name, -- This should now exist!
    a.artifact_type,
    a.content_preview,
    a.created_at
FROM trinity_artifacts a
WHERE a.created_at > NOW() - INTERVAL '12 hours'
ORDER BY a.created_at DESC;

-- C. RESEARCH FINDINGS
SELECT 
    agent,
    gap as topic,
    summary,
    created_at
FROM trinity_research_log
WHERE created_at > NOW() - INTERVAL '12 hours'
ORDER BY created_at DESC;
