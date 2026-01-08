-- INJECT TEST TASKS FOR TRINITY SWARM
-- Run this in Supabase SQL Editor to queue up work for the next few hours.

-- 1. RESEARCH TASK (Testing Search Tool)
INSERT INTO public.trinity_tasks (title, description, priority, task_type, status)
VALUES (
    'Research Top 5 AI Agent Protocols on GitHub',
    'Search GitHub and the web for the top 5 most popular AI Agent protocols (e.g. AutoGPT, BabyAGI, etc.). Create a markdown table comparing their: 1. Star Count, 2. Core Language, 3. Key Feature. Save as "agent-protocol-comparison.md".',
    10,
    'research',
    'pending'
);

-- 2. CODING TASK (Testing Local Artifacts)
INSERT INTO public.trinity_tasks (title, description, priority, task_type, status)
VALUES (
    'Create a Matrix Rain Effect Component',
    'Write a single-file React component (MatrixRain.tsx) that renders a falling green code Matrix effect using HTML5 Canvas. It should be responsive and performant. Save the code as an artifact.',
    9,
    'code',
    'pending'
);

-- 3. STRATEGY TASK (Testing Reasoning)
INSERT INTO public.trinity_tasks (title, description, priority, task_type, status)
VALUES (
    'Draft "Agency-as-a-Service" Offer',
    'We are pivoting to selling AI Agent swarms to businesses. Write a compelling 1-page "Offer Document" (markdown) titled "The Trinity Advantage". Focus on "Verified Labor" and "Self-Healing Workforces". Target audience: Enterprise CTOs.',
    8,
    'content',
    'pending'
);

-- 4. CREATIVE TASK (Testing Persona)
INSERT INTO public.trinity_tasks (title, description, priority, task_type, status)
VALUES (
    'Compose a Constitutional Poem',
    'Write a poem (4 stanzas) that embodies the spirit of the Trinity Constitution (Philippians 4:8). It should reflect on the balance between Truth and Survival. Save as "trinity-poem.md".',
    5,
    'creative',
    'pending'
);

-- 5. SELF-HEALING TEST (Testing Logic)
INSERT INTO public.trinity_tasks (title, description, priority, task_type, status)
VALUES (
    '[SYSTEM] Verify Swarm Health',
    'Run a diagnostic on the 3x3 grid. Check if all agents have reported a heartbeat in the last 15 minutes. Generate a "Swarm Health Report" artifact listing any dead or stale agents.',
    10,
    'system',
    'pending'
);
