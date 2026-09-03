import os
import asyncio
from typing import List, Dict, Any
from supabase import create_client, Client
from dotenv import load_dotenv
from storage_adapters import SupabaseGraphStorage

# Load environment variables
load_dotenv(dotenv_path="c:/Users/Cash4/OneDrive/Desktop/trinity-ecosystem/trinity-ecosystem/.env.local")

class HybridRetriever:
    """
    Trinity Hybrid RAG Engine.
    Fuses Semantic Search (pgvector), Keyword Search (pg_trgm), 
    and Graph Reasoning (LightRAG) over the Supabase Semantic DAG.
    """
    
    def __init__(self):
        url: str = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        self.supabase: Client = create_client(url, key)
        self.graph_storage = SupabaseGraphStorage()
        # Note: LightRAG initialization would go here if we were using its full pipeline.
        # For Phase 2 initialization, we implement the fusion logic directly.

    async def retrieve_semantic(self, query_embedding: List[float], limit: int = 5) -> List[Dict[str, Any]]:
        """Semantic search via pgvector."""
        try:
            # Note: Requires a match_nodes RPC in Supabase
            response = self.supabase.rpc("match_nodes", {
                "query_embedding": query_embedding,
                "match_threshold": 0.5,
                "match_count": limit
            }).execute()
            return response.data
        except Exception as e:
            print(f"WARN: Semantic retrieval failed: {e}")
            return []

    async def retrieve_keyword(self, query_text: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Sparse search via pg_trgm fuzzy matching."""
        try:
            # Simulating BM25/Fuzzy search using pg_trgm similarity
            # Requires a match_nodes_keyword RPC or raw SQL
            query = f"SELECT *, similarity(id, '{query_text}') as score FROM public.dag_nodes WHERE id % '{query_text}' ORDER BY score DESC LIMIT {limit}"
            response = self.supabase.rpc("exec_sql", {"query": query}).execute()
            return response.data
        except Exception as e:
            print(f"WARN: Keyword retrieval failed: {e}")
            return []

    async def retrieve_graph_hops(self, start_node_id: str, hops: int = 2) -> List[Dict[str, Any]]:
        """Multi-hop traversal via the Semantic DAG (Supabase)."""
        # Phase 2 Start: Basic BFS via dag_edges
        try:
            query = f"SELECT * FROM public.dag_edges WHERE source_node = '{start_node_id}'"
            response = self.supabase.rpc("exec_sql", {"query": query}).execute()
            return response.data
        except Exception as e:
            print(f"WARN: Graph retrieval failed: {e}")
            return []

    async def hybrid_query(self, query_text: str, query_embedding: List[float], limit: int = 5) -> Dict[str, Any]:
        """Fusion retrieval logic."""
        # 1. Run parallel retrieval
        semantic_results, keyword_results = await asyncio.gather(
            self.retrieve_semantic(query_embedding, limit),
            self.retrieve_keyword(query_text, limit)
        )
        
        # 2. RRF (Reciprocal Rank Fusion) or simple weighted merge
        fused_results = {}
        for i, res in enumerate(semantic_results):
            node_id = res['id']
            fused_results[node_id] = fused_results.get(node_id, 0) + (1.0 / (i + 60))
            
        for i, res in enumerate(keyword_results):
            node_id = res['id']
            fused_results[node_id] = fused_results.get(node_id, 0) + (1.0 / (i + 60))
            
        sorted_ids = sorted(fused_results.items(), key=lambda x: x[1], reverse=True)[:limit]
        
        # 3. Log retrieval event for ANFIS observability
        try:
            self.supabase.table("retrieval_logs").insert({
                "agent_id": "trinity-hdm",
                "tier_used": "warm",
                "latency_ms": 0, # Placeholder
                "nodes_traversed": len(semantic_results) + len(keyword_results),
                "query_hash": query_text[:50]
            }).execute()
        except Exception:
            pass
            
        return {"nodes": sorted_ids, "fused_score": sum(v for k,v in sorted_ids)}

if __name__ == "__main__":
    import numpy as np
    retriever = HybridRetriever()
    async def test():
        dummy_emb = [0.1] * 1536
        res = await retriever.hybrid_query("test query", dummy_emb)
        print(f"Hybrid Results: {res}")
    asyncio.run(test())
