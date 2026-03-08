-- Create dag_nodes if missing
CREATE TABLE IF NOT EXISTS public.dag_nodes (
    id TEXT PRIMARY KEY, -- multihash or UUID
    content_hash TEXT,
    embedding vector(1536),
    agent_owner TEXT,
    sprint_id BIGINT,
    node_type TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure index for fast retrieval
CREATE INDEX IF NOT EXISTS idx_dag_nodes_content_hash ON public.dag_nodes(content_hash);
