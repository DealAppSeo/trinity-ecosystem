-- TRINITY SYSTEM DASHBOARD
-- A comprehensive view of the ecosystem's health.

-- 1. ONLINE AGENTS (Heartbeat)
SELECT 
    agent, 
    status, 
    last_seen,
    NOW() - last_seen::timestamp as time_since_ping
FROM trinity_heartbeat
WHERE last_seen > NOW() - INTERVAL '10 minutes';

-- 2. ACTIVE MISSIONS
SELECT 
    assigned_to, 
    title, 
    task_type, 
    status 
FROM trinity_tasks 
WHERE status = 'in_progress';

-- 3. RECENT ARTIFACTS (Productivity)
SELECT 
    agent_name, 
    artifact_type, 
    content_preview, 
    created_at 
FROM trinity_artifacts 
ORDER BY created_at DESC 
LIMIT 5;

-- 4. CONSULTING LOGS (Audit Results)
-- Checks if any audits have been completed recently
SELECT 
    agent, 
    action, 
    message 
FROM trinity_agent_logs 
WHERE action IN ('consulting_audit', 'research_complete')
ORDER BY created_at DESC
LIMIT 5;
