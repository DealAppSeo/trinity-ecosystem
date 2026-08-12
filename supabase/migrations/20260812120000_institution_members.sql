-- Institution membership — the missing authorization layer.
--
-- Before this table there was no way to answer "who is allowed to change this
-- institution's risk policy", so nothing asked. `POST /api/trustrails/settings`
-- accepted an institution_id from the request body and wrote any column of
-- institution_config with the service key: an unauthenticated caller could
-- disable the Pythagorean veto, zero out min_repid_payment, raise
-- max_aggregate_daily_usdc, or unfreeze a frozen institution.
--
-- Roles are ordered. Each includes the ones below it:
--   viewer   — read an institution's configuration
--   operator — change risk and policy thresholds
--   owner    — everything, plus freeze/unfreeze and BYOK credentials
--
-- Writes to this table go through the service key only. There is deliberately
-- no self-service INSERT policy: membership is granted out of band, because a
-- principal that can grant itself membership is not an authorization boundary.

create table if not exists public.institution_members (
  id             bigserial primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  institution_id text not null,
  role           text not null default 'viewer'
                 check (role in ('viewer', 'operator', 'owner')),
  created_at     timestamptz not null default now(),
  created_by     text,
  unique (user_id, institution_id)
);

create index if not exists institution_members_user_idx
  on public.institution_members (user_id);

alter table public.institution_members enable row level security;

-- A signed-in user may read their own memberships and nobody else's. This is
-- what lets a client discover which institutions to offer without exposing the
-- whole membership graph. All writes require the service key.
drop policy if exists institution_members_self_read on public.institution_members;
create policy institution_members_self_read
  on public.institution_members
  for select
  to authenticated
  using (user_id = auth.uid());

comment on table public.institution_members is
  'Maps auth.users to institutions with a role. Required by lib/auth.ts; '
  'mutating API routes deny when no row matches.';
