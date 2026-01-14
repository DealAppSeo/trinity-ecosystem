-- ==========================================
-- TRINITY DEPLOYMENT HEALER SCHEMA
-- ==========================================

-- 1. Table: trinity_deployment_errors
-- Track build/deploy failures for AI analysis.
create table if not exists public.trinity_deployment_errors (
  id uuid primary key default uuid_generate_v4(),
  build_id text, -- From Railway/Vercel
  error_message text not null,
  component_stack text, -- Optional context
  status text check (status in ('pending', 'analyzed', 'fixed', 'ignored')) default 'pending',
  resolution_notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. RLS Policies
alter table public.trinity_deployment_errors enable row level security;

create policy "Enable all access for authenticated users"
  on public.trinity_deployment_errors for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Enable insert for service role"
  on public.trinity_deployment_errors for insert
  with check (true);

-- 3. Notify Trigger (Optional - for Realtime)
-- (Requires supabase_realtime publication to include this table)
