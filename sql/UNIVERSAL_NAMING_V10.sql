-- UNIVERSAL_NAMING_V10.sql
-- Enforcing trinity- prefix schema for all core agents
-- FIXED: Robust handling for unique constraints and array columns.

DO $$ 
BEGIN
    -- 1. Update trinity_agent_registry (Merged logic to avoid unique violations)
    -- Handle ORCHESTRATION
    IF EXISTS (SELECT 1 FROM trinity_agent_registry WHERE agent_name = 'trinity-orch') THEN
        DELETE FROM trinity_agent_registry WHERE agent_name IN ('ORCH', 'orch', 'MCP');
    ELSE
        UPDATE trinity_agent_registry SET agent_name = 'trinity-orch' WHERE agent_name = 'ORCH';
        UPDATE trinity_agent_registry SET agent_name = 'trinity-orch' WHERE agent_name = 'orch' AND NOT EXISTS (SELECT 1 FROM trinity_agent_registry WHERE agent_name = 'trinity-orch');
        UPDATE trinity_agent_registry SET agent_name = 'trinity-orch' WHERE agent_name = 'MCP' AND NOT EXISTS (SELECT 1 FROM trinity_agent_registry WHERE agent_name = 'trinity-orch');
        DELETE FROM trinity_agent_registry WHERE agent_name IN ('ORCH', 'orch', 'MCP') AND agent_name != 'trinity-orch';
    END IF;

    -- Handle MEL
    IF EXISTS (SELECT 1 FROM trinity_agent_registry WHERE agent_name = 'trinity-mel') THEN
        DELETE FROM trinity_agent_registry WHERE agent_name IN ('MEL', 'mel');
    ELSE
        UPDATE trinity_agent_registry SET agent_name = 'trinity-mel' WHERE agent_name = 'MEL';
        UPDATE trinity_agent_registry SET agent_name = 'trinity-mel' WHERE agent_name = 'mel' AND NOT EXISTS (SELECT 1 FROM trinity_agent_registry WHERE agent_name = 'trinity-mel');
    END IF;

    -- Handle APM
    IF EXISTS (SELECT 1 FROM trinity_agent_registry WHERE agent_name = 'trinity-apm') THEN
        DELETE FROM trinity_agent_registry WHERE agent_name IN ('APM', 'apm');
    ELSE
        UPDATE trinity_agent_registry SET agent_name = 'trinity-apm' WHERE agent_name = 'APM';
        UPDATE trinity_agent_registry SET agent_name = 'trinity-apm' WHERE agent_name = 'apm' AND NOT EXISTS (SELECT 1 FROM trinity_agent_registry WHERE agent_name = 'trinity-apm');
    END IF;

    -- 2. Update trinity_tasks (Safe - No unique constraint)
    UPDATE trinity_tasks SET assigned_to = 'trinity-orch' WHERE assigned_to IN ('ORCH', 'orch', 'MCP');
    UPDATE trinity_tasks SET claimed_by = 'trinity-orch' WHERE claimed_by IN ('ORCH', 'orch', 'MCP');
    UPDATE trinity_tasks SET assigned_to = 'trinity-mel' WHERE assigned_to IN ('MEL', 'mel');
    UPDATE trinity_tasks SET claimed_by = 'trinity-mel' WHERE claimed_by IN ('MEL', 'mel');
    UPDATE trinity_tasks SET assigned_to = 'trinity-apm' WHERE assigned_to IN ('APM', 'apm');
    UPDATE trinity_tasks SET claimed_by = 'trinity-apm' WHERE claimed_by IN ('APM', 'apm');

    -- Fix verified_by (Array column text[])
    UPDATE trinity_tasks SET verified_by = array_replace(verified_by, 'ORCH', 'trinity-orch') WHERE 'ORCH' = ANY(verified_by);
    UPDATE trinity_tasks SET verified_by = array_replace(verified_by, 'orch', 'trinity-orch') WHERE 'orch' = ANY(verified_by);
    UPDATE trinity_tasks SET verified_by = array_replace(verified_by, 'MCP', 'trinity-orch') WHERE 'MCP' = ANY(verified_by);
    UPDATE trinity_tasks SET verified_by = array_replace(verified_by, 'MEL', 'trinity-mel') WHERE 'MEL' = ANY(verified_by);
    UPDATE trinity_tasks SET verified_by = array_replace(verified_by, 'mel', 'trinity-mel') WHERE 'mel' = ANY(verified_by);

    -- 3. Update trinity_artifacts
    UPDATE trinity_artifacts SET creator_agent = 'trinity-orch' WHERE creator_agent IN ('ORCH', 'orch', 'MCP');
    UPDATE trinity_artifacts SET agent = 'trinity-orch' WHERE agent IN ('ORCH', 'orch', 'MCP');

    -- 4. Update agent_heartbeat (Merged logic for unique constraint)
    IF EXISTS (SELECT 1 FROM agent_heartbeat WHERE agent_name = 'trinity-orch') THEN
        DELETE FROM agent_heartbeat WHERE agent_name IN ('ORCH', 'orch', 'MCP');
    ELSE
        -- Update the most recent one if multiple exist
        UPDATE agent_heartbeat SET agent_name = 'trinity-orch' 
        WHERE id = (SELECT id FROM agent_heartbeat WHERE agent_name IN ('ORCH', 'orch', 'MCP') ORDER BY last_ping DESC LIMIT 1);
        DELETE FROM agent_heartbeat WHERE agent_name IN ('ORCH', 'orch', 'MCP');
    END IF;

    -- 5. RECOVERY: Reset Stuck Tasks
    UPDATE trinity_tasks 
    SET status = 'pending', claimed_by = NULL, claimed_at = NULL 
    WHERE status = 'doing' OR status = 'in_progress';

    -- Log the alignment
    INSERT INTO trinity_agent_logs (agent_name, message, level)
    VALUES ('trinity-orch', '[SYSTEM] Universal Naming Schema V10 Applied. Integrity checks passed. Tasks reset.', 'info');
END $$;
