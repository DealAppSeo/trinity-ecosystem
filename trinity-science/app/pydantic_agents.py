from pydantic_ai import Agent, RunContext
from pydantic import BaseModel, Field
from typing import List, Literal, Optional
import logfire

# Configure Logfire
logfire.configure(pydantic_plugin=pydantic.PydanticPlugin(record='all'))

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
)

@science_agent.tool
async def check_rep_threshold(ctx: RunContext[None], rep: float) -> str:
    """Check if the reputation meets the threshold for deep interaction."""
    return "Threshold Met" if rep > 80 else "Threshold Not Met"

async def get_science_decision(data: DecisionInput) -> DecisionOutput:
    with logfire.span("science_decision", data=data):
        result = await science_agent.run(
            f"Determine interaction strategy for: Latency={data.latency_ms}, Rep={data.user_reputation}, Complexity={data.task_complexity}"
        )
        return result.data
