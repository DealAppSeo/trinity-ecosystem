import os
import asyncio
from db_router import DBTierSelector
from supabase import create_client, Client
from dotenv import load_dotenv

# Load env
load_dotenv(dotenv_path="c:/Users/Cash4/OneDrive/Desktop/trinity-ecosystem/trinity-ecosystem/.env.local")

async def run_proof():
    router = DBTierSelector()
    
    print("--- SCENARIO 1: Personal User (Low Sensitivity, High Stewardship) ---")
    # stewardship_weight = 1.0 - 0.2 = 0.8 (> 0.7) -> Winning Bid should be NODE
    tier1, conf1 = await router.select_tier(
        query_type="casual_chat", 
        agent_id="test-agent-personal", 
        latency_budget_ms=500, 
        sensitivity=0.2
    )
    print(f"Result 1: Tier {tier1} (Conf: {conf1})\n")

    print("--- SCENARIO 2: Corporate User (High Sensitivity, ACID requirement) ---")
    # sensitivity = 0.9 (> 0.8) -> Winning Bid should be CLOUD
    tier2, conf2 = await router.select_tier(
        query_type="governance_tx", 
        agent_id="test-agent-corporate", 
        latency_budget_ms=50, 
        sensitivity=0.9
    )
    print(f"Result 2: Tier {tier2} (Conf: {conf2})\n")

    print("--- VERIFYING SUPABASE PROOF ---")
    url: str = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    supabase: Client = create_client(url, key)
    
    # Query latest bids
    response = supabase.table("compute_bids").select("*").order("decided_at", desc=True).limit(8).execute()
    
    # Filter for winners only for clarity
    winners = [b for b in response.data if b['is_winner']]
    
    print(f"Found {len(winners)} winning bid logs in Supabase:")
    for w in winners:
        print(f"Agent: {w['agent_id']} | Type: {w['bid_type']} | Provider: {w['provider']} | Winner: {w['is_winner']}")

if __name__ == "__main__":
    asyncio.run(run_proof())
