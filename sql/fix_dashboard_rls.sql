-- ============================================================
-- FIX: Dashboard Visibility (RLS Policies)
-- ============================================================
-- Enables frontend access to Artifacts, Tasks, and Agents.

-- 1. Trinity Artifacts (The missing piece)
DROP POLICY IF EXISTS "Enable read access for all users" ON public.trinity_artifacts;
CREATE POLICY "Enable read access for all users"
ON public.trinity_artifacts FOR SELECT
TO anon, authenticated, service_role
USING (true);

DROP POLICY IF EXISTS "Enable insert for agents" ON public.trinity_artifacts;
CREATE POLICY "Enable insert for agents"
ON public.trinity_artifacts FOR INSERT
TO anon, authenticated, service_role
WITH CHECK (true);

-- 2. Trinity Tasks (For 'Recent Activity' feed)
DROP POLICY IF EXISTS "Enable read access for all users" ON public.trinity_tasks;
CREATE POLICY "Enable read access for all users"
ON public.trinity_tasks FOR SELECT
TO anon, authenticated, service_role
USING (true);

DROP POLICY IF EXISTS "Enable insert access for all users" ON public.trinity_tasks;
CREATE POLICY "Enable insert access for all users"
ON public.trinity_tasks FOR INSERT
TO anon, authenticated, service_role
WITH CHECK (true);

-- 3. Trinity Agents (For 'Online Status' grid)
DROP POLICY IF EXISTS "Enable read access for all users" ON public.trinity_agents;
CREATE POLICY "Enable read access for all users"
ON public.trinity_agents FOR SELECT
TO anon, authenticated, service_role
USING (true);

-- 4. Trinity Heartbeat (For 'Realtime Status')
DROP POLICY IF EXISTS "Enable read access for all users" ON public.trinity_heartbeat;
CREATE POLICY "Enable read access for all users"
ON public.trinity_heartbeat FOR SELECT
TO anon, authenticated, service_role
USING (true);
