-- Spent-nonce store for control-proof replay defence.
--
-- DELIBERATELY UNAPPLIED. Applying a migration to the live project is
-- Sean-gated (see CLAUDE.md permanent fences). SupabaseNonceStore throws on
-- first use until this exists, rather than failing open — a replay check that
-- silently returns "unspent" reports a defence that is not there.
--
-- WHY THE PRIMARY KEY IS THE MECHANISM, not an index for speed:
-- replay defence must be an atomic check-and-record. A SELECT followed by an
-- INSERT has a window between them where two concurrent presentations of the
-- same proof both read "unseen" and both proceed — which is exactly the request
-- an attacker sends twice. The composite primary key makes the INSERT itself
-- the check: it either succeeds, or raises 23505 because someone got there
-- first. No transaction and no row lock required.
--
-- Rollback: drop table public.control_proof_nonces;

create table if not exists public.control_proof_nonces (
  -- Audience first: proofs are scoped per verifier, and the same nonce under
  -- two audiences is two different nonces. Audience-leading also makes the
  -- index selective for the per-audience cleanup below.
  audience    text        not null,
  nonce       text        not null,

  -- The grant's own expiry. Rows are useless past it: a proof that has expired
  -- is rejected by the validity-window check before replay is even consulted,
  -- so retaining the nonce buys nothing.
  expires_at  timestamptz not null,
  seen_at     timestamptz not null default now(),

  primary key (audience, nonce)
);

comment on table public.control_proof_nonces is
  'Spent control-proof nonces. Insert-only; a 23505 unique violation IS the '
  'replay signal. Never SELECT-then-INSERT — that reintroduces the race the '
  'primary key exists to remove.';

-- Supports the retention sweep without scanning the whole table.
create index if not exists control_proof_nonces_expires_at_idx
  on public.control_proof_nonces (expires_at);

-- RLS on, with NO policy: this table is server-only.
--
-- Publishable keys map to the `anon` role and ship in the browser bundle
-- (LESSONS S1), so anything reachable under an anon policy is reachable by
-- anyone who views source. An anon INSERT here would let a visitor burn
-- arbitrary nonces and deny service to legitimate proofs; an anon SELECT would
-- expose which proofs have been presented. Enabling RLS with no policy denies
-- both roles, and the server path uses the secret key, which bypasses RLS.
alter table public.control_proof_nonces enable row level security;

-- Retention. Not a cron job here — scheduling belongs with the other jobs, and
-- inventing a schedule in a migration hides it from whoever manages them.
-- The sweep is:
--   delete from public.control_proof_nonces where expires_at < now();
