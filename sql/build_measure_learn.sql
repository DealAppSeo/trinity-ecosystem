-- BUILD-MEASURE-LEARN LOOP DASHBOARD
-- Run this in Supabase SQL Editor to enable "Ecosystem Dogfooding"

-- 1. MEASURE: Learning Velocity (Weekly Task Completion Rate)
CREATE OR REPLACE VIEW view_learning_velocity AS
SELECT 
    agent_name,
    DATE_TRUNC('week', created_at) as week_start,
    COUNT(*) as tasks_completed,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as tasks_failed,
    ROUND((COUNT(*) - SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END))::numeric / GREATEST(COUNT(*), 1), 2) as success_rate
FROM trinity_agent_logs
WHERE action = 'task_complete' OR action = 'task_failed'
GROUP BY agent_name, week_start
ORDER BY week_start DESC;

-- 2. LEARN: Agent "Lightbulb Moments" (Pattern Recognition)
CREATE OR REPLACE VIEW view_agent_insights AS
SELECT 
    agent_name,
    created_at,
    content as insight,
    file_path
FROM trinity_artifacts
WHERE artifact_type = 'wisdom' OR artifact_type = 'pattern'
ORDER BY created_at DESC;

-- 3. BUILD: System Health (Dogfooding)
-- Tracks if agents are actually using the tools we built (ResearchTool, etc.)
CREATE OR REPLACE VIEW view_tool_usage AS
SELECT 
    agent,
    action as tool_name,
    COUNT(*) as usage_count,
    MAX(created_at) as last_used
FROM trinity_agent_logs
WHERE action LIKE '%tool%'
GROUP BY agent, action;
