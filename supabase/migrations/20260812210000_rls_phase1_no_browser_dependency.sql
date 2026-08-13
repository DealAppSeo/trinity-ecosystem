-- RLS phase 1 — revoke anon on the tables nothing in the browser reads.
--
-- The publishable key ships in the JS bundle and maps to the `anon` Postgres
-- role, so an `anon` policy is a public policy. Four tables carried one. This
-- migration handles the two with no client-side dependency; the other two are
-- staged in phase 2 because live components still read them.
--
-- trade_execution_log — 2,866 rows, and the more serious of the two:
--
--   * anon SELECT exposed every trade decision, reason, size, price, slippage,
--     PnL and operator id.
--   * anon INSERT let anyone holding the publishable key **write rows into the
--     trade execution log**. That is the record the guardrail story rests on —
--     2,851 refusals — and it was forgeable by anyone who viewed source.
--
-- Neither policy has a legitimate consumer: every writer in the codebase goes
-- through getSupabaseAdmin() (lib/trusttrader/trade_pipeline.ts), which uses the
-- service key and bypasses RLS, and no component or page references the table.
--
-- agent_repid — 87 rows, read by nothing in the browser; written by
-- lib/trust/BFTEngine.ts through the service key. The existing policy covers
-- {anon, authenticated, service_role}; this narrows it to drop anon while
-- leaving signed-in access intact.
--
-- Safe to apply ahead of a deploy: no shipped code path depends on either.

-- ── trade_execution_log ──────────────────────────────────────────────────────
drop policy if exists trade_execution_log_anon_select on public.trade_execution_log;
drop policy if exists trade_execution_log_anon_insert on public.trade_execution_log;

-- Signed-in read stays available for future in-app use. Writes remain
-- service-key only — there is deliberately no INSERT policy for any browser
-- role, so the audit trail cannot be written from a client.
drop policy if exists trade_execution_log_authenticated_select on public.trade_execution_log;
create policy trade_execution_log_authenticated_select
  on public.trade_execution_log for select to authenticated using (true);

-- ── agent_repid ──────────────────────────────────────────────────────────────
drop policy if exists "Enable read for anon" on public.agent_repid;

drop policy if exists agent_repid_authenticated_select on public.agent_repid;
create policy agent_repid_authenticated_select
  on public.agent_repid for select to authenticated using (true);
