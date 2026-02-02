-- ============================================================
-- TRINITY SECURITY BASELINE: READ-ONLY ANON ACCESS
-- ============================================================
-- Goal: Ensure 'anon' role can only SELECT. INSERT/UPDATE/DELETE 
-- must be done by 'service_role' (agents) or 'authenticated'.
-- ============================================================

DO $$ 
DECLARE 
    tbl_record RECORD;
    target_tables TEXT[] := ARRAY[
        'trinity_agent_registry', 'trinity_artifacts', 'trinity_heartbeat', 'trinity_tasks',
        'trinity_agent_logs', 'trinity_evolution_vault', 'trinity_system_config'
    ];
    tbl_name TEXT;
BEGIN 
    FOREACH tbl_name IN ARRAY target_tables
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl_name) THEN
            -- 1. Enable RLS
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl_name);
            
            -- 2. Revoke all non-SELECT from anon
            EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon;', tbl_name);
            
            -- 3. Standardize Policies
            EXECUTE format('DROP POLICY IF EXISTS "Public read access" ON public.%I;', tbl_name);
            EXECUTE format('CREATE POLICY "Public read access" ON public.%I FOR SELECT TO anon, authenticated, service_role USING (true);', tbl_name);
            
            EXECUTE format('DROP POLICY IF EXISTS "Service role full access" ON public.%I;', tbl_name);
            EXECUTE format('CREATE POLICY "Service role full access" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);', tbl_name);
            
            RAISE NOTICE 'Secured table: %', tbl_name;
        END IF;
    END LOOP;
END $$;

-- Verify critical tables
ANALYZE public.trinity_tasks;
ANALYZE public.trinity_artifacts;
