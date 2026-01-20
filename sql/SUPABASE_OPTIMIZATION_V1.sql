-- [SUPABASE OPTIMIZATION] - Task Query Performance
-- These indexes resolve stalls in the Trinity dashboard and agent task pickup.

-- Core task status indexing for pickup
CREATE INDEX IF NOT EXISTS idx_tasks_status ON trinity_tasks (status);

-- Priority-based sorting optimization
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON trinity_tasks (priority DESC);

-- Claim logic optimization
CREATE INDEX IF NOT EXISTS idx_tasks_claimed_by ON trinity_tasks (claimed_by);

-- Provenance and Verification optimization
CREATE INDEX IF NOT EXISTS idx_tasks_verified_by ON trinity_tasks (verified_by);

-- Loop detection / Veritas loop optimization
CREATE INDEX IF NOT EXISTS idx_tasks_title_veritas ON trinity_tasks (title) WHERE title LIKE '%[VERIFY]%';

-- Completed tasks analysis
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON trinity_tasks (completed_at ASC);

-- NOTE: Execute these in the Supabase SQL Editor to apply.
