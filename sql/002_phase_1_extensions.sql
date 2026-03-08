-- Phase 1 Foundation Extensions: Telemetry & ANFIS Tuning

-- 1. ANFIS Membership Function Parameters
CREATE TABLE IF NOT EXISTS public.anfis_params (
    id BIGSERIAL PRIMARY KEY,
    param_name TEXT UNIQUE,
    value FLOAT,
    tuned_at TIMESTAMPTZ DEFAULT NOW(),
    routing_accuracy FLOAT,
    training_samples INT
);

-- 2. DB Tier Latency (eBPF/App Telemetry Feed)
CREATE TABLE IF NOT EXISTS public.db_tier_latency (
    id BIGSERIAL PRIMARY KEY,
    tier TEXT, -- 'hot', 'warm', 'cold'
    p50_ms INT,
    p95_ms INT,
    p99_ms INT,
    measured_at TIMESTAMPTZ DEFAULT NOW(),
    source TEXT -- 'ebpf', 'app'
);
CREATE INDEX IF NOT EXISTS idx_db_tier_latency_tier_time ON public.db_tier_latency(tier, measured_at DESC);

-- 3. DB Routing Decisions (ANFIS logs)
CREATE TABLE IF NOT EXISTS public.db_routing_decisions (
    id BIGSERIAL PRIMARY KEY,
    query_type TEXT,
    tier_selected TEXT,
    confidence FLOAT,
    latency_budget_ms INT,
    agent_id TEXT,
    decided_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_db_routing_decisions_time ON public.db_routing_decisions(decided_at DESC);

-- 4. Supabase Schema Baseline (VERITAS Drift Ground Truth)
CREATE TABLE IF NOT EXISTS public.supabase_schema_baseline (
    id BIGSERIAL PRIMARY KEY,
    table_name TEXT,
    column_name TEXT,
    data_type TEXT,
    captured_at TIMESTAMPTZ DEFAULT NOW(),
    schema_hash TEXT,
    UNIQUE(table_name, column_name)
);

-- Seed initial ANFIS parameters if empty
INSERT INTO public.anfis_params (param_name, value)
VALUES 
    ('latency_threshold_hot', 5.0),
    ('latency_threshold_warm', 100.0),
    ('confidence_threshold_min', 0.85)
ON CONFLICT (param_name) DO NOTHING;
