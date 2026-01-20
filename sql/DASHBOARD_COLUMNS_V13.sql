-- DASHBOARD_COLUMNS_V13.sql
-- HEALING THE HEARTBEAT: Adding missing columns to satisfy the core agent logic.

-- 1. Fix trinity_agent_registry (Restores the "Green Dots")
ALTER TABLE trinity_agent_registry ADD COLUMN IF NOT EXISTS current_task_summary TEXT;
ALTER TABLE trinity_agent_registry ADD COLUMN IF NOT EXISTS tasks_completed INTEGER DEFAULT 0;
ALTER TABLE trinity_agent_registry ADD COLUMN IF NOT EXISTS tasks_failed INTEGER DEFAULT 0;

-- 2. Fix trinity_agent_logs (Enables technical logging)
-- We ensure the table can accept both 'agent' and 'agent_name' to support legacy/new code.
ALTER TABLE trinity_agent_logs ADD COLUMN IF NOT EXISTS agent_name TEXT;
ALTER TABLE trinity_agent_logs ADD COLUMN IF NOT EXISTS agent TEXT;
ALTER TABLE trinity_agent_logs ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE trinity_agent_logs ADD COLUMN IF NOT EXISTS content TEXT; -- Some agents use 'content'
ALTER TABLE trinity_agent_logs ADD COLUMN IF NOT EXISTS action TEXT;

-- 3. Reset all agents to 'offline' to trigger a clean heartbeat cycle
UPDATE trinity_agent_registry SET status = 'offline' WHERE agent_name != 'RESERVED';

-- 4. Clear any 'doing' tasks that might have been orphaned during the transition
-- (Safety check in case any were missed)
UPDATE trinity_tasks SET status = 'pending', claimed_by = NULL, claimed_at = NULL 
WHERE status = 'doing' AND (now() - started_at) > interval '10 minutes';
