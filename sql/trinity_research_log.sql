-- Create the trinity_research_log table for Strategy 8: Continuous Research
create table if not exists public.trinity_research_log (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  gap text not null, -- The skill gap or topic being researched
  summary text not null, -- The AI-generated summary of the research
  resources jsonb, -- JSON array of found resources (urls, titles)
  agent text not null, -- The agent that performed the research
  status text default 'completed' -- pending, completed, failed
);

-- Enable RLS
alter table public.trinity_research_log enable row level security;

-- Allow authenticated users (agents) to insert/read
create policy "Agents can insert research"
  on public.trinity_research_log
  for insert
  to authenticated
  with check (true);

create policy "Agents can read research"
  on public.trinity_research_log
  for select
  using (true);
