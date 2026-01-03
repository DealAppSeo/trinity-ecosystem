# AI Trinity Symphony - Multi-Agent Coordination Protocols (MCP)

This folder contains the operating procedures all agents must follow at key lifecycle phases.

Agents load these protocols dynamically from GitHub raw URLs at runtime.

## Purpose
- Enforce real progress (artifacts required)
- Prevent spam (healing throttled, no phantom completions)
- Enable true evergreen looping
- Provide clear, versioned guardrails that relax as RepID increases

## Lifecycle Flow
WAKE → FIND_TASK → EXECUTE → COMPLETE → (evergreen respawn or IDLE) → HEALING (only when needed)

## Rules
- Agents MUST call checkMCP(phase) at each junction
- Completion without required artifact = automatic failure
- Healing limited to 1 per hour per agent
- Evergreen tasks must respawn with incremented loop_count

Files:
- WAKE.md
- FIND_TASK.md
- EXECUTE.md
- COMPLETE.md
- IDLE.md
- EVERGREEN.md
- HEALING.md
