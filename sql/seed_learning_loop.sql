-- sql/seed_learning_loop.sql
-- Evolutionary Learning Loop for Trinity Agents
-- This sequence forces agents to READ previous artifacts before writing new ones.

-- 1. HDM: Initialize the Collective Memory (Infrastructure)
INSERT INTO public.trinity_tasks (title, description, status, priority, assigned_to, task_type, created_at, metadata)
VALUES (
    'Initialize Collective Memory: System Manifest',
    'Create the root memory file for the swarm. \n1. Create directory structure `artifacts/wisdom/` if needed.\n2. Write a file `artifacts/wisdom/system_manifest.md`.\n3. Content: List all active agents (HDM, TORCH, MEL, VERITAS, etc.), their primary virtue, and their current mission. This will serve as the "Context Source" for other agents.',
    'pending',
    10,
    'HDM',
    'code',
    NOW(),
    '{"requires_external_artifact": true, "step": 1}'
);

-- 2. VERITAS: Research & Append (Logic + Reading)
INSERT INTO public.trinity_tasks (title, description, status, priority, assigned_to, task_type, created_at, metadata)
VALUES (
    'Research & Verify: AI Social Mirror',
    '1. READ `artifacts/wisdom/system_manifest.md` to understand your peers.\n2. USE `researchTool` to scan "https://aisocialmirror.com".\n3. WRITE `artifacts/wisdom/research_log_v1.md` summarizing the site''s value proposition and how it aligns with the values in the System Manifest.',
    'pending',
    9,
    'VERITAS',
    'research',
    NOW() + interval '1 minute', -- Slightly delayed to encourage ordering
    '{"requires_external_artifact": true, "step": 2}'
);

-- 3. MEL: Creative Synthesis (Content + Context)
INSERT INTO public.trinity_tasks (title, description, status, priority, assigned_to, task_type, created_at, metadata)
VALUES (
    'Draft Announcement Tweet based on Research',
    '1. LIST files in `artifacts/wisdom/`.\n2. READ `artifacts/wisdom/research_log_v1.md` (created by Veritas).\n3. WRITE a thoughtful LinkedIn/Twitter announcement for AI Social Mirror. Save it to `artifacts/content/announcement_v1.md`.\n4. Ensure the tone matches the "System Manifest" values.',
    'pending',
    8,
    'MEL',
    'content',
    NOW() + interval '2 minutes',
    '{"requires_external_artifact": true, "step": 3}'
);

-- 4. TORCH: Evolutionary Retro (Wisdom + Improvement)
INSERT INTO public.trinity_tasks (title, description, status, priority, assigned_to, task_type, created_at, metadata)
VALUES (
    'Swarm Evolution Review: Cycle 1',
    '1. LIST all files in `artifacts/wisdom/` and `artifacts/content/`.\n2. READ the manifest, research log, and announcement draft.\n3. CRITIQUE the alignment between the Research and the Content.\n4. WRITE `artifacts/wisdom/swarm_evolution_report_01.md` with 3 specific instructions on how the NEXT cycle can be 10% more effective.',
    'pending',
    7,
    'TORCH',
    'system',
    NOW() + interval '3 minutes',
    '{"requires_external_artifact": true, "step": 4}'
);
