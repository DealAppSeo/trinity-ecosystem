-- VERITAS ALIGNMENT V10
-- 1. Auto-Cast Trigger for Artifacts (Antifragility)
CREATE OR REPLACE FUNCTION public.auto_cast_artifacts()
RETURNS TRIGGER AS $$
BEGIN
    -- Ensure task_id is always TEXT to bridge BIGINT/UUID/TEXT legacy calls
    NEW.task_id := NEW.task_id::TEXT;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_cast_artifacts ON public.trinity_artifacts;
CREATE TRIGGER trigger_auto_cast_artifacts
BEFORE INSERT OR UPDATE ON public.trinity_artifacts
FOR EACH ROW EXECUTE PROCEDURE public.auto_cast_artifacts();

-- 2. Subjective Logic BFT Columns for Tasks
ALTER TABLE public.trinity_tasks 
ADD COLUMN IF NOT EXISTS requires_consensus BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS signatures JSONB DEFAULT '[]'::JSONB,
ADD COLUMN IF NOT EXISTS belief NUMERIC DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS disbelief NUMERIC DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS uncertainty NUMERIC DEFAULT 1.0;

-- 3. BFT Multiplicative Aggregation Function
CREATE OR REPLACE FUNCTION public.bft_aggregate_tasks()
RETURNS TRIGGER AS $$
DECLARE
    phi CONSTANT NUMERIC := 1.618;  -- Golden Ratio
    agg_belief NUMERIC := 1.0;
    sig JSONB;
BEGIN
    IF NEW.requires_consensus AND jsonb_array_length(NEW.signatures) > 0 THEN
        -- Multiplicative Aggregation (Geomertric Mean approach)
        FOR sig IN SELECT * FROM jsonb_array_elements(NEW.signatures) LOOP
            agg_belief := agg_belief * POWER((sig->>'rep_weight')::NUMERIC, 1 / phi);
        END LOOP;
        
        NEW.belief := GREATEST(0, LEAST(1, agg_belief / jsonb_array_length(NEW.signatures)));
        NEW.disbelief := GREATEST(0.1 * (3 - jsonb_array_length(NEW.signatures)), 0); 
        NEW.uncertainty := 1 - NEW.belief - NEW.disbelief;
        
        -- Auto-Finalize if belief > 0.6 and at least 2 signatures
        IF NEW.belief > 0.6 AND jsonb_array_length(NEW.signatures) >= 2 THEN
            NEW.status := 'completed';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_bft_aggregate ON public.trinity_tasks;
CREATE TRIGGER trigger_bft_aggregate
BEFORE UPDATE ON public.trinity_tasks
FOR EACH ROW EXECUTE PROCEDURE public.bft_aggregate_tasks();
