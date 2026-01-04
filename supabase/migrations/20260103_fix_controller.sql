-- 1. Ensure 'evo' is in the agent groups (Gamma Squad?)
INSERT INTO trinity_agent_groups (group_name, agent_name, description, capabilities)
VALUES ('GAMMA', 'trinity-evo', 'Evolutionary Optimization Agent', '{"focus": "optimization"}')
ON CONFLICT (agent_name) DO NOTHING;

-- 2. Ensure trinity_tasks has proper indices and structure (Fix timeout)
CREATE TABLE IF NOT EXISTS trinity_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',
    priority INT DEFAULT 5,
    agent_assigned TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by TEXT,
    task_type TEXT
);

-- Index for faster querying
CREATE INDEX IF NOT EXISTS idx_trinity_tasks_status ON trinity_tasks(status);
CREATE INDEX IF NOT EXISTS idx_trinity_tasks_created_at ON trinity_tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_trinity_tasks_priority ON trinity_tasks(priority);

-- 3. RLS Policies for Tasks (Fix Permission Denied/Timeout if implicit deny)
ALTER TABLE trinity_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to tasks"
ON trinity_tasks
FOR ALL
USING (true)
WITH CHECK (true);
