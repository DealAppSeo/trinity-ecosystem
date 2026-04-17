-- Tool Executor Sprint — Created April 5 2026 by Gemini

CREATE OR REPLACE FUNCTION trigger_buddy_system()
RETURNS TRIGGER AS $$
DECLARE
  v_buddy_agent TEXT;
BEGIN
  -- Check if artifact is empty
  IF NEW.content IS NULL OR NEW.filename IS NULL THEN
    
    -- Buddy Map
    CASE NEW.agent
      WHEN 'VERITAS' THEN v_buddy_agent := 'SHOFET';
      WHEN 'SHOFET' THEN v_buddy_agent := 'VERITAS';
      WHEN 'SOPHIA' THEN v_buddy_agent := 'NEXUS';
      WHEN 'NEXUS' THEN v_buddy_agent := 'SOPHIA';
      WHEN 'TORCH' THEN v_buddy_agent := 'MEL';
      WHEN 'MEL' THEN v_buddy_agent := 'TORCH';
      WHEN 'ORCH' THEN v_buddy_agent := 'GCM';
      WHEN 'GCM' THEN v_buddy_agent := 'ORCH';
      WHEN 'APM' THEN v_buddy_agent := 'W3C';
      WHEN 'W3C' THEN v_buddy_agent := 'APM';
      ELSE v_buddy_agent := 'ORCH'; -- Fallback
    END CASE;

    INSERT INTO trinity_tasks (
      assigned_to,
      task_type,
      description,
      priority,
      status,
      metadata
    ) VALUES (
      v_buddy_agent,
      'buddy_retry',
      'Buddy retry for empty artifact. Original agent: ' || NEW.agent || 
      '. Original task_id: ' || NEW.task_id || 
      '. Use agent-tools edge function to complete this. Call: ' ||
      'https://qnnpjhlxljtqyigedwkb.supabase.co/functions/v1/agent-tools',
      1,
      'pending',
      jsonb_build_object(
        'original_artifact_id', NEW.id,
        'original_agent', NEW.agent,
        'buddy_system', true,
        'tools_available', ARRAY['sql_query','web_search','llm_call','write_artifact']
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_buddy_system ON trinity_artifacts;

CREATE TRIGGER trg_buddy_system
AFTER INSERT ON trinity_artifacts
FOR EACH ROW
EXECUTE FUNCTION trigger_buddy_system();

-- Task 3
INSERT INTO ground_truth_facts (category, fact_key, fact_value, match_type, description)
VALUES 
('tools', 'agent_tool_executor_url', 
 'https://qnnpjhlxljtqyigedwkb.supabase.co/functions/v1/agent-tools',
 'exact', 'Edge function agents call to execute SQL, web search, LLM calls, artifact writes'),
('tools', 'agent_tool_auth_header',
 'Authorization: Bearer [SUPABASE_ANON_KEY from env]',
 'exact', 'Auth header for agent-tools edge function'),
('tools', 'tool_names_available',
 'sql_query, web_search, llm_call, write_artifact',
 'exact', 'Four tools available via agent-tools edge function'),
('tools', 'buddy_system_active',
 'true',
 'exact', 'Buddy system trigger fires when agent produces empty artifact'),
('tools', 'n8n_webhook_base',
 'https://n8n-production-68cf.up.railway.app/webhook',
 'exact', 'n8n webhook base URL for complex multi-step tools')
ON CONFLICT (fact_key) DO NOTHING;
