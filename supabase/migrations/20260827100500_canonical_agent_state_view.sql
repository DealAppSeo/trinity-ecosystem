-- ONE surface for "what is this agent doing". Applied 2026-08-27.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THIS EXISTS
-- ─────────────────────────────────────────────────────────────────────────────
-- A census on 2026-08-27 found ~20 base tables and ~16 views answering "is this
-- agent alive". They disagreed AT THE SAME INSTANT:
--
--   agent_heartbeat.status = 'online' ............ 12 of 12 live
--   v_fleet_liveness_strict.is_live_probe ........ 12 of 12 live
--   v_fleet_truth.is_live ........................  0 of 12 live
--   v_fleet_truth_realwork.canonical_is_live .....  0
--   v_fleet_truth_realwork.realwork_is_live ......  0
--   v_fleet_liveness_strict.is_live_strict .......  0
--
-- The roster itself had four answers: trinity_agents 8, agent_status 9,
-- agent_heartbeat 12, agents 12, trinity_heartbeat 16 -- and trinity_heartbeats
-- is an EMPTY table one letter away from a populated one.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ROOT CAUSE: one missing branch, not missing data
-- ─────────────────────────────────────────────────────────────────────────────
-- v_fleet_truth computes is_live as:
--     CASE WHEN h.last_ping    > now()-'10 min' THEN true
--          WHEN w.last_work_at > now()-'10 min' THEN true
--          ELSE false                                        <-- probe never read
--     END
-- while its OWN liveness_signal column DOES consult the probe and returns
-- 'probe_only'. So the view knew the agent answered HTTP 200 and still reported
-- is_live = false.
--
-- Agent-side heartbeat writes were deliberately removed 2026-07-17, starving
-- last_ping by ~40 days, so branches 1 and 2 can never fire and every agent
-- falls through to ELSE false. Absence of a signal somebody turned off is not
-- evidence of death. Measured the same day: all 12 agents probe_ok = true,
-- http 200, minutes_since_probe 1.8.
--
-- The cost of that one branch: an index entry reading "the fleet is DOWN on
-- Railway, manual redeploy required" stood for twelve days. A redeploy would
-- have changed nothing and would have looked like a fix.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THIS IS NOT A SEVENTH TRUTH VIEW
-- ─────────────────────────────────────────────────────────────────────────────
-- Six "truth" views already exist, each one somebody's fix for the previous
-- one's lie. v_fleet_truth_realwork carries BOTH canonical_is_live and
-- realwork_is_live -- a second opinion shipped instead of a correction. Adding
-- a seventh boolean would be that failure mode again.
--
-- This answers a DIFFERENT QUESTION. The others answer "is it up" (a boolean).
-- This answers "what is it doing" (a state), from agent_health_probes columns
-- that were already written every ~5 minutes and that nobody surfaced:
-- loop_count, last_iteration_at, current_task_id.
--
-- Those distinguish idle-but-healthy from running-but-wedged. No existing
-- surface can, which is precisely why every session invented its own word --
-- asleep, zombie, awake-but-not-working -- and why the question kept recurring.
--
-- NEVER a bare boolean, and NEVER a self-reported status column: an agent that
-- has died cannot write status='offline', so a status column is structurally
-- incapable of reporting the failure that matters.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT THIS MIGRATION DOES NOT DO
-- ─────────────────────────────────────────────────────────────────────────────
-- It drops nothing. The ~35 legacy surfaces stay until a reference census says
-- which are load-bearing; dropping one that production reads breaks it
-- silently. Deletion is a separate, evidence-led change.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view public.v_agent_state as
with bounds as (
  -- Probes land ~every 5 min and loop iterations ~every 3 min (both MEASURED
  -- 2026-08-27). 15 min = three missed probes before a reading stops being
  -- trusted. Named here rather than inlined so the threshold is auditable and
  -- changing it is one edit, not six.
  select interval '15 minutes' as fresh
),
probe as (
  select distinct on (p.agent_name)
         p.agent_name, p.ok, p.http_status, p.probed_at,
         p.loop_count, p.last_iteration_at, p.current_task_id,
         p.uptime_sec, p.latency_ms, p.error, p.code_version
    from public.agent_health_probes p, bounds b
   where p.probed_at > now() - (b.fresh * 4)
   order by p.agent_name, p.probed_at desc
)
select
  pr.agent_name,

  -- THE ANSWER. Five outcomes, never two. 'unknown' is a real outcome and must
  -- never be collapsed into 'down' -- "we did not look" is not "it failed".
  -- That collapse is the defect this whole codebase keeps re-encountering.
  case
    when pr.agent_name is null or pr.probed_at is null            then 'unknown'
    when pr.probed_at <= now() - b.fresh                          then 'unknown'
    when pr.ok is not true                                        then 'down'
    when pr.last_iteration_at is null                             then 'unknown'
    when pr.last_iteration_at <= now() - b.fresh                  then 'wedged'
    when pr.current_task_id is not null                           then 'working'
    else                                                               'idle'
  end as state,

  -- WHICH COLUMN PROVED IT. A state without its evidence is an assertion, and
  -- an assertion is what got the fleet declared dead for twelve days.
  case
    when pr.probed_at is null or pr.probed_at <= now() - b.fresh  then 'no fresh probe'
    when pr.ok is not true                                        then 'probe http ' || coalesce(pr.http_status::text,'?')
    when pr.last_iteration_at is null                             then 'probe ok, loop not reported'
    when pr.last_iteration_at <= now() - b.fresh                  then 'probe ok, loop stalled'
    when pr.current_task_id is not null                           then 'loop advancing, task held'
    else                                                               'loop advancing, no task held'
  end as evidence,

  pr.ok                as probe_ok,
  pr.http_status       as probe_http_status,
  pr.probed_at,
  round(extract(epoch from now() - pr.probed_at)/60.0, 1)         as minutes_since_probe,

  pr.loop_count,
  pr.last_iteration_at,
  round(extract(epoch from now() - pr.last_iteration_at)/60.0, 1) as minutes_since_iteration,
  pr.current_task_id,

  pr.uptime_sec,
  round(pr.uptime_sec / 3600.0, 1)                                as uptime_hours,
  pr.latency_ms,
  pr.code_version,
  pr.error
from probe pr cross join bounds b;

comment on view public.v_agent_state is
  'CANONICAL. What is each agent DOING: working | idle | wedged | down | unknown, '
  'with the column that proved it. Built 2026-08-27 from agent_health_probes '
  '(loop_count, last_iteration_at, current_task_id) - all pre-existing and fed '
  'every ~5min. Read this, not a status column and not one of the ~36 legacy '
  'liveness surfaces. unknown is a real outcome: never collapse it into down.';
