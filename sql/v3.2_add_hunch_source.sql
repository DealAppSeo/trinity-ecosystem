-- v3.2 Schema update: hitl_hunch_log
-- Adding decision_source to distinguish between ATS and ALPHA trade hunches.

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'hitl_hunch_log' 
                   AND column_name = 'decision_source') THEN
        ALTER TABLE hitl_hunch_log ADD COLUMN decision_source text DEFAULT 'ATS';
    END IF;
END $$;

COMMENT ON COLUMN hitl_hunch_log.decision_source IS 'Origin of the trade hunch: ATS (Symphony-prompted) or ALPHA (Sean-initiated)';
