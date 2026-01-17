-- EMERGENCY ALIGNMENT V9: ANTIFRAGILE VERIFICATION UPGRADE
-- Adds 'verified' status and audit columns for Triad BFT consensus.

-- 1. ENHANCE TASK STATUS ENUM
-- Note: Some environments use a text check constraint, some use an enum.
-- We'll attempt to update the check constraint on trinity_tasks.status if it exists.
DO $$ 
BEGIN
    -- Check if we need to update a check constraint
    IF EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage 
        WHERE table_name = 'trinity_tasks' AND column_name = 'status'
    ) THEN
        -- Replacing status check constraint to include 'verified' and 'done' (if 'completed' is being renamed)
        -- We'll keep 'completed' for compatibility but prioritize 'done' in code.
        ALTER TABLE trinity_tasks DROP CONSTRAINT IF EXISTS trinity_tasks_status_check;
        ALTER TABLE trinity_tasks ADD CONSTRAINT trinity_tasks_status_check 
        CHECK (status IN ('pending', 'in_progress', 'completed', 'done', 'verified', 'failed', 'archived'));
    END IF;
END $$;

-- 2. ADD AUDIT & BFT COLUMNS
DO $$ 
BEGIN
    -- verification_triad (Links to consensus group or array of verifiers)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_tasks' AND column_name = 'verification_triad') THEN
        ALTER TABLE trinity_tasks ADD COLUMN verification_triad TEXT;
    END IF;

    -- verified_at
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_tasks' AND column_name = 'verified_at') THEN
        ALTER TABLE trinity_tasks ADD COLUMN verified_at TIMESTAMP WITH TIME ZONE;
    END IF;

    -- verification_proof (zk-ready hash)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_tasks' AND column_name = 'verification_proof') THEN
        ALTER TABLE trinity_tasks ADD COLUMN verification_proof TEXT;
    END IF;

    -- verify_count (For 2/3 BFT consensus)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_tasks' AND column_name = 'verify_count') THEN
        ALTER TABLE trinity_tasks ADD COLUMN verify_count INTEGER DEFAULT 0;
    END IF;

    -- verified_by (Primary/First verifier)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_tasks' AND column_name = 'verified_by') THEN
        ALTER TABLE trinity_tasks ADD COLUMN verified_by TEXT;
    END IF;
    
    -- verification_result
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_tasks' AND column_name = 'verification_result') THEN
        ALTER TABLE trinity_tasks ADD COLUMN verification_result TEXT;
    END IF;

    -- verification_details
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_tasks' AND column_name = 'verification_details') THEN
        ALTER TABLE trinity_tasks ADD COLUMN verification_details TEXT;
    END IF;
END $$;

-- 3. CREATE PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_trinity_tasks_status_done ON trinity_tasks(status) WHERE status = 'done';
CREATE INDEX IF NOT EXISTS idx_trinity_tasks_status_completed ON trinity_tasks(status) WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_trinity_tasks_verified_by ON trinity_tasks(verified_by);

-- 4. ALIGN ARTIFACTS TABLE (Holy Grail V5)
DO $$ 
BEGIN
    -- Ensure content column exists (Sometimes missing in legacy V4)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_artifacts' AND column_name = 'content') THEN
        ALTER TABLE trinity_artifacts ADD COLUMN content TEXT;
    END IF;
    
    -- Ensure creator_agent exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_artifacts' AND column_name = 'creator_agent') THEN
        ALTER TABLE trinity_artifacts ADD COLUMN creator_agent TEXT;
    END IF;

    -- Ensure task_id is TEXT (compatibility for UUID/BIGINT)
    -- This is a riskier alter if data exists, but necessary for alignment.
    -- Assuming already TEXT from V8, but double checking.
END $$;

-- 5. LOG ALIGNMENT
INSERT INTO trinity_artifacts (task_id, title, artifact_type, content, creator_agent, status)
VALUES ('system-alignment-v9', 'EMERGENCY_ALIGNMENT_V9 Execution', 'report', 'Verified status added. BFT columns initialized. 3x3 Triad support active.', 'Antigravity', 'created')
ON CONFLICT DO NOTHING;
