-- ============================================================
-- FIX: Update RLS Policies to allow Local "Anon" Development
-- ============================================================
-- Run this in your Supabase SQL Editor to unblock the Agents.

-- 1. Trinity Retros Table
drop policy if exists "Agents can insert retrospectives" on public.trinity_retros;
drop policy if exists "Enable read access for all users" on public.trinity_retros;

create policy "Enable insert for anon/service"
  on public.trinity_retros for insert
  to anon, authenticated, service_role
  with check (true);

create policy "Enable read for anon/service"
  on public.trinity_retros for select
  to anon, authenticated, service_role
  using (true);

-- 2. Trinity Research Log Table
drop policy if exists "Agents can insert research" on public.trinity_research_log;
drop policy if exists "Agents can read research" on public.trinity_research_log;

create policy "Enable insert for anon/service"
  on public.trinity_research_log for insert
  to anon, authenticated, service_role
  with check (true);

create policy "Enable read for anon/service"
  on public.trinity_research_log for select
  to anon, authenticated, service_role
  using (true);
