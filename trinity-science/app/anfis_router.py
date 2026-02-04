
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import numpy as np
import skfuzzy as fuzz
from skfuzzy import control as ctrl
from prometheus_client import Counter, Gauge

from supabase import create_client, Client

router = APIRouter()

import os

# Initialize Supabase
url = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
key = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_ANON_KEY")

if not url or not key:
    # Temporary fallback for immediate restoration during deployment transition
    url = "https://qnnpjhlxljtqyigedwkb.supabase.co"
    key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw"
    print("⚠️ [ANFIS] Missing environment variables. Using hardcoded fallback.")

try:
    supabase: Client = create_client(url, key)
except Exception as e:
    print(f"❌ [ANFIS] Supabase initialization failed: {e}")
    supabase = None

# ==========================================
# PROMETHEUS METRICS (Visibility)
# ==========================================
ANFIS_REWARDS_CALCULATED = Counter('anfis_rewards_total', 'Total rewards calculated', ['agent_id'])
ANFIS_SUGGESTIONS = Counter('anfis_suggestions_total', 'ANFIS prompt suggestions', ['agent_id'])
ANFIS_Adoption = Gauge('anfis_suggestion_confidence', 'Latest suggestion confidence', ['agent_id'])
ANFIS_REWARDS = Counter('anfis_governance_actions', 'Governance actions taken', ['agent_id', 'outcome'])

# ==========================================
# FUZZY LOGIC CONTROLLER (The Brain)
# ==========================================
# Antecedents (Inputs)
truth_score = ctrl.Antecedent(np.arange(0, 1.1, 0.1), 'truth_score')
task_complexity = ctrl.Antecedent(np.arange(0, 11, 1), 'task_complexity')

# Consequents (Outputs)
reward = ctrl.Consequent(np.arange(-10, 11, 1), 'reward')

# Membership Functions (Intuition)
truth_score.automf(3, names=['low', 'medium', 'high'])
task_complexity.automf(3, names=['simple', 'moderate', 'complex'])
reward.automf(3, names=['punish', 'neutral', 'reward'])

# Fuzzy Rules (Wisdom)
# 1. High Truth => Reward
rule1 = ctrl.Rule(truth_score['high'], reward['reward'])
# 2. Low Truth => Punish
rule2 = ctrl.Rule(truth_score['low'], reward['punish'])
# 3. Complex Task + Medium Truth => Neutral (Forgiving of hardness)
rule3 = ctrl.Rule(task_complexity['complex'] & truth_score['medium'], reward['neutral'])

# Control System
anfis_ctrl = ctrl.ControlSystem([rule1, rule2, rule3])
anfis_sim = ctrl.ControlSystemSimulation(anfis_ctrl)

# ==========================================
# MODELS
# ==========================================
class RewardInput(BaseModel):
    agent_id: str
    truth_score: float  # 0.0 to 1.0 (from RepID/Verification)
    task_complexity: int = 5 # 1 to 10

class SuggestionInput(BaseModel):
    agent_id: str
    current_prompt: str
    recent_rewards: list[float]

class SuggestionOutput(BaseModel):
    agent_id: str
    suggested_prompt: str | None
    confidence: float

class ApproveInput(BaseModel):
    agent_id: str

# ==========================================
# ENDPOINTS
# ==========================================

@router.post("/reward")
async def calculate_reward(data: RewardInput):
    try:
        # Input Fuzzification
        anfis_sim.input['truth_score'] = data.truth_score
        anfis_sim.input['task_complexity'] = data.task_complexity
        
        # Inference
        anfis_sim.compute()
        
        # Defuzzification
        final_reward = anfis_sim.output['reward']
        
        # Metrics
        ANFIS_REWARDS_CALCULATED.labels(agent_id=data.agent_id).inc()
        
        return {
            "agent_id": data.agent_id,
            "reward": final_reward,
            "status": "success"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/suggest", response_model=SuggestionOutput)
async def suggest_directive(data: SuggestionInput):
    """
    Analyzes performance and suggests a new directive (prompt).
    This is the self-reflection loop.
    """
    try:
        avg_reward = sum(data.recent_rewards) / len(data.recent_rewards)
        
        # Stub logic for now - Real logic would use LLM or Genetic Algo here
        new_prompt = None
        confidence = 0.0
        
        if avg_reward < 0:
            new_prompt = data.current_prompt + "\n[ANFIS CORRECTION]: Prioritize accuracy over speed. Double-check facts."
            confidence = 0.85
        elif avg_reward > 8:
            new_prompt = data.current_prompt + "\n[ANFIS OPTIMIZATION]: You are performing well. Attempt to be more concise."
            confidence = 0.70
            
        # Metrics
        if new_prompt:
            ANFIS_SUGGESTIONS.labels(agent_id=data.agent_id).inc()
            ANFIS_Adoption.labels(agent_id=data.agent_id).set(confidence)
            
        return SuggestionOutput(
            agent_id=data.agent_id,
            suggested_prompt=new_prompt,
            confidence=confidence
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/approve")
async def approve_suggestion(data: ApproveInput):
    """
    Approves the pending suggestion for an agent.
    Updates system_prompt and clears suggestion fields.
    """
    print(f"⚖️ ANFIS Brain: Approving suggestion for {data.agent_id}")
    
    # 1. Fetch current suggestion first (optional, but good for validation)
    # For now, just trust the update logic
    
    # 2. Update DB
    try:
        # We need to get the 'suggested_prompt' to move it to 'system_prompt'.
        # Or we can do it in two steps.
        response = supabase.table("trinity_agent_registry").select("suggested_prompt").eq("agent_name", data.agent_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Agent not found")
            
        suggestion = response.data[0].get("suggested_prompt")
        
        if not suggestion:
            raise HTTPException(status_code=400, detail="No pending suggestion to approve")

        # Update
        update_data = {
            "system_prompt": suggestion,
            "directive_source": "human",
            "suggested_prompt": None,
            "suggestion_accepted": True
            # Timestamp handles itself or we can set it
        }
        
        supabase.table("trinity_agent_registry").update(update_data).eq("agent_name", data.agent_id).execute()
        
        # Log metric
        ANFIS_REWARDS.labels(agent_id=data.agent_id, outcome="approved").inc()

        return {"status": "success", "message": f"Approved suggestion for {data.agent_id}"}
    
    except Exception as e:
        print(f"❌ DB Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/reject")
async def reject_suggestion(data: ApproveInput):
    """
    Rejects the pending suggestion.
    """
    print(f"⚖️ ANFIS Brain: Rejecting suggestion for {data.agent_id}")
    try:
        update_data = {
            "suggested_prompt": None,
            "suggestion_accepted": False
        }
        supabase.table("trinity_agent_registry").update(update_data).eq("agent_name", data.agent_id).execute()
        return {"status": "success", "message": f"Rejected suggestion for {data.agent_id}"}
    except Exception as e:
        print(f"❌ DB Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
