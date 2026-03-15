-- Enable the pgvector extension to work with embedding vectors
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the semantic_cache table
CREATE TABLE IF NOT EXISTS semantic_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  query_embedding vector(1536),
  query_text text,
  response_text text,
  provider_used text,
  tokens_saved integer,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '24 hours'
);

-- Create an IVFFlat index for fast cosine similarity searches
CREATE INDEX IF NOT EXISTS semantic_cache_embedding_idx 
ON semantic_cache 
USING ivfflat (query_embedding vector_cosine_ops);

-- Create a Supabase RPC function for cosine similarity matching
-- This is necessary because the Supabase JS client cannot natively query vector operations easily without RPC
CREATE OR REPLACE FUNCTION match_semantic_cache (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  query_text text,
  response_text text,
  provider_used text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    semantic_cache.id,
    semantic_cache.query_text,
    semantic_cache.response_text,
    semantic_cache.provider_used,
    1 - (semantic_cache.query_embedding <=> match_semantic_cache.query_embedding) AS similarity
  FROM semantic_cache
  WHERE 1 - (semantic_cache.query_embedding <=> match_semantic_cache.query_embedding) > match_threshold
    AND semantic_cache.expires_at > now()
  ORDER BY semantic_cache.query_embedding <=> match_semantic_cache.query_embedding
  LIMIT match_count;
END;
$$;
