-- 20260817162647_v_agent_earned_observations_add_provenance.sql
--
-- STATUS: ALREADY LIVE. Written to close a repo/database drift, not to apply
-- anything new. Verified 2026-08-17 via `pg_get_viewdef('v_agent_earned_
-- observations', true)` against the live project (qnnpjhlxljtqyigedwkb) — this
-- file's CREATE VIEW is byte-for-byte what is already serving.
--
-- No migration file for this change existed on ANY branch (`git log --all` /
-- `git grep` across every fetched ref, 0 matches) even though the migration
-- version (20260817162647) is the newest entry `mcp__Supabase__list_migrations`
-- returns. Someone applied it directly against the live project without
-- committing the file — plausibly PR #94's own investigation, whose body
-- describes this exact change ("Smallest unblock: one line in the view
-- projecting `(metadata->>'quorum_providers_used')::int`") as NOT YET DONE,
-- which is now stale: it is done, just untracked. Reproducing the database
-- from `supabase/migrations/` today would NOT recreate this column, and the
-- next `supabase db reset` or fresh environment would silently regress to the
-- six-column view PR #94 was written against. This file is the fix for THAT.
--
-- WHY THE COLUMN MATTERS. `repid_score_events.metadata->>'quorum_providers_
-- used'` is the only live record of whether a HAL verdict consulted a
-- verification provider before it was issued — Gate 2 (issuer staking) and
-- every consumer of the 'integrity' signal need it to tell earned evidence
-- from unearned. Before this column, `v_agent_earned_observations` exposed the
-- outcome (`success = hallucination_caught IS NOT TRUE`) with no way to ask
-- whether the outcome was verified at all.
--
-- WHAT THIS DOES NOT ESTABLISH. Projecting the column is not consuming it.
-- `EarnedMetricsRepo.ts` still reads only `signal, observed_at, success,
-- domain, value_ms` — see the check:observation-identity gate for the current
-- .select() list — so `veritasCatchRate` today counts every row that reaches
-- this view as equally earned, provenance column or not. Measured 2026-08-17:
-- ~44,995 HAL_SCORE_EVENT rows in the 120-day observation window carry NO
-- provenance signal at all (neither this column nor the nested
-- `hal_signals.providers_used` a pre-2026-06-04 code path used instead), all
-- read as `success = true`, and account for 16-19% of decayed evidence weight
-- for every real active production agent — a 10-12 percentage-point inflation
-- of veritasCatchRate. That consumer-side gap is unaffected by this file and
-- is reported on PR #94, whose `verdict-provenance.ts` is the natural place to
-- decide how a NULL (this column) vs. an explicit 0 (the nested field) should
-- each be treated.
--
-- ROLLBACK: restore the six-column definition from
-- `20260813210000_agent_repid_earned_observations.sql`'s prior state, or:
--     -- (no down migration recorded for the original view; this file only
--     -- adds a column, so dropping it is:)
--     create or replace view public.v_agent_earned_observations as
--       -- the SELECT below with the final column and its trailing comma removed
--
-- VERIFY (expect the 7th column to exist and to be NULL wherever the source
-- row's metadata lacks the key, never coerced to 0):
--     select column_name from information_schema.columns
--       where table_name = 'v_agent_earned_observations' order by ordinal_position;

create or replace view public.v_agent_earned_observations as
  select
    e.agent_id,
    'integrity'::text as signal,
    e.created_at as observed_at,
    e.hallucination_caught is not true as success,
    e.task_domain as domain,
    null::integer as value_ms,
    (e.metadata ->> 'quorum_providers_used'::text)::integer as quorum_providers_used
  from repid_score_events e
  where e.agent_id is not null

  union all

  select
    s.provider_agent_id as agent_id,
    'x402'::text as signal,
    s.created_at as observed_at,
    s.status = 'settled'::text as success,
    null::text as domain,
    null::integer as value_ms,
    null::integer as quorum_providers_used
  from x402_settlements s
  where s.provider_agent_id is not null and s.is_simulated is not true

  union all

  select
    f.agent_id,
    'x402'::text as signal,
    f.created_at as observed_at,
    false as success,
    null::text as domain,
    null::integer as value_ms,
    null::integer as quorum_providers_used
  from x402_settlement_failures f
  where f.agent_id is not null

  union all

  select
    r.id as agent_id,
    'bft'::text as signal,
    coalesce(b.evaluated_at, b.created_at) as observed_at,
    b.consensus_reached as success,
    null::text as domain,
    null::integer as value_ms,
    null::integer as quorum_providers_used
  from bft_payment_evaluations b
    join repid_agents r on r.agent_name = b.agent_name or r.agent_name = ('trinity-'::text || lower(b.agent_name))
  where b.consensus_reached is not null

  union all

  select
    l.agent_id,
    'latency'::text as signal,
    l.created_at as observed_at,
    true as success,
    l.task_hint as domain,
    l.latency_ms as value_ms,
    null::integer as quorum_providers_used
  from llm_call_log l
  where l.agent_id is not null and l.latency_ms is not null;

comment on view public.v_agent_earned_observations is
  'Earned evidence for EarnedMetrics: integrity (HAL), x402, bft, latency. '
  'quorum_providers_used (added 2026-08-17) carries provenance for the '
  'integrity arm only — NULL means the source row recorded no provider-attempt '
  'signal under EITHER known key (top-level or nested in hal_signals), not '
  'that zero were used; treat NULL and 0 as distinct until a consumer decides '
  'otherwise. See lib/trustshell/verdict-provenance.ts (PR #94).';
