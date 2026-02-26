-- Migration: 09_domain_priors.sql
-- Purpose: Support dynamic u-thresholds, virtue weights, and FrugalGPT cost attribution.

-- 1. Create Domain Priors Table
CREATE TABLE IF NOT EXISTS public.trinity_domain_priors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain TEXT UNIQUE NOT NULL, -- e.g., 'medical', 'legal', 'creative', 'code'
    u_threshold FLOAT DEFAULT 0.25, -- The 'uncertainty' gate for this domain
    weight_multiplier FLOAT DEFAULT 1.0, -- Multiplier for RepID/WSCE updates
    virtue_weights JSONB DEFAULT '{
        "logical_fallacy": 1.0, 
        "missing_counterexample": 1.0, 
        "false_dichotomy": 1.0, 
        "anchoring": 1.0, 
        "domain_boundary": 1.0, 
        "temporal_staleness": 1.0, 
        "shared_training_bias": 1.0,
        "emergent": 1.0
    }'::jsonb,
    last_updated TIMESTAMPTZ DEFAULT now(),
    updated_by_repid BOOLEAN DEFAULT false
);

-- 2. Enhance Agent Registry for 3-Tier RepID (Additive)
ALTER TABLE public.trinity_agent_registry 
ADD COLUMN IF NOT EXISTS contrarian_value_score FLOAT DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS last_judas_activations INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS calibration_score_wsce FLOAT DEFAULT 1.0;

-- 3. Enhance Cost Logs for FrugalGPT Attribution
-- Note: trinity_cost_logs might already exist, adding column safely
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename  = 'trinity_cost_logs') THEN
        ALTER TABLE public.trinity_cost_logs ADD COLUMN IF NOT EXISTS savings_attribution JSONB;
    ELSE
        CREATE TABLE public.trinity_cost_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            agent_name TEXT,
            task_id BIGINT,
            provider TEXT,
            model TEXT,
            prompt_tokens INTEGER,
            completion_tokens INTEGER,
            actual_cost_usd NUMERIC,
            savings_attribution JSONB,
            created_at TIMESTAMPTZ DEFAULT now()
        );
    END IF;
END $$;

-- 4. Initial Seed Data for Domain Priors
INSERT INTO public.trinity_domain_priors (domain, u_threshold, weight_multiplier, virtue_weights)
VALUES 
('medical', 0.15, 2.0, '{"temporal_staleness": 2.0, "domain_boundary": 2.0, "shared_training_bias": 1.5}'),
('legal', 0.20, 1.8, '{"logical_fallacy": 2.0, "missing_counterexample": 2.0, "domain_boundary": 1.5}'),
('creative', 0.45, 0.5, '{"emergent": 1.2, "temporal_staleness": 0.3}'),
('code', 0.25, 1.2, '{"logical_fallacy": 1.5, "missing_counterexample": 1.5}')
ON CONFLICT (domain) DO UPDATE SET 
    u_threshold = EXCLUDED.u_threshold,
    weight_multiplier = EXCLUDED.weight_multiplier,
    virtue_weights = EXCLUDED.virtue_weights;
