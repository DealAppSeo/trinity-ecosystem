-- GLOBAL_ALIGNMENT_V12.sql
-- Force universal trinity- prefix across ALL tables and reset the board for fresh activity.

DO $$ 
DECLARE
    agent_record RECORD;
    legacy_names TEXT[] := ARRAY['ORCH','W3C','SHOFET','TORCH','VERITAS','GCM','CHESED','MEL','APM','SOPHIA','NEXUS','HDM','MCP'];
    normalized_name TEXT;
BEGIN
    -- 1. Normalize trinity_tasks (assigned_to, claimed_by)
    UPDATE trinity_tasks SET assigned_to = 'trinity-orch' WHERE assigned_to IN ('ORCH', 'orch', 'MCP', 'mcp');
    UPDATE trinity_tasks SET assigned_to = 'trinity-w3c' WHERE assigned_to IN ('W3C', 'w3c');
    UPDATE trinity_tasks SET assigned_to = 'trinity-shofet' WHERE assigned_to IN ('SHOFET', 'shofet');
    UPDATE trinity_tasks SET assigned_to = 'trinity-torch' WHERE assigned_to IN ('TORCH', 'torch');
    UPDATE trinity_tasks SET assigned_to = 'trinity-veritas' WHERE assigned_to IN ('VERITAS', 'veritas');
    UPDATE trinity_tasks SET assigned_to = 'trinity-gcm' WHERE assigned_to IN ('GCM', 'gcm');
    UPDATE trinity_tasks SET assigned_to = 'trinity-chesed' WHERE assigned_to IN ('CHESED', 'chesed');
    UPDATE trinity_tasks SET assigned_to = 'trinity-mel' WHERE assigned_to IN ('MEL', 'mel');
    UPDATE trinity_tasks SET assigned_to = 'trinity-apm' WHERE assigned_to IN ('APM', 'apm');
    UPDATE trinity_tasks SET assigned_to = 'trinity-sophia' WHERE assigned_to IN ('SOPHIA', 'sophia');
    UPDATE trinity_tasks SET assigned_to = 'trinity-nexus' WHERE assigned_to IN ('NEXUS', 'nexus');
    UPDATE trinity_tasks SET assigned_to = 'trinity-hdm' WHERE assigned_to IN ('HDM', 'hdm');

    -- Claimed_by normalization
    UPDATE trinity_tasks SET claimed_by = 'trinity-orch' WHERE claimed_by IN ('ORCH', 'orch', 'MCP', 'mcp');
    UPDATE trinity_tasks SET claimed_by = 'trinity-w3c' WHERE claimed_by IN ('W3C', 'w3c');
    UPDATE trinity_tasks SET claimed_by = 'trinity-shofet' WHERE claimed_by IN ('SHOFET', 'shofet');
    UPDATE trinity_tasks SET claimed_by = 'trinity-torch' WHERE claimed_by IN ('TORCH', 'torch');
    UPDATE trinity_tasks SET claimed_by = 'trinity-veritas' WHERE claimed_by IN ('VERITAS', 'veritas');
    UPDATE trinity_tasks SET claimed_by = 'trinity-gcm' WHERE claimed_by IN ('GCM', 'gcm');
    UPDATE trinity_tasks SET claimed_by = 'trinity-chesed' WHERE claimed_by IN ('CHESED', 'chesed');
    UPDATE trinity_tasks SET claimed_by = 'trinity-mel' WHERE claimed_by IN ('MEL', 'mel');
    UPDATE trinity_tasks SET claimed_by = 'trinity-apm' WHERE claimed_by IN ('APM', 'apm');
    UPDATE trinity_tasks SET claimed_by = 'trinity-sophia' WHERE claimed_by IN ('SOPHIA', 'sophia');
    UPDATE trinity_tasks SET claimed_by = 'trinity-nexus' WHERE claimed_by IN ('NEXUS', 'nexus');
    UPDATE trinity_tasks SET claimed_by = 'trinity-hdm' WHERE claimed_by IN ('HDM', 'hdm');

    -- 2. RECOVERY: Move all active tasks back to pending (Clear Stalls)
    UPDATE trinity_tasks 
    SET status = 'pending', 
        claimed_by = NULL, 
        claimed_at = NULL, 
        metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{reset_reason}', '"GLOBAL_ALIGNMENT_V12"')
    WHERE status IN ('doing', 'in_progress', 'pending_clarification');

    -- 3. Cleanup registry duplicates
    -- (This loop ensures we only keep the trinity- version)
    FOR normalized_name IN SELECT UNNEST(ARRAY['trinity-orch','trinity-w3c','trinity-shofet','trinity-torch','trinity-veritas','trinity-gcm','trinity-chesed','trinity-mel','trinity-apm','trinity-sophia','trinity-nexus','trinity-hdm'])
    LOOP
        DELETE FROM trinity_agent_registry 
        WHERE agent_name ILIKE REPLACE(normalized_name, 'trinity-', '')
        OR agent_name ILIKE normalized_name
        AND agent_name != normalized_name;
    END LOOP;

    -- 4. Final Pulse
    UPDATE trinity_agent_registry SET status = 'offline' WHERE agent_name != 'RESERVED';

END $$;
