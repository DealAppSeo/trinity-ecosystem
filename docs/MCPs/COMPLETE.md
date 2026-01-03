# COMPLETE Protocol - Task Completion Gate

CRITICAL: NO COMPLETION WITHOUT ARTIFACT FOR REQUIRED TASK TYPES

Pre-Completion Checklist:

1. Artifact Requirement
   - Does task_type require artifact? (code, research, content, design, review = YES)
   - Is artifact_url valid and accessible?
   - STOP if missing

2. Result Quality
   - Result field populated and >200 characters
   - No boilerplate ("Task completed")

3. Timing
   - At least 5 minutes since claimed_at
   - If <2 minutes, flag for review

4. Logging
   - INSERT into trinity_agent_logs:
     end_time = now()
     duration_seconds computed
     artifacts JSON with URL
     repid_impact = +2 (success)

5. Evergreen Respawn
   - If is_evergreen = true:
     Increment loop_count
     Trigger respawn via EVERGREEN protocol

6. Final Update
   - UPDATE trinity_tasks SET status = 'completed', completed_at = now(), artifact_url, result

Forbidden:
- Complete without required artifact
- Complete in <60 seconds
- Boilerplate results
- Complete tasks not claimed by you
