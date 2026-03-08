-- Match Nodes by Vector Similarity
CREATE OR REPLACE FUNCTION public.match_nodes (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id text,
  agent_owner text,
  node_type text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dag_nodes.id,
    dag_nodes.agent_owner,
    dag_nodes.node_type,
    1 - (dag_nodes.embedding <=> query_embedding) AS similarity
  FROM dag_nodes
  WHERE 1 - (dag_nodes.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- Match Nodes by Keyword Similarity (pg_trgm)
CREATE OR REPLACE FUNCTION public.match_nodes_keyword (
  query_text text,
  match_count int
)
RETURNS TABLE (
  id text,
  agent_owner text,
  node_type text,
  score float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dag_nodes.id,
    dag_nodes.agent_owner,
    dag_nodes.node_type,
    similarity(dag_nodes.id, query_text) AS score
  FROM dag_nodes
  WHERE dag_nodes.id % query_text
  ORDER BY score DESC
  LIMIT match_count;
END;
$$;
