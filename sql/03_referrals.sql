
-- 1. Referral Tracking Table
create table if not exists trinity_referrals (
  id uuid default gen_random_uuid() primary key,
  giver_email text not null,
  receiver_email text, -- Optional if just generating a link
  code text not null,
  status text default 'pending', -- pending, accepted, rewarded
  repid_reward int default 10,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Indexes
create index if not exists idx_referrals_code on trinity_referrals(code);
create index if not exists idx_referrals_giver on trinity_referrals(giver_email);

-- 3. RLS Policies
alter table trinity_referrals enable row level security;

-- Allow anyone to create a referral (sharing a link)
create policy "Enable insert for authenticated users only"
on trinity_referrals for insert
to authenticated
with check (true);

-- Allow service role full access
create policy "Enable all access for service role"
on trinity_referrals for all
to service_role
using (true)
with check (true);

-- 4. Trigger to update updated_at
create or replace function update_referral_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_referrals_updated_at
before update on trinity_referrals
for each row
execute function update_referral_timestamp();
