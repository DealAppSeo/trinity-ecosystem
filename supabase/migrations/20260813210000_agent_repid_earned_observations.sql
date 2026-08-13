-- 20260813210000_agent_repid_earned_observations.sql
--
-- STATUS: WRITTEN, NOT APPLIED. Left for Sean.
--
-- Adds the observation count that `agent_repid.earned_score` needs in order to
-- mean anything when it is loaded back.
--
-- WHY IT IS REQUIRED, not a nicety.
--
-- The portable trust harness ranks experts on an EARNED score that is shrunk
-- toward a neutral prior in proportion to how little evidence stands behind it:
--
--     confidence  = n / (n + k)          -- k defaults to 20
--     earnedScore = confidence * observed + (1 - confidence) * prior
--
-- `n` is the number of recorded outcomes. `agent_repid` currently stores the
-- score and not `n`, so a ledger restored from this table comes back with
-- confidence 0 for every expert, and every earned score collapses to the prior.
-- A fleet with years of history would reload as though it had never run a task,
-- and the failure is silent — the load succeeds, the rows are all present, and
-- every ranking is quietly wrong.
--
-- `lib/trustshell/persistence/supabase-reputation-store.ts` therefore refuses
-- to load or save until this column exists, rather than defaulting `n` to 0.
--
-- WHY NOT REUSE AN EXISTING COUNTER. `total_challenges_made`,
-- `total_trades` and `conductor_sessions` all count something real and none of
-- them counts routing outcomes. Borrowing one would make confidence a function
-- of an unrelated activity level — an expert that trades often would look
-- well-evidenced as a router regardless of how it performed. That is the same
-- defect the earned/perceived split exists to prevent, reintroduced through the
-- schema.
--
-- SAFETY. Additive only: one nullable integer column plus a check constraint.
-- No existing column is read, written, dropped or retyped, and no policy
-- changes. Existing rows get NULL, which the store skips — it does not treat
-- NULL as 0, precisely because 0 is a measurement and NULL is not.
--
-- ROLLBACK:
--     alter table public.agent_repid drop column if exists earned_observations;
--
-- VERIFY AFTER APPLYING (expect 87 rows, all null on day one):
--     select count(*) as rows,
--            count(earned_observations) as with_observations
--       from public.agent_repid;

begin;

alter table public.agent_repid
  add column if not exists earned_observations integer;

comment on column public.agent_repid.earned_observations is
  'Number of recorded outcomes behind earned_score. Required to rebuild the '
  'trust harness confidence weight n/(n+k); without it a restored ledger has '
  'confidence 0 and every earned_score collapses to the prior. NULL means '
  'never measured, which is deliberately distinct from 0.';

-- A negative count is not a low count, it is a bug upstream. Reject it at the
-- boundary rather than letting it produce a negative confidence.
alter table public.agent_repid
  drop constraint if exists agent_repid_earned_observations_nonneg;

alter table public.agent_repid
  add constraint agent_repid_earned_observations_nonneg
  check (earned_observations is null or earned_observations >= 0);

commit;

-- ---------------------------------------------------------------------------
-- NOT DONE BY THIS MIGRATION, on purpose:
--
--   * No backfill. There is no honest source for a historical observation
--     count — inventing one would manufacture confidence that was never
--     earned, which is the exact failure the harness exists to prevent. Rows
--     stay NULL until something records an outcome against them.
--
--   * No NOT NULL and no default. A default of 0 would assert "measured zero
--     times" for every row that has simply never been touched by the ledger,
--     and the store relies on being able to tell those apart.
--
--   * No RLS change. `agent_repid` already has service_role ALL and
--     authenticated SELECT; the store writes with the admin client, so nothing
--     needs widening. Note that adding this column makes an observation count
--     readable by any authenticated user, which is consistent with the
--     existing SELECT policy on the scores themselves.
