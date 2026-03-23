-- Trinity Symphony - Loop 4 (pgvector setup)
-- personal_truth_facts embedding setup for GraphRAG operations

CREATE EXTENSION IF NOT EXISTS vector;

-- Ensure the embedding column exists for similarity search
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='personal_truth_facts' AND column_name='embedding'
    ) THEN
        ALTER TABLE personal_truth_facts ADD COLUMN embedding vector(1536);
    END IF;
END $$;

-- Create an HNSW index for rapid graph retrieval via L2 distance or cosine
CREATE INDEX IF NOT EXISTS idx_personal_truth_embedding 
ON personal_truth_facts USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
