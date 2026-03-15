-- MODULAR RECURSIVE INTELLIGENCE (SQL)
-- Implements Grok's "DB triggers recurse on logs for patterns" suggestion.
-- Focus: Detecting hallucination spikes and triggering swarm-level adaptations.

-- 1. Create a table for Swarm-level Intelligence Patterns
CREATE TABLE IF NOT EXISTS trinity_swarm_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_type TEXT NOT NULL, -- e.g., 'hallucination_spike', 'latency_degradation', 'gas_excess'
    severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    observed_gain DECIMAL,
    metadata JSONB DEFAULT '{}'::jsonb,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Function to detect patterns recursively across logs
CREATE OR REPLACE FUNCTION detect_trinity_patterns() 
RETURNS TRIGGER AS $$
DECLARE
    halluc_count INT;
    avg_veto_rate DECIMAL;
    recent_latency DECIMAL;
BEGIN
    -- Only process metrics logs
    IF (NEW.log_level = 'metrics' AND NEW.metadata->>'type' = 'ZKP_AUDIT_RECURSIVE') THEN
        
        -- Check for Hallucination Spikes (Last 5 audits)
        SELECT COUNT(*) INTO halluc_count 
        FROM (
            SELECT (metadata->>'vetoed')::int as vetoed 
            FROM trinity_agent_logs 
            WHERE metadata->>'type' = 'ZKP_AUDIT_RECURSIVE'
            ORDER BY created_at DESC 
            LIMIT 5
        ) subs 
        WHERE vetoed > 10;

        -- If spike detected, log swarm pattern and trigger adaptive response
        IF (halluc_count >= 3) THEN
            INSERT INTO trinity_swarm_patterns (pattern_type, severity, metadata)
            VALUES (
                'hallucination_spike', 
                'high', 
                jsonb_build_object('source', NEW.agent, 'count', halluc_count, 'recommendation', 'DIVERSIFY_LLM_VIA_SBFA')
            );

            -- Proactive Intervention: Log directive for ORCH
            INSERT INTO trinity_agent_logs (agent, log_level, content, metadata)
            VALUES (
                'SYSTEM_GUARDIAN',
                'info',
                'CRITICAL: Swarm-wide hallucination spike detected. ORCH instructed to rotate SBFA providers.',
                jsonb_build_object('directive', 'ROTATE_PROVIDERS', 'target', 'ORCH', 'automatic', true)
            );
        END IF;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger to run on every metrics log entry
DROP TRIGGER IF EXISTS trigger_detect_patterns ON trinity_agent_logs;
CREATE TRIGGER trigger_detect_patterns
AFTER INSERT ON trinity_agent_logs
FOR EACH ROW
EXECUTE FUNCTION detect_trinity_patterns();

-- 4. Recursive Learn Gain Tracker
-- 5. Adaptive Sprint Sizing Table (Grok Suggestion)
CREATE TABLE IF NOT EXISTS trinity_sprints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sprint_name TEXT NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    end_time TIMESTAMP WITH TIME ZONE,
    target_duration INTERVAL,
    actual_duration INTERVAL,
    complexity_score INT DEFAULT 1,
    parallel_execution BOOLEAN DEFAULT FALSE,
    efficiency_gain DECIMAL
);

-- Updates registry with the latest "Learn Gain" to improve future builds
CREATE OR REPLACE FUNCTION update_agent_learn_capacity()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.metadata->>'learnGain' IS NOT NULL) THEN
        UPDATE trinity_agent_registry
        SET reputation_score = reputation_score + ((NEW.metadata->>'learnGain')::decimal / 10.0)
        WHERE agent_name = NEW.agent;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_learn_capacity ON trinity_agent_logs;
CREATE TRIGGER trigger_update_learn_capacity
AFTER INSERT ON trinity_agent_logs
FOR EACH ROW
EXECUTE FUNCTION update_agent_learn_capacity();
