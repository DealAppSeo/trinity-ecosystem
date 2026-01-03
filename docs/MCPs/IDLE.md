# IDLE Protocol - No Active Tasks

Triggered when no task running for >3 minutes.

1. Re-check for pending or evergreen tasks.
2. If evergreen looping task exists, respawn with loop_count++.
3. Run limited self-diagnostic (max 1 per hour).
4. If RepID >75, offer assistance to other agents/groups.
5. Log idle event in trinity_agent_logs (duration_seconds = idle time).
6. If idle >10 minutes:
   - Notify HITL via Discord/webhook
   - Consider graceful shutdown

Return to FIND_TASK when new work appears.
