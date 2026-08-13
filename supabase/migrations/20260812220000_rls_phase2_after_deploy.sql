-- RLS phase 2 — revoke anon on the last two public tables.
--
-- ⚠️  DO NOT APPLY BEFORE THE ACCOMPANYING CODE IS DEPLOYED.
--
-- Phase 1 (20260812210000) handled trade_execution_log and agent_repid, which
-- nothing in the browser touched, so it was safe to apply immediately. These
-- two are different: until the code in this same commit is live, the deployed
-- dashboard reads them from the browser with the publishable key, which is the
-- `anon` role. Applying this first would blank the agent grid and the receipt
-- feed on production.
--
-- The code change that makes this safe:
--   * AgentRepIDGrid now loads from /api/trustrails/agents (service key, six
--     columns) instead of a browser `select('*')`.
--   * /api/trustrails/receipts and /agents both require authentication.
--
-- Realtime is why these become `authenticated` policies rather than being
-- dropped outright. All three dashboard components subscribe to
-- postgres_changes on these tables, and Realtime enforces RLS: with no policy
-- the subscription does not error, it simply stops delivering — the dashboard
-- would look fine and quietly stop updating. Scoping to `authenticated` keeps
-- live refresh working for signed-in users, because supabase-js sends the
-- session token once a user logs in.
--
-- After this, a signed-out visitor sees the landing page, the demos, and the
-- aggregate system trust score (which is aggregate-only and deliberately stays
-- public), but not per-agent rows or individual receipts. That is a product
-- change as well as a security one, and it is intentional: the publishable key
-- is in the JS bundle, so `{anon} USING (true)` on these tables meant
-- `railway_url`, `recipient_address`, `fireblocks_preauth_id` and every
-- spending limit were readable by anyone who viewed source.
--
-- Rollback, if a signed-out dashboard turns out to be required:
--   create policy agent_kya_registry_anon_select
--     on public.agent_kya_registry for select to anon using (true);
--   create policy kya_compliance_receipts_anon_select
--     on public.kya_compliance_receipts for select to anon using (true);
-- Prefer instead adding an aggregate-only public endpoint, as
-- /api/trustrails/system-trust already is.

-- ── agent_kya_registry ───────────────────────────────────────────────────────
drop policy if exists agent_kya_registry_anon_select on public.agent_kya_registry;

drop policy if exists agent_kya_registry_authenticated_select on public.agent_kya_registry;
create policy agent_kya_registry_authenticated_select
  on public.agent_kya_registry for select to authenticated using (true);

-- ── kya_compliance_receipts ──────────────────────────────────────────────────
drop policy if exists kya_compliance_receipts_anon_select on public.kya_compliance_receipts;

drop policy if exists kya_compliance_receipts_authenticated_select on public.kya_compliance_receipts;
create policy kya_compliance_receipts_authenticated_select
  on public.kya_compliance_receipts for select to authenticated using (true);

-- Writes stay service-key only on both tables: no INSERT/UPDATE/DELETE policy
-- exists for anon or authenticated, and RLS is enabled, so a browser client
-- cannot write a registry entry or forge a compliance receipt.
