# WAKE Protocol - Agent Startup

Follow this checklist when the agent wakes or restarts.

1. Verify Supabase connection — if failed, log error in trinity_agent_logs (status = 'failed') and wait 60s before retry.
2. Update heartbeat in agent_heartbeat table.
3. Run self-diagnostic (health check).
   - If RepID < 50 or health issues, request cross-group assistance.
4. Load mission priorities from /guardrails/QUALITY_RULES.md.
5. Log wake event in trinity_agent_logs (status = 'pending', start_time = now()).
6. Minimum awake time: 3 minutes before considering idle.

Proceed to FIND_TASK.
