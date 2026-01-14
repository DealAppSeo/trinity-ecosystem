-- Enhance trinity_artifacts to match Antigravity Schema
DO $$
BEGIN
    -- 1. Access Level (Already planned, ensuring existence)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_artifacts' AND column_name = 'access_level') THEN
        ALTER TABLE trinity_artifacts ADD COLUMN access_level TEXT DEFAULT 'protected';
    END IF;

    -- 2. View Count
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_artifacts' AND column_name = 'view_count') THEN
        ALTER TABLE trinity_artifacts ADD COLUMN view_count INT DEFAULT 0;
    END IF;

    -- 3. File Hash (for HyperDAG/Integrity)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_artifacts' AND column_name = 'file_hash') THEN
        ALTER TABLE trinity_artifacts ADD COLUMN file_hash TEXT;
    END IF;
    
    -- 4. Creator Agent (Ensure we can track who made it)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_artifacts' AND column_name = 'creator_agent') THEN
        ALTER TABLE trinity_artifacts ADD COLUMN creator_agent TEXT;
    END IF;
END $$;

-- Create permissions table (trinity_access_requests handles the 'details' part, this handles the ACL)
-- We will use `trinity_access_requests` as the "Permissions" table for now to keep it simple, 
-- but lets create a dedicated `trinity_artifact_permissions` if we want granular control later.
-- For now, reusing the requests table is efficient for the "Register -> View List" flow.
-- The "Password" flow is currently global/admin hardcoded in the UI prototype, but we can store a hash later.
