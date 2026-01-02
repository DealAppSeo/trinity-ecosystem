-- ============================================================
-- MASTER SETUP: Tables + RLS for Trinity Agents (Local Dev)
-- ============================================================

-- 1. Create Trinity Retros Table
create table if not exists public.trinity_retros (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  agent text not null,
  reflection text not null,
  successes text,
  failures text,
  lessons text
);

-- 2. Create Trinity Research Log Table
create table if not exists public.trinity_research_log (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  gap text not null,
  summary text not null,
  resources jsonb,
  agent text not null,
  status text default 'completed'
);

-- 3. Enable RLS on both
alter table public.trinity_retros enable row level security;
alter table public.trinity_research_log enable row level security;

-- 4. Create "Open Door" Policies (Allows Anon/Service Role to read/write)
-- Retros
drop policy if exists "Enable all for anon" on public.trinity_retros;
create policy "Enable all for anon"
  on public.trinity_retros for all
  to anon, authenticated, service_role
  using (true)
  with check (true);

-- Research
drop policy if exists "Enable all for anon" on public.trinity_research_log;
create policy "Enable all for anon"
  on public.trinity_research_log for all
  to anon, authenticated, service_role
  using (true)
  with check (true);
