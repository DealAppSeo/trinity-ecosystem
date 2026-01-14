-- Function to seed evergreen tasks
-- Usage: SELECT seed_evergreen_tasks(3);

CREATE OR REPLACE FUNCTION seed_evergreen_tasks(num_tasks INTEGER DEFAULT 3)
RETURNS VOID AS $$
DECLARE
    tasks_array jsonb[] := ARRAY[
        '{"title": "Self-Diagnostic Scan", "desc": "Analyze recent logs for TypeErrors and suggest fixes. Output JSON report."}',
        '{"title": "Knowledge Base Expansion", "desc": "Research and summarize AI ethics from public sources. Create MD artifacts."}',
        '{"title": "Prompt Optimization", "desc": "Test prompt variations on math simulations. Produce optimization report."}',
        '{"title": "Data Curation Pipeline", "desc": "Collect and clean sample synthetic datasets. Output CSV."}',
        '{"title": "Workflow Simulation", "desc": "Model multi-agent handoffs for hypothetical scenarios. Create Flowcharts."}',
        '{"title": "Trend Monitoring", "desc": "Analyze recent public AI news for patterns and new frameworks."}',
        '{"title": "Artifact Archiving", "desc": "Organize and compress past task outputs for retrieval."}',
        '{"title": "Agent Skill Benchmarking", "desc": "Run standardized logic puzzles to benchmark agent reasoning."}',
        '{"title": "Collaborative Storytelling", "desc": "Co-create educational narratives about swarm intelligence."}',
        '{"title": "Resource Optimization", "desc": "Analyze swarm memory/token usage and propose efficiency gains."}'
    ];
    selected_task jsonb;
    t_title text;
    t_desc text;
BEGIN
    FOR i IN 1..num_tasks LOOP
        -- Randomly select a task
        selected_task := tasks_array[1 + FLOOR(RANDOM() * ARRAY_LENGTH(tasks_array, 1))];
        t_title := selected_task->>'title';
        t_desc := selected_task->>'desc';

        INSERT INTO trinity_tasks (title, description, task_type, priority, status)
        VALUES (
            '[Evergreen] ' || t_title, 
            t_desc || E'\n\n**Evergreen Protocol**: Low priority, self-sustaining, safe simulation only.',
            'evergreen', 
            2, -- Low Priority in our 1-10 scale
            'pending'
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql;
