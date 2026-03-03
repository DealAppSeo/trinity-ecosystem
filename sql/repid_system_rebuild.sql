-- RepID System Rebuild: Historical Migration & Trigger System
-- Standardizes RepID calculation for all agents.
-- Formula: new_repid = LEAST(100, current_repid + (base_increment * tier_multiplier * quality_factor))

-- 1. CLEANUP: Reset current scores to base (10) to ensure a clean recalculation from history
UPDATE public.trinity_agent_registry 
SET reputation_score = 10 
WHERE reputation_score IS NULL OR reputation_score < 10;

-- 2. HISTORICAL MIGRATION: Aggregate all completed tasks
WITH task_aggregates AS (
    SELECT 
        t.assigned_to as agent_name,
        SUM(
            0.05 * 
            CASE 
                WHEN r.current_tier = 'conductor' THEN 1.5
                WHEN r.current_tier = 'specialist' THEN 1.2
                ELSE 1.0
            END * 
            (COALESCE(t.score, 100.0) / 100.0)
        ) as earned_reputation
    FROM public.trinity_tasks t
    JOIN public.trinity_agent_registry r ON t.assigned_to = r.agent_name
    WHERE t.status IN ('done', 'verified', 'archived')
    AND t.assigned_to IS NOT NULL
    GROUP BY t.assigned_to
)
UPDATE public.trinity_agent_registry r
SET reputation_score = LEAST(100.0, 10.0 + a.earned_reputation)
FROM task_aggregates a
WHERE r.agent_name = a.agent_name;

-- 3. TRIGGER SYSTEM: Automate future updates
CREATE OR REPLACE FUNCTION public.fn_update_agent_reputation()
RETURNS TRIGGER AS $$
DECLARE
    v_multiplier FLOAT;
    v_increment FLOAT;
BEGIN
    -- Only trigger when a task is moved to 'done', 'verified', or 'archived'
    IF (NEW.status IN ('done', 'verified', 'archived') AND (OLD.status IS NULL OR OLD.status NOT IN ('done', 'verified', 'archived'))) THEN
        -- Get multiplier from registry
        SELECT 
            CASE 
                WHEN current_tier = 'conductor' THEN 1.5
                WHEN current_tier = 'specialist' THEN 1.2
                ELSE 1.0
            END
        INTO v_multiplier
        FROM public.trinity_agent_registry
        WHERE agent_name = NEW.assigned_to;

        IF FOUND AND NEW.assigned_to IS NOT NULL THEN
            -- Calculate increment
            v_increment := 0.05 * v_multiplier * (COALESCE(NEW.score, 100.0) / 100.0);

            -- Update registry
            UPDATE public.trinity_agent_registry
            SET 
                reputation_score = LEAST(100.0, reputation_score + v_increment),
                tasks_completed = tasks_completed + 1,
                last_active = NOW()
            WHERE agent_name = NEW.assigned_to;

            -- Update task with the contribution for audit trail
            NEW.repid_score := v_increment;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. BIND TRIGGER
DROP TRIGGER IF EXISTS trg_task_reputation_sync ON public.trinity_tasks;
CREATE TRIGGER trg_task_reputation_sync
BEFORE UPDATE OF status ON public.trinity_tasks
FOR EACH ROW
EXECUTE FUNCTION public.fn_update_agent_reputation();

-- 5. VERIFICATION: Project Veritas score
SELECT agent_name, reputation_score, tasks_completed, current_tier
FROM public.trinity_agent_registry
WHERE agent_name = 'trinity-veritas';
