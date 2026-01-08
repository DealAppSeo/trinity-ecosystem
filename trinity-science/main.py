from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Literal, Optional
import os
import logging

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("trinity-science")

app = FastAPI(
    title="Trinity Science Division",
    description="Python Microservice for GNN and ANFIS operations",
    version="0.1.0"
)

# --- Data Models (Mirroring openapi.json) ---

class AnfisInput(BaseModel):
    latency_ms: float
    user_reputation: float
    task_complexity: float
    user_preference_accuracy: float = 0.5
    timeout_ms: int = 5000

class AnfisOutput(BaseModel):
    should_query_user: bool
    interaction_type: Literal['none', 'shallow_check', 'deep_clarification', 'email_notification', 'sms_notification']
    score: float
    reason: str

class GnnInput(BaseModel):
    task_embedding: List[float]
    candidate_node_ids: List[str]

class GnnOutput(BaseModel):
    ranked_ids: List[str]
    scores: List[float]

# --- Endpoints ---

@app.get("/")
async def root():
    return {"status": "online", "system": "Trinity Science Division"}

@app.post("/anfis/decide", response_model=AnfisOutput)
async def decide_anfis(data: AnfisInput):
    logger.info(f"Received ANFIS request: {data}")
    
    # PHASE 2 TODO: Load real Logic/Model here
    # For now, implementing the "Simulation" logic in Python as placeholder
    # while we wait for scikit-fuzzy implementation in next step.
    
    # "Latency as Opportunity" Heuristic
    # If latency is high but User Preference for Accuracy is strictly high -> Interaction Opportunity
    
    latency = input_data.latency_ms
    rep = input_data.user_reputation
    complexity = input_data.task_complexity
    
    # 1. Heuristic: Latency Rule
    # If latency is high (>1000ms), we MUST engage to maintain flow.
    # If user is Trustworthy (Rep > 80), we can ask Deep questions.
    
    interaction = "none"
    depth = "none"
    score = 0.5
    
    if latency > 2000:
        # High Latency Opportunity
        score = 0.9
        if rep > 70:
            interaction = "email_notification" # Async
            depth = "deep"
        else:
            interaction = "deep_clarification" # Synchronous chat
            depth = "shallow"
    elif latency > 500:
        # Medium Latency
        score = 0.7
        interaction = "shallow_check"
        depth = "shallow"
    
    # 2. Heuristic: Complexity Rule
    if complexity > 0.8 and interaction == "none":
        interaction = "deep_clarification"
        score = 0.8
        depth = "deep"

    return AnfisOutput(
        should_query_user=(interaction != "none"),
        interaction_type=interaction,
        query_depth=depth,
        score=score,
        reason=f"Latency {latency}ms triggered {interaction}."
    )

from rewards import reward_system

@app.post("/anfis/reward", response_model=RewardOutput)
async def calculate_reward(input_data: RewardInput):
    """
    Calculate reward using the Adaptive Reward System (scikit-fuzzy).
    """
    logger.info(f"Received ANFIS reward request: {input_data}")
    # 1. Base Values (hardcoded for MVP, usually from DB)
    base_values = {
        "REFERRAL": 10.0,
        "STAKE": 50.0,
        "COMPUTE": 5.0,
        "FEEDBACK": 2.0
    }
    base = base_values.get(input_data.action_type.upper(), 1.0)
    
    # 2. Calculate Multiplier using Fuzzy Logic
    # Apply 'God Mode' config weights if needed (simple scaling for MVP)
    weighted_need = input_data.network_need * current_config.network_need_weight
    
    multiplier = reward_system.calculate(
        weighted_need, 
        input_data.saturation, 
        input_data.diversity_score
    )
    
    # 3. Final Calculation
    final = base * multiplier
    
    reason = (
        f"Base {base} * Multiplier {multiplier:.2f} "
        f"(Need={weighted_need:.1f}, Sat={input_data.saturation:.1f}, Div={input_data.diversity_score:.1f})"
    )
    
    return RewardOutput(
        base_value=base,
        multiplier=multiplier,
        final_amount=final,
        reason=reason
    )

@app.post("/anfis/config")
async def update_config(config: RewardConfig):
    """
    Update the Reward Configuration (Governance/Controller).
    """
    global current_config
    current_config = config
    logger.info(f"Updated Reward Config: {current_config}")
    return {"status": "updated", "config": current_config}

from arbitrage import arbitrage_engine, BidRequest as PyBidRequest

class MarketBidRequest(BaseModel):
    task_id: str
    required_gpu: bool
    required_ram_gb: int
    strategy: Literal["CHEAP", "FAST", "BALANCED"] = "BALANCED"
    secure_keys: Optional[Dict[str, str]] = None

class MarketBidOffer(BaseModel):
    provider_id: str
    price_usd_per_hour: float
    estimated_latency_ms: int
    confidence: float

class MarketBidResponse(BaseModel):
    winning_offer: MarketBidOffer
    all_offers: List[MarketBidOffer]
    reason: str

@app.post("/market/bid", response_model=MarketBidResponse)
async def get_market_bids(data: MarketBidRequest):
    """
    Get arbitrage bids for a compute task.
    """
    # Security: Redact keys from logs
    log_data = data.dict()
    if log_data.get('secure_keys'):
        log_data['secure_keys'] = '***REDACTED***'
    logger.info(f"Received Market Bid Request: {log_data}")
    
    # Adapt to Engine Request
    # In Phase 5+, we would pass data.secure_keys to the provider
    engine_req = PyBidRequest(
        task_id=data.task_id,
        required_gpu=data.required_gpu,
        required_ram_gb=data.required_ram_gb,
        strategy=data.strategy
    )
    
    # Get Offers
    offers = arbitrage_engine.get_offers(engine_req)
    winner = arbitrage_engine.select_winner(offers, data.strategy)
    
    # Form Response
    return MarketBidResponse(
        winning_offer=MarketBidOffer(**winner.dict()),
        all_offers=[MarketBidOffer(**o.dict()) for o in offers],
        reason=f"Selected {winner.provider_id} based on {data.strategy} strategy."
    )

@app.post("/gnn/rank", response_model=GnnOutput)
async def rank_gnn(data: GnnInput):
    logger.info(f"Received GNN rank request for {len(data.candidate_node_ids)} nodes")
    
    # PHASE 2 TODO: Load PyTorch Geometric Model
    # Stub: Return in original order with dummy scores
    
    return GnnOutput(
        ranked_ids=data.candidate_node_ids,
        scores=[0.9 - (i * 0.1) for i in range(len(data.candidate_node_ids))]
    )
