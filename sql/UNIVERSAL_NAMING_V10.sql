-- UNIVERSAL_NAMING_V10.sql
-- Enforcing trinity- prefix schema for all core agents

-- 1. Update trinity_agent_registry
UPDATE trinity_agent_registry
SET agent_name = 'trinity-orch'
WHERE agent_name IN ('ORCH', 'orch', 'MCP');

UPDATE trinity_agent_registry
SET agent_name = 'trinity-mel'
WHERE agent_name IN ('MEL', 'mel');

UPDATE trinity_agent_registry
SET agent_name = 'trinity-apm'
WHERE agent_name IN ('APM', 'apm');

UPDATE trinity_agent_registry
SET agent_name = 'trinity-gcm'
WHERE agent_name IN ('GCM', 'gcm');

-- 2. Update trinity_tasks
UPDATE trinity_tasks
SET assigned_to = 'trinity-orch'
WHERE assigned_to IN ('ORCH', 'orch', 'MCP');

UPDATE trinity_tasks
SET claimed_by = 'trinity-orch'
WHERE claimed_by IN ('ORCH', 'orch', 'MCP');

UPDATE trinity_tasks
SET verified_by = 'trinity-orch'
WHERE verified_by = 'ORCH' OR verified_by = 'orch' OR verified_by = 'MCP';

-- 3. Update trinity_artifacts
UPDATE trinity_artifacts
SET creator_agent = 'trinity-orch'
WHERE creator_agent IN ('ORCH', 'orch', 'MCP');

-- 4. Update agent_heartbeat
UPDATE agent_heartbeat
SET agent_name = 'trinity-orch'
WHERE agent_name IN ('ORCH', 'orch', 'MCP');

-- Log the alignment
INSERT INTO trinity_agent_logs (agent_name, message, level)
VALUES ('trinity-orch', '[SYSTEM] Universal Naming Schema V10 Applied. Long live the prefix.', 'info');
