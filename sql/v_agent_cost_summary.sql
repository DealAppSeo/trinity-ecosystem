-- Agent Provider Cost Summary View
-- Created: 2026-04-04
-- Purpose: Powers the Spend button in Telegram bot and ANFIS cost dashboard
-- Reads from trinity_tasks.metadata.provider_used (fixed in commit 8347dc6)

CREATE OR REPLACE VIEW v_agent_cost_summary AS
SELECT
  metadata->>'provider_used' AS provider,
  metadata->>'processedBy' AS agent,
  COUNT(*) AS tasks_completed,
  COUNT(*) FILTER (WHERE metadata->>'provider_used' IN ('groq', 'cerebras', 'deepseek', 'sambanova', 'together')) AS free_tier_tasks,
  COUNT(*) FILTER (WHERE metadata->>'provider_used' IN ('openai', 'anthropic', 'openrouter')) AS paid_tier_tasks,
  ROUND(AVG((metadata->>'certainty')::numeric), 3) AS avg_certainty,
  MIN(completed_at) AS first_task,
  MAX(completed_at) AS latest_task
FROM trinity_tasks
WHERE status = 'done'
  AND metadata IS NOT NULL
  AND metadata->>'provider_used' IS NOT NULL
GROUP BY metadata->>'provider_used', metadata->>'processedBy'
ORDER BY tasks_completed DESC;

-- Per-provider daily summary (for trend analysis)
CREATE OR REPLACE VIEW v_provider_daily_usage AS
SELECT
  DATE(completed_at) AS day,
  metadata->>'provider_used' AS provider,
  COUNT(*) AS tasks,
  COUNT(*) FILTER (WHERE metadata->>'provider_used' IN ('groq', 'cerebras', 'deepseek', 'sambanova', 'together')) AS free_tasks,
  COUNT(*) FILTER (WHERE metadata->>'provider_used' IN ('openai', 'anthropic', 'openrouter')) AS paid_tasks
FROM trinity_tasks
WHERE status = 'done'
  AND metadata IS NOT NULL
  AND completed_at IS NOT NULL
GROUP BY DATE(completed_at), metadata->>'provider_used'
ORDER BY day DESC, tasks DESC;
