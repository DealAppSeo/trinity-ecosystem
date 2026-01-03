# FIND_TASK Protocol - Task Discovery & Claim

1. Query trinity_tasks:
   - WHERE status = 'pending' 
   - ORDER BY priority DESC, created_at ASC
   - LIMIT 1
2. If no pending tasks, query trinity_evergreen_tasks:
   - WHERE next_run <= now()
   - AND owner_domain matches agent specialty
3. Match task to agent specialty (e.g., TORCH for analysis, MEL for content).
4. Claim task:
   - UPDATE trinity_tasks SET claimed_by = 'AGENT_NAME', claimed_at = now()
5. Log claim in trinity_agent_logs (task_id linked, start_time = now()).
6. If evergreen task, set status = 'looping' in logs.

Proceed to EXECUTE.
