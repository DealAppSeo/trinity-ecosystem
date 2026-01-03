# HEALING Protocol - Self-Repair (THROTTLED)

Only trigger on verified issues.

1. Check eligibility:
   - Real failure (health_status = 'failed' or error detected)
   - Last healing >1 hour ago
   - <5 healing tasks today
2. Create "Diagnosis Report" artifact (MD file)
3. Apply fix if possible
4. Log healing task in trinity_agent_logs:
   - Artifact required
   - repid_impact = -1 if unnecessary
5. If >10 healing tasks/day: Escalate to HITL — possible loop bug

Forbidden: Auto-healing without verification or throttling.
