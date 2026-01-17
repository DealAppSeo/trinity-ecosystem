-- 1. ENRICH AGENT IDENTITY (Soulbound Tokens)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_agent_registry' AND column_name = 'soulbound_token_hash') THEN
        ALTER TABLE public.trinity_agent_registry ADD COLUMN soulbound_token_hash TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_agent_registry' AND column_name = 'belief_score') THEN
        ALTER TABLE public.trinity_agent_registry ADD COLUMN belief_score NUMERIC DEFAULT 10;
    END IF;
END $$;

-- 2. SUBJECTIVE LOGIC & BFT ENRICHMENT (b+d+u=1)
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
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_tasks' AND column_name = 'signatures') THEN
        ALTER TABLE public.trinity_tasks ADD COLUMN signatures JSONB DEFAULT '[]'::JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trinity_tasks' AND column_name = 'zk_proof') THEN
        ALTER TABLE public.trinity_tasks ADD COLUMN zk_proof TEXT;
    END IF;
END $$;

-- Enforce Domain Integrity (Patent-Aligned)
ALTER TABLE public.trinity_tasks DROP CONSTRAINT IF EXISTS subjective_logic;
ALTER TABLE public.trinity_tasks ADD CONSTRAINT subjective_logic CHECK (ABS(belief + disbelief + uncertainty - 1.0) < 0.001);

-- 3. GNN PERFORMANCE INDEXING (Elite Composite Indexes)
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_consensus ON public.trinity_tasks(assigned_to, requires_consensus);
CREATE INDEX IF NOT EXISTS idx_tasks_consensus_group ON public.trinity_tasks(consensus_group);
CREATE INDEX IF NOT EXISTS idx_agent_registry_name ON public.trinity_agent_registry(agent_name);
CREATE INDEX IF NOT EXISTS idx_tasks_subjective_rank ON public.trinity_tasks(belief DESC) WHERE status = 'completed';

-- 4. ADAPTIVE BFT TRIGGER (Antifragile: Auto-finalize on 2/3 agreement)
CREATE OR REPLACE FUNCTION public.finalize_bft_task()
RETURNS TRIGGER AS $$
DECLARE
    valid_sigs_count INTEGER;
BEGIN
    IF NEW.requires_consensus AND NEW.status = 'completed' THEN
        -- Count valid signatures from consensus group
        SELECT count(*) INTO valid_sigs_count 
        FROM jsonb_array_elements(NEW.signatures) sig
        WHERE (sig->>'valid')::BOOLEAN = TRUE;

        -- 2/3 Threshold for a standard trinity triad (3 agents)
        IF valid_sigs_count >= 2 THEN
            -- Update subjective logic via multiplicative aggregation (φ weighting)
            NEW.belief := (OLD.belief * 1.618 + 0.618) / 2.236; 
            NEW.uncertainty := 1.0 - NEW.belief - NEW.disbelief;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bft_finalize ON public.trinity_tasks;
CREATE TRIGGER bft_finalize
BEFORE UPDATE ON public.trinity_tasks
FOR EACH ROW EXECUTE PROCEDURE public.finalize_bft_task();

-- 5. ATOMIC ALIGNMENT (Legacy Cleanup)
UPDATE public.trinity_tasks 
SET assigned_to = 'trinity-orch' 
WHERE assigned_to = 'MCP' OR assigned_to = 'orch';

-- 6. INITIALIZE SBT HASHES (Mock Proofs for Plonky3 zkSTARKs)
UPDATE public.trinity_agent_registry 
SET soulbound_token_hash = encode(sha256(agent_name::bytea), 'hex')
WHERE soulbound_token_hash IS NULL;
