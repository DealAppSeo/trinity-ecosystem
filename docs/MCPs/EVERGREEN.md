# EVERGREEN Protocol - Recurring Task Looping

For tasks marked is_evergreen = true.

1. On successful completion:
   - Increment loop_count in trinity_agent_logs
2. Respawn logic:
   - If loop_count < max_loops (default 24/day, configurable)
   - INSERT new trinity_tasks row with updated parameters
   - Use prior result to refine next iteration
3. Enforce evolution:
   - Next loop must improve or expand on previous
   - If no progress detected, fail and notify HITL
4. Minimum loop duration: 10 minutes
5. Log each loop (status = 'looping')

Goal: True continuous improvement over days, not minutes.
