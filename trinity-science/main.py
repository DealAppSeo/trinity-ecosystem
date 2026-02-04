from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Literal, Optional, Dict, Union
import os
import logging
import asyncio
from datetime import datetime
import structlog
from supabase import create_client, Client
import router as router_lib

# Configure Structlog
structlog.configure(
    processors=[
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)
logger = structlog.get_logger("trinity-science")

# --- HEARTBEAT LOGIC ---
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

async def run_heartbeat():
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.warning("Supabase credentials missing. Heartbeat disabled.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    service_name = "trinity-science"
    
    while True:
        try:
            now = datetime.utcnow().isoformat()
            # 1. Update Registry
            supabase.table("trinity_agent_registry").upsert({
                "agent_name": service_name,
                "status": "online",
                "last_active": now,
                "squad": "INFRA",
                "current_tier": "BRAIN",
                "current_task_summary": f"[SERVICE] Brain processing enabled. v0.1.0",
                "reputation_score": 100
            }).execute()

            # 2. Update Heartbeat
            supabase.table("trinity_heartbeat").upsert({
                "agent": service_name,
                "status": "active",
                "last_seen": now,
                "version": "8.1.5-System-Py"
            }).execute()
            
            # logger.info(f"Pulse sent for {service_name}")
        except Exception as e:
            logger.error(f"Heartbeat failed: {str(e)}")
        
        await asyncio.sleep(30)

from app.anfis_router import router as anfis_router

app = FastAPI(
    title="Trinity Science Division",
    description="Python Microservice for GNN and ANFIS operations",
    version="0.1.0"
)

# --- Data Models ---
class AnfisOutput(BaseModel):
    should_query_user: bool
    interaction_type: Literal['none', 'shallow_check', 'deep_clarification', 'email_notification', 'sms_notification']
    score: float
    reason: str

class RewardInput(BaseModel):
    action_type: Literal['REFERRAL', 'STAKE', 'COMPUTE', 'FEEDBACK']
    network_need: float
    saturation: float
    diversity_score: float

class RewardOutput(BaseModel):
    base_value: float
    multiplier: float
    final_amount: float
    reason: str

class RewardConfig(BaseModel):
    network_need_weight: float = 1.0
    saturation_weight: float = 1.0
    diversity_weight: float = 1.0

# Global Config
current_config = RewardConfig()

# Include router at top level
app.include_router(anfis_router, prefix="/anfis/v2", tags=["ANFIS v2"])

@app.on_event("startup")
async def startup_event():
    logger.info("Science Brain Starting Up...", version="0.1.0")
    
    # 1. Start Heartbeat
    asyncio.create_task(run_heartbeat())
    logger.info("Heartbeat task dispatched.")

    # 2. Instrument FastAPI with Arize Phoenix (Deferred)
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        FastAPIInstrumentor.instrument_app(app)
        logger.info("FastAPI instrumented with OpenTelemetry")
    except ImportError:
        logger.warning("FastAPI instrumentation skipped: opentelemetry-instrumentation-fastapi not installed")
    except Exception as e:
        logger.error(f"FastAPI instrumentation failed: {str(e)}")

    # 3. Mount Prometheus Metrics (Deferred)
    try:
        from prometheus_client import make_asgi_app
        metrics_app = make_asgi_app()
        app.mount("/metrics", metrics_app)
        logger.info("Metrics endpoint mounted at /metrics")
    except ImportError:
        logger.warning("prometheus_client not found. Metrics skipped.")
    except Exception as e:
        logger.error(f"Metrics mount failed: {str(e)}")

    logger.info("Science Brain Startup Sequence Complete.")

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

# --- Reward System Models ---

class RewardInput(BaseModel):
    action_type: Literal['REFERRAL', 'STAKE', 'COMPUTE', 'FEEDBACK']
    network_need: float
    saturation: float
    diversity_score: float

class RewardOutput(BaseModel):
    base_value: float
    multiplier: float
    final_amount: float
    reason: str

class RewardConfig(BaseModel):
    network_need_weight: float = 1.0
    saturation_weight: float = 1.0
    diversity_weight: float = 1.0

# Global Config Logic
current_config = RewardConfig()

# --- Endpoints ---

@app.get("/health")
@app.head("/health")
async def health():
    return {"status": "online", "agent": "trinity-science", "timestamp": datetime.utcnow().isoformat()}

@app.get("/")
@app.head("/")
async def root():
    return {"status": "online", "system": "Trinity Science Division"}

# --- CORS ---
from fastapi.middleware.cors import CORSMiddleware

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://controller.aitrinitysymphony.com", # Production Vercel
    "*" # Allow all for now to ensure smooth launch
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.post("/anfis/decide", response_model=AnfisOutput)
async def decide_anfis(data: AnfisInput):
    logger.info(f"Received ANFIS request: {data}")
    
    try:
        from app.pydantic_agents import get_science_decision, DecisionInput as PyDecisionInput
        # Use the new Pydantic AI Agent for structured decision making
        py_data = PyDecisionInput(
            latency_ms=data.latency_ms,
            user_reputation=data.user_reputation,
            task_complexity=data.task_complexity
        )
        decision = await get_science_decision(py_data)
        
        return AnfisOutput(
            should_query_user=decision.should_query_user,
            interaction_type=decision.interaction_type,
            score=0.9 if decision.should_query_user else 0.5,
            reason=decision.reason
        )
    except Exception as e:
        logger.error(f"Pydantic AI Agent failed: {str(e)}")
        # Fallback to legacy heuristic
        latency = data.latency_ms
        return AnfisOutput(
            should_query_user=latency > 2000,
            interaction_type="deep_clarification" if latency > 2000 else "none",
            score=0.5,
            reason=f"Fallback: {str(e)}"
        )



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
    
    import rewards as rewards_lib
    # 2. Calculate Multiplier using Fuzzy Logic
    # Apply 'God Mode' config weights if needed (simple scaling for MVP)
    weighted_need = input_data.network_need * current_config.network_need_weight
    
    multiplier = rewards_lib.reward_system.calculate(
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
    
    import arbitrage as arbitrage_lib
    # Adapt to Engine Request
    # In Phase 5+, we would pass data.secure_keys to the provider
    engine_req = arbitrage_lib.BidRequest(
        task_id=data.task_id,
        required_gpu=data.required_gpu,
        required_ram_gb=data.required_ram_gb,
        strategy=data.strategy
    )
    
    # Get Offers
    offers = arbitrage_lib.arbitrage_engine.get_offers(engine_req)
    winner = arbitrage_lib.arbitrage_engine.select_winner(offers, data.strategy)
    
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



class RouterInput(BaseModel):
    user_exp: int
    latency_tol: float
    task_comp: int

class RouterOutput(BaseModel):
    score: float
    strategy: str
    reason: str

@app.post("/router/optimize", response_model=RouterOutput)
async def optimize_route(data: RouterInput):
    """
    Get optimized routing strategy based on Ubiquitous ANFIS.
    """
    logger.info(f"Received Router Request: {data}")
    result = router_lib.router.route(data.user_exp, data.latency_tol, data.task_comp)
    
    return RouterOutput(
        score=result['score'],
        strategy=result['strategy'],
        reason=result['reason']
    )
