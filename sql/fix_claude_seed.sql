-- This script fixes the error encountered when trying to seed the trinity_tasks table.
-- The previous error (2BP01) occurred because 'trinity_tasks' is a core table with many dependencies (foreign keys from other tables)
-- and cannot be dropped deeply without cascading, which would destroy views and other data.
-- Instead, we simply insert the new tasks into the valid existing table structure.

INSERT INTO public.trinity_tasks (
    title,
    description,
    status,
    priority,
    assigned_to,
    task_type,
    created_at,
    metadata
)
VALUES
    ('Poetry Generation - HDM',      'Write a poem for the Trinity Ecosystem.', 'pending', 2, 'HDM',      'write_poem', NOW(), '{"requires_external_artifact": true}'),
    ('Poetry Generation - APH',      'Write a poem for the Trinity Ecosystem.', 'pending', 2, 'APH',      'write_poem', NOW(), '{"requires_external_artifact": true}'),
    ('Poetry Generation - HEL',      'Write a poem for the Trinity Ecosystem.', 'pending', 2, 'HEL',      'write_poem', NOW(), '{"requires_external_artifact": true}'),
    ('Poetry Generation - VERITAS',  'Write a poem for the Trinity Ecosystem.', 'pending', 2, 'VERITAS',  'write_poem', NOW(), '{"requires_external_artifact": true}'),
    ('Poetry Generation - NEXUS',    'Write a poem for the Trinity Ecosystem.', 'pending', 2, 'NEXUS',    'write_poem', NOW(), '{"requires_external_artifact": true}'),
    ('Poetry Generation - ANTIGRAV', 'Write a poem for the Trinity Ecosystem.', 'pending', 2, 'ANTIGRAV', 'write_poem', NOW(), '{"requires_external_artifact": true}'),
    ('Poetry Generation - GCH',      'Write a poem for the Trinity Ecosystem.', 'pending', 2, 'GCH',      'write_poem', NOW(), '{"requires_external_artifact": true}'),
    ('Poetry Generation - TORCH',    'Write a poem for the Trinity Ecosystem.', 'pending', 2, 'TORCH',    'write_poem', NOW(), '{"requires_external_artifact": true}');

-- Confirmation
SELECT count(*) as new_tasks_count FROM public.trinity_tasks WHERE task_type = 'write_poem' AND status = 'pending';
