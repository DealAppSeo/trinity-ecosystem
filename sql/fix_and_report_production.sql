-- UNIFIED FIX & REPORT SCRIPT
-- 1. Fixes the schema mismatch (agent -> agent_name)
-- 2. Runs the Overnight Production Report

-- === PART 1: SCHEMA FIX ===
DO $$
BEGIN
    -- Fix 'trinity_artifacts'
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'trinity_artifacts' AND column_name = 'agent_name'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'trinity_artifacts' AND column_name = 'agent'
        ) THEN
            ALTER TABLE trinity_artifacts RENAME COLUMN agent TO agent_name;
        ELSE
            ALTER TABLE trinity_artifacts ADD COLUMN agent_name TEXT;
        END IF;
    END IF;

    -- Fix 'trinity_tasks' if needed (usually 'assigned_to')
    -- No changes needed usually, but good to know.
END $$;

-- === PART 2: OVERNIGHT REPORT ===

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
    a.agent_name as agent,
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
