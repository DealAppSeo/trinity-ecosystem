-- [TRINITY ECOSYSTEM] Reset stalled tasks to pending
-- Purpose: Unblock the swarm by releasing tasks that are stuck in 'doing' status.
-- Rule: If a task has been 'doing' for > 15 minutes without being updated, it's considered stalled.

UPDATE trinity_tasks
SET 
  status = 'pending',
  claimed_by = NULL,
  started_at = NULL,
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb), 
    '{reset_history}', 
    (COALESCE(metadata->'reset_history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'at', NOW(),
      'reason', 'Automated stability reset for stalled status'
    )))
  )
WHERE 
  status IN ('doing', 'in_progress', 'running')
  AND (updated_at < NOW() - INTERVAL '15 minutes' OR (updated_at IS NULL AND created_at < NOW() - INTERVAL '15 minutes'));

-- Optional: Cleanup orphan claims that don't match active heartbeats
-- This can be run periodically to ensure data integrity.
