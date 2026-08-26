-- 20260826015050_reap_expired_hitl_requests.sql
--
-- The HITL escalation queue has no consumer for its own expiry column.
--
-- ── THE DEFECT ───────────────────────────────────────────────────────────
--
-- `trinity_hitl_requests` got `expires_at` in migration
-- `20260527...v16_hitl_requests_expires_at`. Nothing since has ever read it.
-- Not a trigger, not a cron job, not an application route — `grep` across the
-- whole tree for the table name outside this file returns two BFT routes that
-- read an unrelated `hitl_required` boolean flag, and zero writers.
--
-- Measured 2026-08-26: **259,456 of 259,457 rows are `status='pending'`, and
-- every single one already has `expires_at < now()`.** One row was ever
-- approved, on 2026-02-08 — the same day the table's oldest row was requested.
-- The daily volume shows this was not a live, ongoing flood: 7,000–11,000
-- rows/day from 2026-07-12 through 2026-07-28 (the same window as the
-- documented mid-July Railway outage), then a trickle of 1–3/day since. The
-- flood already stopped. The backlog just never drained, because nothing was
-- built to drain it.
--
-- ── THE FIX, MIRRORING AN EXISTING PATTERN IN THIS SCHEMA ──────────────────
--
-- `trinity_reap_expired_claims()` (pg_cron jobid 14, every 5 minutes) does
-- exactly this for `trinity_tasks.expires_at`: free what a lease no longer
-- protects, log it, move on. This function is that pattern applied to HITL:
--
--   * Only rows with `status = 'pending'` AND `expires_at < now()`.
--     `approved`/`rejected`/anything else is a decision already made and is
--     never touched.
--   * Sets `status = 'expired'` — a NEW terminal status, not a deletion and
--     not a fabricated decision. `trinity_hitl_requests.status` has no CHECK
--     constraint, so this needs no schema change to be valid, but it is
--     documented here because a value invented in a function body and nowhere
--     else is exactly the kind of thing this repo's LESSONS keeps finding.
--   * Every row closed is recorded in `trinity_changelog`, WITH
--     `affected_ids` and a `rollback_sql` string that undoes exactly this run
--     — the schema already supports full reversibility and the existing
--     reaper doesn't use it; this one does.
--
-- ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────
--
-- It does not approve or reject anything — an expired request is a request
-- nobody answered in time, not a request that was answered "no". It does not
-- touch `decision_metadata` or `resolved_at`, which stay NULL, so a row read
-- later is distinguishable as "expired unseen" rather than "resolved".
-- It does not backfill `expires_at` for the one row that might lack it — none
-- do, per the measurement above, so there is nothing to backfill.
--
-- ROLLBACK (the function):
--     drop function if exists public.reap_expired_hitl_requests(integer);
--     select cron.unschedule(<jobid>);  -- see verify query below for jobid
--
-- ROLLBACK (a specific run): `trinity_changelog.rollback_sql` for that row's
-- 'hitl_reaper' change_type entry re-opens exactly the rows it closed.
--
-- VERIFY AFTER APPLYING:
--     select jobid, schedule, command from cron.job where command ilike '%reap_expired_hitl%';
--     select public.reap_expired_hitl_requests();  -- returns the count closed
--     select status, count(*) from trinity_hitl_requests group by status;

begin;

-- `p_batch_size` exists because the first production run of this function hit
-- exactly the problem it was written to fix: 259,456 qualifying rows in one
-- UPDATE timed out the statement. A bounded batch keeps every call (the daily
-- cron tick, and the one-time historical drain that needed ~50 manual calls to
-- close the backlog this migration was written for) cheap and independent —
-- one call, one transaction, one timeout budget, however large the backlog.
create or replace function public.reap_expired_hitl_requests(p_batch_size integer default 5000)
returns integer
language plpgsql
set search_path to 'public', 'pg_catalog'
as $function$
declare
  reaped integer;
  ids uuid[];
  ids_text text;
begin
  if p_batch_size is null or p_batch_size < 1 then
    raise exception 'p_batch_size must be a positive integer, got %', p_batch_size;
  end if;

  select array_agg(id) into ids from (
    select id
      from public.trinity_hitl_requests
     where status = 'pending'
       and expires_at is not null
       and expires_at < now()
     order by expires_at
     limit p_batch_size
  ) batch;

  if ids is null then
    return 0;
  end if;

  update public.trinity_hitl_requests
     set status = 'expired'
   where id = any(ids);
  get diagnostics reaped = row_count;

  if reaped > 0 then
    -- Quoted, comma-joined UUID literals for the rollback string — NOT
    -- array_to_string(ids, ','), which emits bare unquoted UUIDs that are not
    -- valid SQL literals on their own.
    select string_agg(quote_literal(u), ',') into ids_text from unnest(ids) as u;

    insert into public.trinity_changelog(
      change_date, change_type, description, affected_ids, rollback_sql, changed_by
    )
    values (
      now(),
      'hitl_reaper',
      'reap_expired_hitl_requests closed ' || reaped || ' pending request(s) whose expires_at had passed',
      ids,
      'update public.trinity_hitl_requests set status = ''pending'' where id in (' ||
        ids_text || ') and status = ''expired'';',
      'reap_expired_hitl_requests'
    );
  end if;

  return reaped;
end;
$function$;

comment on function public.reap_expired_hitl_requests() is
  'Closes trinity_hitl_requests rows whose expires_at has passed while still pending, setting status=''expired''. Never approves, rejects, or deletes. Logs every run to trinity_changelog with a working rollback_sql. Added 2026-08-26 after 259,456 such rows were found with no consumer for the expiry column at all.';

-- Daily, matching prune_trinity_logs_retention's cadence (jobid 6) — HITL
-- escalations are not a hot-path lease like trinity_tasks.expires_at (reaped
-- every 5 minutes by trinity_reap_expired_claims), so a slower cadence is
-- correct here and cheaper.
select cron.schedule(
  'reap-expired-hitl-requests',
  '0 8 * * *',
  $$select public.reap_expired_hitl_requests();$$
);

commit;
