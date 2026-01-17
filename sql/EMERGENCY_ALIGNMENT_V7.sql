-- EMERGENCY ALIGNMENT V7: Artifact & Registry Finalization
-- Ensures trinity_artifacts and trinity_agent_registry are aligned with the v8.1.3 "Holy Grail" core.

-- 1. TRINITY_ARTIFACTS: Full alignment with ConstitutionalAgent.ts
DO $$
BEGIN
    -- Core Columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_artifacts' AND column_name = 'task_id') THEN
        ALTER TABLE public.trinity_artifacts ADD COLUMN task_id TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_artifacts' AND column_name = 'title') THEN
        ALTER TABLE public.trinity_artifacts ADD COLUMN title TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_artifacts' AND column_name = 'content') THEN
        ALTER TABLE public.trinity_artifacts ADD COLUMN content TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_artifacts' AND column_name = 'artifact_type') THEN
        ALTER TABLE public.trinity_artifacts ADD COLUMN artifact_type TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_artifacts' AND column_name = 'file_path') THEN
        ALTER TABLE public.trinity_artifacts ADD COLUMN file_path TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_artifacts' AND column_name = 'url') THEN
        ALTER TABLE public.trinity_artifacts ADD COLUMN url TEXT;
    END IF;
    
    -- Metadata & Governance
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_artifacts' AND column_name = 'access_level') THEN
        ALTER TABLE public.trinity_artifacts ADD COLUMN access_level TEXT DEFAULT 'protected';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_artifacts' AND column_name = 'view_count') THEN
        ALTER TABLE public.trinity_artifacts ADD COLUMN view_count INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_artifacts' AND column_name = 'file_hash') THEN
        ALTER TABLE public.trinity_artifacts ADD COLUMN file_hash TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_artifacts' AND column_name = 'creator_agent') THEN
        ALTER TABLE public.trinity_artifacts ADD COLUMN creator_agent TEXT;
    END IF;

    -- Legacy Compatibility (Mapping V4 names to V5 names if they exist)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_artifacts' AND column_name = 'content_preview') AND 
       NOT EXISTS (SELECT 1 FROM public.trinity_artifacts WHERE content IS NOT NULL) THEN
        UPDATE public.trinity_artifacts SET content = content_preview WHERE content IS NULL;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_artifacts' AND column_name = 'agent') AND 
       NOT EXISTS (SELECT 1 FROM public.trinity_artifacts WHERE creator_agent IS NOT NULL) THEN
        UPDATE public.trinity_artifacts SET creator_agent = agent WHERE creator_agent IS NULL;
    END IF;
END $$;

-- 2. TRINITY_AGENT_REGISTRY: Add soulbound_token_hash and belief_score if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_agent_registry' AND column_name = 'soulbound_token_hash') THEN
        ALTER TABLE public.trinity_agent_registry ADD COLUMN soulbound_token_hash TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_agent_registry' AND column_name = 'belief_score') THEN
        ALTER TABLE public.trinity_agent_registry ADD COLUMN belief_score NUMERIC DEFAULT 10;
    END IF;
END $$;

-- 3. TRINITY_TASKS: Ensure Subjective Logic columns
DO $$
BEGIN
     IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_tasks' AND column_name = 'belief') THEN
        ALTER TABLE public.trinity_tasks ADD COLUMN belief NUMERIC DEFAULT 0.0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_tasks' AND column_name = 'disbelief') THEN
        ALTER TABLE public.trinity_tasks ADD COLUMN disbelief NUMERIC DEFAULT 0.0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_tasks' AND column_name = 'uncertainty') THEN
        ALTER TABLE public.trinity_tasks ADD COLUMN uncertainty NUMERIC DEFAULT 1.0;
    END IF;
END $$;
