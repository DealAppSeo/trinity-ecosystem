-- Phase 1 Foundation: agent_artifacts, retrieval_logs, agent_task_plans, hitl_settings, Semantic DAG

-- 0. CREATING EXEC_SQL UTILITY (Essential for Agentic SQL operations)
DROP FUNCTION IF EXISTS public.exec_sql(text);

CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE query;
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 1. Agent Artifacts (Merkle DAG Nodes)
CREATE TABLE IF NOT EXISTS public.agent_artifacts (
    id BIGSERIAL PRIMARY KEY,
    agent_id TEXT NOT NULL,
    sprint_id BIGINT,
    artifact_type TEXT, -- 'code', 'research', 'doc', 'decision'
    content TEXT,
    content_hash TEXT, -- multihash sha2-256
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_content_hash ON public.agent_artifacts(content_hash);
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_agent_sprint ON public.agent_artifacts(agent_id, sprint_id);

-- 2. Retrieval Logs (ANFIS Observability)
CREATE TABLE IF NOT EXISTS public.retrieval_logs (
    id BIGSERIAL PRIMARY KEY,
    artifact_id BIGINT REFERENCES public.agent_artifacts(id),
    query_text TEXT,
    tier_used SMALLINT,  -- 1: Edge, 2: Supabase, 3: Full DAG
    nodes_traversed JSONB,  -- [{node_id, node_type, edge_label}]
    latency_ms INT,
    cost_units DECIMAL(10,6),
    anfis_scores JSONB, -- {tier1: 0.9, tier2: 0.1, ...}
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Agent Task Plans (MLAgentBench 'Plan' step)
CREATE TABLE IF NOT EXISTS public.agent_task_plans (
    id BIGSERIAL PRIMARY KEY,
    agent_id TEXT,
    task_id BIGINT,
    plan_json JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. HITL Settings (Mobile Dash Prioritization)
CREATE TABLE IF NOT EXISTS public.hitl_settings (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT,
    slider_value TEXT,
    settings JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Semantic DAG: Edges
CREATE TABLE IF NOT EXISTS public.dag_edges (
    id BIGSERIAL PRIMARY KEY,
    source_hash TEXT,
    target_hash TEXT,
    edge_label TEXT,
    weight FLOAT DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source_hash, target_hash, edge_label)
);

-- 6. Normalize Agent Registry for 12-Agent Squad
INSERT INTO public.trinity_agent_registry (agent_name, status)
VALUES 
    ('trinity-orch', 'active'), ('trinity-torch', 'active'), ('trinity-veritas', 'active'),
    ('trinity-hdm', 'active'), ('trinity-mel', 'active'), ('trinity-gcm', 'active'),
    ('trinity-apm', 'active'), ('trinity-w3c', 'active'), ('trinity-chesed', 'active'),
    ('trinity-sophia', 'active'), ('trinity-nexus', 'active'), ('trinity-shofet', 'active')
ON CONFLICT (agent_name) DO UPDATE SET status = 'active';
