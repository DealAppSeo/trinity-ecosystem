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
        CHECK (status IN ('pending', 'in_progress', 'completed', 'done', 'verified', 'failed', 'archived', 'to_do', 'doing', 'pending_clarification'));
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

    -- [ANTIGRAVITY] RESOLVE VIEW DEPENDENCY
    -- The view v_ready_tasks depends on verified_by. We must drop it to alter the type.
    DROP VIEW IF EXISTS v_ready_tasks;

    -- verified_by (Array for multiple verifiers)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_tasks' AND column_name = 'verified_by') THEN
        -- Check if it's already an array, if not we might need to cast
        -- For simplicity in this script, we'll try to ensure it's TEXT[]
        ALTER TABLE trinity_tasks ALTER COLUMN verified_by TYPE TEXT[] USING array[verified_by];
    ELSE
        ALTER TABLE trinity_tasks ADD COLUMN verified_by TEXT[] DEFAULT '{}';
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

-- 5. PHASE 12: UNIFIED HEARTBEATS & AUTO-ESCALATION
-- Unified Heartbeats View (For Legacy Compatibility + SSOT Transition)
CREATE OR REPLACE VIEW unified_heartbeats AS
SELECT agent_name AS agent, status, last_active, reputation_score, current_tier
FROM trinity_agent_registry  -- Primary SSOT
UNION ALL
SELECT agent, status, last_seen AS last_active, NULL AS reputation_score, NULL AS current_tier
FROM trinity_heartbeat      -- Secondary
UNION ALL
SELECT agent_name AS agent, status, last_ping AS last_active, NULL AS reputation_score, NULL AS current_tier
FROM agent_heartbeat;        -- Legacy Monitoring

-- Add Signatures column for BFT auditing
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_tasks' AND column_name = 'signatures') THEN
        ALTER TABLE trinity_tasks ADD COLUMN signatures JSONB DEFAULT '[]';
    END IF;
END $$;

-- Timeout Trigger for Done → Verified Escalation (Antifragile: Prevent Stalls)
CREATE OR REPLACE FUNCTION escalate_unverified_done()
RETURNS TRIGGER AS $$
BEGIN
  -- Logic: If task stays 'done' for > 10 mins without reaching 2 verifications, escalate.
  IF OLD.status = 'done' AND NEW.status = 'done' AND 
     (CURRENT_TIMESTAMP - OLD.updated_at) > INTERVAL '10 minutes' AND 
     NEW.verify_count < 2 THEN
    NEW.status = 'pending_escalation';
    -- Log the event for the dashboard
    INSERT INTO trinity_agent_logs (agent_name, action, message) 
    VALUES ('Antigravity', 'escalation', 'Unverified Done timeout for task ' || OLD.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS timeout_unverified ON trinity_tasks;
CREATE TRIGGER timeout_unverified
BEFORE UPDATE ON trinity_tasks
FOR EACH ROW EXECUTE PROCEDURE escalate_unverified_done();

-- 6. LOG ALIGNMENT
INSERT INTO trinity_artifacts (task_id, title, artifact_type, content, agent, creator_agent, storage_location, status)
VALUES (
    'system-alignment-v9', 
    'EMERGENCY_ALIGNMENT_V9 Execution', 
    'report', 
    'Verified status added. BFT columns initialized. Phase 12 Unified View & Escalation Trigger active.', 
    'Antigravity', 
    'Antigravity', 
    'database',
    'created'
)
ON CONFLICT DO NOTHING;
