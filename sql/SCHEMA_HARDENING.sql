-- ============================================================
-- SUPABASE SECURITY HARDENING SCRIPT (SCHEMA_HARDENING.sql)
-- ============================================================
-- Targets: RLS Enablement, Policy Enforcement, and View Security
-- ============================================================

DO $$ 
DECLARE 
    tbl_record RECORD;
    target_tables TEXT[] := ARRAY[
        'trinity_agent_registry', 'trinity_artifacts', 'trinity_heartbeat', 'trinity_tasks',
        'evergreen_tasks', 'trinity_governance_config', 'ai_flags', 'trinity_wisdom_cache',
        'trinity_evolution_log', 'system_snapshots', 'trinity_healing_events', 
        'trinity_constitutional_violations', 'agents', 'tasks', 'audits', 'decision_log',
        'trinity_managers', 'trinity_heartbeats', 'trinity_task_archive', 
        'trinity_virtue_manifestations', 'trinity_truth_log', 'trinity_repid', 
        'agent_repid_scores', 'agent_reputation', 'autonomous_action_log', 
        'trinity_execution_logs', 'agent_context_protocol', 'agent_status', 
        'task_verifications', 'rep_score_changes', 'platform_heartbeats', 
        'trinity_referrals', 'artifacts', 'trinity_wake_requests', 'artifact_votes', 
        'routing_decisions', 'orchestrator_cycles', 'trinity_pending_actions', 
        'trinity_repid_events', 'trinity_deployments', 'trinity_anfis_rules', 
        'ai_task_registry', 'cross_ai_messages', 'memory_deltas', 'agent_messages', 
        'mission_cards', 'opportunities', 'agent_learnings', 'trinity_hands_requests', 
        'ideas_backlog', 'workflow_artifacts', 'agent_heartbeat', 'project_flywheel', 
        'ethics_checks', 'pending_actions', 'investor_targets', 'task_outputs', 
        'ai_providers', 'innovation_metrics', 'idea_injections', 'daily_costs', 
        'controller_state', 'customer_feedback', 'trinity_knowledge', 'trinity_kv_store', 
        'pipeline_templates', 'analyses', 'demo_viewers', 'demo_views', 
        'swarm_challenges', 'cost_tracking', 'call_log', 'trinity_immutable_records', 
        'repid_challenges', 'repid_config', 'conductor_sessions', 'config_change_proposals', 
        'repid_daily_metrics', 'agent_repid', 'ideation_log', 'founder_recommendations', 
        'trinity_blueprints', 'trinity_agent_credits', 'schema_evolution', 'healing_bugs', 
        'healing_fixes', 'healing_patterns', 'healing_requests', 'health_checks', 
        'decision_records', 'rotation_state', 'shared_learnings', 'trinity_learning_metrics', 
        'trinity_master_plan', 'trinity_agent_genesis', 'trinity_spawn_patterns', 
        'trinity_care_actions', 'agent_health', 'system_health', 'healing_rules', 
        'verification_votes', 'design_decisions', 'ideation', 'reasoning_log', 
        'agent_feedback', 'evolution_log', 'provider_performance', 'trinity_agent_config', 
        'trinity_mcp_registry', 'trinity_mcp_servers', 'trinity_changelog', 'agent_stakes', 
        'clashy_waitlist', 'ai_models', 'ai_repid_history', 'aidebate_users', 
        'user_voting_accuracy', 'trinity_task_votes', 'aidebate_topics', 'debates', 
        'votes', 'question_ratings', 'user_questions', 'trinity_agents'
    ];
    tbl_name TEXT;
BEGIN 
    FOREACH tbl_name IN ARRAY target_tables
    LOOP
        -- 1. Check if table exists
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl_name) THEN
            -- 2. Enable RLS
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl_name);
            
            -- 3. Drop existing permissive policies if they have generic names
            EXECUTE format('DROP POLICY IF EXISTS "Enable read access for all users" ON public.%I;', tbl_name);
            EXECUTE format('DROP POLICY IF EXISTS "Enable read for anon" ON public.%I;', tbl_name);
            
            -- 4. Create standard read policy for anon/authenticated
            EXECUTE format('CREATE POLICY "Enable read for anon" ON public.%I FOR SELECT TO anon, authenticated, service_role USING (true);', tbl_name);
            
            -- 5. Create standard write policy for admin/service (authenticated is optional but safer)
            EXECUTE format('DROP POLICY IF EXISTS "Enable all for service_role" ON public.%I;', tbl_name);
            EXECUTE format('CREATE POLICY "Enable all for service_role" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);', tbl_name);
            
            RAISE NOTICE 'Hardened table: %', tbl_name;
        END IF;
    END LOOP;
END $$;

-- ============================================================
-- VIEW SECURITY: TRANSITION TO SECURITY INVOKER
-- ============================================================
-- This requires Postgres 15+ (standard for recent Supabase)

DO $$ 
DECLARE 
    v_record RECORD;
    target_views TEXT[] := ARRAY[
        'trinity_quality_report', 'social_mirror_provider_stats', 'social_mirror_daily_stats',
        'trinity_agent_log_summary', 'sanity_hour_queue', 'v_agent_metrics', 'v_dashboard',
        'agent_health_dashboard', 'ai_leaderboard', 'social_mirror_type_distribution',
        'trinity_agent_performance', 'user_leaderboard', 'v_blueprint_progress',
        'ai_models_for_sync', 'healing_open_requests', 'v_grok', 'trinity_weekly_wisdom',
        'trinity_infection_status', 'trinity_daily_metrics', 'v_public_mcp_registry',
        'sync_status_dashboard', 'agent_dashboard', 'active_debates', 'trinity_agent_summary',
        'trinity_provider_stats', 'view_agent_performance', 'repid_config_view',
        'trinity_healing_summary', 'v_claude', 'trinity_approval_queue', 'queue_health',
        'health_status', 'repid_standings', 'healing_active_bugs'
    ];
    v_name TEXT;
BEGIN 
    FOREACH v_name IN ARRAY target_views
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'public' AND table_name = v_name) THEN
            -- Note: SECURITY INVOKER is the default for views created via SQL.
            -- Replacing with INVOKER manually requires recreating the view OR using ALTER VIEW ... SET (security_invoker = true) in newer PG.
            BEGIN
                EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true);', v_name);
                RAISE NOTICE 'Hardened view: %', v_name;
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'Could not set security_invoker for view %: %. View might be regular view or PG version < 15.', v_name, SQLERRM;
            END;
        END IF;
    END LOOP;
END $$;
