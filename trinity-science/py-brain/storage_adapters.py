import os
import asyncio
from typing import List, Dict, Any, Optional
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv(dotenv_path="c:/Users/Cash4/OneDrive/Desktop/trinity-ecosystem/trinity-ecosystem/.env.local")

class SupabaseGraphStorage:
    """
    Custom LightRAG Graph Storage for Supabase.
    Targets 'dag_nodes' and 'dag_edges' for unified architectural integrity.
    """
    
    def __init__(self, agent_owner: str = "trinity-hdm"):
        url: str = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        self.supabase: Client = create_client(url, key)
        self.agent_owner = agent_owner

    async def upsert_node(self, node_id: str, metadata: Dict[str, Any]):
        """Upsert a node into dag_nodes."""
        # Map LightRAG metadata to our table structure
        node_data = {
            "id": node_id,
            "agent_owner": self.agent_owner,
            "node_type": metadata.get("entity_type", "unknown"),
            "content_hash": metadata.get("content_hash", None)
        }
        try:
            self.supabase.table("dag_nodes").upsert(node_data).execute()
        except Exception as e:
            print(f"ERROR: Supabase Graph upsert_node: {e}")

    async def upsert_edge(self, source_id: str, target_id: str, metadata: Dict[str, Any]):
        """Upsert an edge into dag_edges."""
        edge_data = {
            "source_node": source_id,
            "target_node": target_id,
            "edge_type": metadata.get("relation_type", "relates_to"),
            "weight": metadata.get("weight", 1.0),
            "agent_owner": self.agent_owner
        }
        try:
            self.supabase.table("dag_edges").upsert(edge_data).execute()
        except Exception as e:
            print(f"ERROR: Supabase Graph upsert_edge: {e}")

    async def get_node(self, node_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a node from dag_nodes."""
        try:
            response = self.supabase.table("dag_nodes").select("*").eq("id", node_id).single().execute()
            return response.data
        except Exception:
            return None

    async def get_edge(self, source_id: str, target_id: str) -> Optional[Dict[str, Any]]:
        """Fetch an edge from dag_edges."""
        try:
            response = self.supabase.table("dag_edges") \
                .select("*") \
                .eq("source_node", source_id) \
                .eq("target_node", target_id) \
                .single().execute()
            return response.data
        except Exception:
            return None

    # Implement additional methods as required by LightRAG GraphStorage interface
    # (e.g., query_graph, get_all_nodes, etc.)
    async def get_all_nodes(self) -> List[str]:
        response = self.supabase.table("dag_nodes").select("id").execute()
        return [r['id'] for r in response.data]

    async def get_all_edges(self) -> List[Dict[str, str]]:
        response = self.supabase.table("dag_edges").select("source_node, target_node").execute()
        return [{"src": r['source_node'], "dst": r['target_node']} for r in response.data]
