import os
try:
    from pydantic_ai import Agent, RunContext
except ImportError:
    Agent = RunContext = None
    print("[WARNING] pydantic_ai not found. Stubs used.")

from pydantic import BaseModel, Field
from typing import List, Literal, Optional
import structlog
import logging
try:
    from openinference.instrumentation.pydantic_ai import PydanticAIInstrumentor
except ImportError:
    PydanticAIInstrumentor = None

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource

try:
    from app.cdp_service import cdp_service
except ImportError:
    cdp_service = None


# Configure CDP
if cdp_service:
    cdp_service.initialize()


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
logger = structlog.get_logger()

# Configure Phoenix/OpenTelemetry Tracing (Optional)
PHOENIX_ENDPOINT = os.getenv("PHOENIX_COLLECTOR_ENDPOINT", "http://localhost:6006/v1/traces")
ENABLE_TRACING = os.getenv("ENABLE_TRACING", "false").lower() == "true"

if ENABLE_TRACING:
    try:
        resource = Resource(attributes={"service.name": "trinity-science"})
        span_exporter = OTLPSpanExporter(endpoint=PHOENIX_ENDPOINT)
        span_processor = BatchSpanProcessor(span_exporter)
        trace_provider = TracerProvider(resource=resource)
        trace_provider.add_span_processor(span_processor)
        trace.set_tracer_provider(trace_provider)
        
        # Instrument Pydantic AI
        if PydanticAIInstrumentor:
            PydanticAIInstrumentor().instrument()
            logger.info("Tracing and Pydantic AI instrumentation enabled.", endpoint=PHOENIX_ENDPOINT)
        else:
            logger.info("Tracing enabled but Pydantic AI instrumentation skipped (import failed).")
    except Exception as e:
        logger.warning("Tracing initialization failed. Proceeding without tracing.", error=str(e))

else:
    logger.info("Tracing disabled by environment variable (ENABLE_TRACING=false).")

class DecisionInput(BaseModel):
    latency_ms: float = Field(..., description="Current system latency")
    user_reputation: float = Field(..., description="Reputation score of the user/agent")
    task_complexity: float = Field(..., description="Complexity score from 0 to 1")

class DecisionOutput(BaseModel):
    should_query_user: bool
    interaction_type: Literal['none', 'shallow_check', 'deep_clarification']
    reason: str

# Define the Science Decision Agent
science_agent = Agent(
    'openai:gpt-4o',
    deps_type=None,
    result_type=DecisionOutput,
    system_prompt=(
        "You are the Trinity Science Brain. Your goal is to maximize system flow while maintaining high accuracy. "
        "Use system latency as an opportunity to engage the user for clarification if the task is complex."
    ),
) if Agent else None

@science_agent.tool if science_agent else lambda f: f
async def check_rep_threshold(ctx: RunContext[None], rep: float) -> str:

    """Check if the reputation meets the threshold for deep interaction."""
    return "Threshold Met" if rep > 80 else "Threshold Not Met"

@science_agent.tool if science_agent else lambda f: f
async def create_coinbase_wallet(ctx: RunContext[None], network: str = "base-sepolia") -> str:
    """Create a new crypto wallet via Coinbase CDP."""
    if not cdp_service:
        return "CDP Service not available (stubbed)."
    try:
        wallet = cdp_service.create_wallet(network)
        address = wallet.default_address
        return f"Wallet created successfully! ID: {wallet.id}, Address: {address}"
    except Exception as e:
        return f"Wallet creation failed: {str(e)}"


async def get_science_decision(data: DecisionInput) -> DecisionOutput:
    logger.info("science_decision_start", latency_ms=data.latency_ms, rep=data.user_reputation)
    if not science_agent:
        logger.warning("science_agent_unavailable_returning_default")
        return DecisionOutput(should_query_user=True, interaction_type='deep_clarification', reason="Science agent unavailable (math focus)")
    
    result = await science_agent.run(
        f"Determine interaction strategy for: Latency={data.latency_ms}, Rep={data.user_reputation}, Complexity={data.task_complexity}"
    )
    logger.info("science_decision_end", result=result.data.interaction_type)
    return result.data

