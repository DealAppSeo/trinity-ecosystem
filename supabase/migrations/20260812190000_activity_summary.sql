-- trustrails_activity_summary() — one round trip for the operations panel.
--
-- 171,000+ rows of real operational history exist across these tables and the
-- dashboard surfaced 24 of them, because the two tables it reads
-- (agent_kya_registry, kya_compliance_receipts) hold 12 rows each. The largest
-- of the unsurfaced tables has 138k rows, so the aggregation has to happen in
-- the database — PostgREST cannot GROUP BY, and pulling the rows to the app to
-- count them would move tens of megabytes per page load.
--
-- SECURITY DEFINER because the caller may be an authenticated user whose RLS
-- view of these tables is (deliberately) narrower than the aggregate. Only
-- counts and coarse breakdowns are returned — no row bodies, no free-text
-- payloads beyond a normalised refusal-reason class. search_path is pinned so
-- the definer's rights cannot be redirected to an attacker-controlled schema.
--
-- EXECUTE is granted to authenticated and service_role only; anon is revoked.

create or replace function public.trustrails_activity_summary()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with trade_totals as (
    select
      count(*)                                                      as total,
      count(*) filter (where decision = 'REFUSED')                  as refused,
      -- The column carries both 'EXECUTED' and 'EXECUTE'; treat them as one
      -- rather than silently under-reporting executions.
      count(*) filter (where decision in ('EXECUTED', 'EXECUTE'))   as executed,
      count(*) filter (where reason ilike '%Pythagorean Comma%')    as comma_refusals,
      count(*) filter (where reason ilike '%integration-test%')     as test_fixtures,
      count(distinct asset)                                         as assets,
      max(created_at)                                               as last_at
    from trade_execution_log
  ),
  -- Refusal reasons embed the measured dissonance ("Dissonance 0.5546 > 0.0195
  -- — Pythagorean Comma threshold exceeded"), so grouping the raw string yields
  -- hundreds of near-duplicates. Collapse to the reason class.
  refusal_reasons as (
    select class, count(*) as n from (
      select case
               when reason ilike '%Pythagorean Comma%'  then 'Pythagorean Comma threshold exceeded'
               when reason ilike '%integration-test%'   then 'Integration test fixture'
               when reason is null or reason = ''       then 'Unspecified'
               else left(reason, 70)
             end as class
      from trade_execution_log
      where decision = 'REFUSED'
    ) c
    group by class order by n desc limit 6
  ),
  trade_severity as (
    select coalesce(comma_severity, 'unrecorded') as k, count(*) as n
    from trade_execution_log group by 1 order by n desc limit 5
  ),
  log_totals as (
    select
      count(*)                                                              as total,
      count(*) filter (where created_at > now() - interval '24 hours')      as last_24h,
      count(*) filter (where created_at > now() - interval '7 days')        as last_7d,
      count(distinct coalesce(agent, agent_name))                           as agents,
      max(created_at)                                                       as last_at
    from trinity_agent_logs
  ),
  top_agents as (
    select coalesce(agent, agent_name, 'unattributed') as agent, count(*) as n
    from trinity_agent_logs group by 1 order by n desc limit 8
  ),
  signal_totals as (
    select count(*) as total, count(distinct signal_name) as names,
           count(distinct source) as sources, max(fetched_at) as last_at
    from trusttrader_signals
  ),
  top_signals as (
    select signal_name, count(*) as n, round(avg(normalized)::numeric, 3) as avg_normalized
    from trusttrader_signals group by 1 order by n desc limit 8
  ),
  xllm_totals as (
    select count(*) as total,
           round(avg(agreement_score)::numeric, 4) as avg_agreement,
           count(*) filter (where comma_veto) as vetoes,
           count(distinct provider_1) + count(distinct provider_2) as provider_slots,
           max(created_at) as last_at
    from cross_llm_comparisons
  ),
  vault_totals as (
    select count(*) as total,
           count(*) filter (where denied_reason is not null) as denied,
           max(accessed_at) as last_at
    from vault_access_log
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'guardrail', (select to_jsonb(t) from trade_totals t)
                 || jsonb_build_object(
                      'topReasons', coalesce((select jsonb_agg(to_jsonb(r)) from refusal_reasons r), '[]'::jsonb),
                      'severity',   coalesce((select jsonb_agg(to_jsonb(s)) from trade_severity s), '[]'::jsonb)
                    ),
    'agents',    (select to_jsonb(l) from log_totals l)
                 || jsonb_build_object(
                      'top', coalesce((select jsonb_agg(to_jsonb(a)) from top_agents a), '[]'::jsonb)
                    ),
    'signals',   (select to_jsonb(s) from signal_totals s)
                 || jsonb_build_object(
                      'top', coalesce((select jsonb_agg(to_jsonb(t)) from top_signals t), '[]'::jsonb)
                    ),
    'crossLlm',  (select to_jsonb(x) from xllm_totals x),
    'vault',     (select to_jsonb(v) from vault_totals v)
  );
$$;

revoke all on function public.trustrails_activity_summary() from public, anon;
grant execute on function public.trustrails_activity_summary() to authenticated, service_role;

comment on function public.trustrails_activity_summary() is
  'Aggregate counts for the dashboard operations panel. Returns no row bodies. '
  'Used by app/api/trustrails/activity.';
