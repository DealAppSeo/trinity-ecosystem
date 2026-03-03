-- Pre-ZKP Integrity Sprint: Cleanup & Categorization
-- Addresses FIX 2, FIX 3, and FIX 6.

-- FIX 2: Priority Clamping
-- Clamp existing outliers to the 0-100 range.
UPDATE public.trinity_tasks
SET priority = 100
WHERE priority > 100;

UPDATE public.trinity_tasks
SET priority = 0
WHERE priority < 0;

-- FIX 3: Attribute Orphaned Tasks
-- Backfill assigned_to from completed_by for tasks where attribution is missing.
UPDATE public.trinity_tasks
SET assigned_to = completed_by
WHERE assigned_to IS NULL
  AND completed_by IS NOT NULL
  AND status IN ('done', 'verified', 'archived');

/* -- FIX 6: Task Categorization & Auto-populate Trigger
-- A. Backfill Task Categories
UPDATE public.trinity_tasks
SET task_category = CASE 
  WHEN task_type IN ('investigation', 'research') THEN 'research'
  WHEN task_type IN ('review', 'audit', 'verification', 'critique') THEN 'quality'
  WHEN task_type IN ('code', 'coding', 'design') THEN 'engineering'
  WHEN task_type IN ('strategy', 'governance', 'business', 'meta') THEN 'governance'
  WHEN task_type IN ('report', 'data', 'benchmark') THEN 'reporting'
  WHEN task_type IN ('genesis', 'maintenance', 'infrastructure', 'EVERGREEN') THEN 'maintenance'
  ELSE 'uncategorized'
END
WHERE task_category IS NULL;

-- B. Create Auto-populate Function
CREATE OR REPLACE FUNCTION public.fn_auto_populate_task_category()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.task_category IS NULL THEN
        NEW.task_category := CASE 
            WHEN NEW.task_type IN ('investigation', 'research') THEN 'research'
            WHEN NEW.task_type IN ('review', 'audit', 'verification', 'critique') THEN 'quality'
            WHEN NEW.task_type IN ('code', 'coding', 'design') THEN 'engineering'
            WHEN NEW.task_type IN ('strategy', 'governance', 'business', 'meta') THEN 'governance'
            WHEN NEW.task_type IN ('report', 'data', 'benchmark') THEN 'reporting'
            WHEN NEW.task_type IN ('genesis', 'maintenance', 'infrastructure', 'EVERGREEN') THEN 'maintenance'
            ELSE 'uncategorized'
        END;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- C. Bind Trigger to trinity_tasks
DROP TRIGGER IF EXISTS trg_auto_populate_category ON public.trinity_tasks;
CREATE TRIGGER trg_auto_populate_category
BEFORE INSERT ON public.trinity_tasks
FOR EACH ROW
EXECUTE FUNCTION public.fn_auto_populate_task_category();
*/
