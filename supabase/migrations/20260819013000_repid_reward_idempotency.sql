-- 20260819013000_repid_reward_idempotency.sql
--
-- DELIBERATELY UNAPPLIED. Same posture as
-- 20260813210000_agent_repid_earned_observations.sql and
-- 20260815190000_work_seat_event_types.sql: written here, applied by Sean.
--
-- WHAT IT FIXES
--
-- `app/api/trustrails/pay/route.ts` step 6 calls `KYAValidator.updateRepID`,
-- which writes `repid_score` AND recomputes `repid_tier` AND rewrites both
-- spending limits in one statement. It takes an arbitrary signed delta with no
-- key and no constraint, so replaying one accepted payment pays the reward
-- again and raises the ceiling on the next request. N calls are +10N.
--
-- WHY HERE AND NOT A NEW TABLE
--
-- The idempotency key already exists and is already unique:
-- `kya_compliance_receipts.receipt_id` carries
-- `kya_compliance_receipts_receipt_id_key` (verified live 2026-08-19), and the
-- receipt is written at step 4 of the same request, before the reward at step 6.
-- A new table would add a second identifier for a payment that already has one,
-- and two identifiers for one thing is a defect this repo has logged three times.
--
-- These two columns turn that existing unique row into the claim:
--
--   UPDATE kya_compliance_receipts
--      SET repid_reward_delta = $2, repid_reward_at = now()
--    WHERE receipt_id = $1 AND repid_reward_at IS NULL
--
-- One statement, one locked row. Two concurrent requests cannot both match
-- `repid_reward_at IS NULL` — one updates one row and the other updates zero.
-- A SELECT-then-UPDATE has no such property and is the shape being avoided.
--
-- UNTIL THIS IS APPLIED
--
-- `lib/trustshell/reward-idempotency.ts` returns `store-absent` on 42703
-- (undefined_column) and the payment path WITHHOLDS the reward, reporting
-- `needsOperator`. That is deliberate: a reward that cannot be recorded cannot be
-- paid exactly once, and paying it anyway is the bug. It withholds something that
-- currently never fires — the reward already requires an evaluated, passed
-- consensus and a chain-confirmed settlement, and no observed environment
-- produces both.
--
-- SAFETY
--
-- Additive only. Both columns are nullable with no default, so every existing row
-- reads as "never rewarded", which is true — no reward has ever been recorded
-- anywhere. No backfill, no rewrite, no lock beyond the catalog update.
--
-- REVERSIBLE: `ALTER TABLE public.kya_compliance_receipts
--              DROP COLUMN repid_reward_delta, DROP COLUMN repid_reward_at;`
-- Dropping loses the claim history, after which a replay of an already-rewarded
-- receipt would pay again. Do not drop while the payment path is live.

ALTER TABLE public.kya_compliance_receipts
  ADD COLUMN IF NOT EXISTS repid_reward_delta numeric,
  ADD COLUMN IF NOT EXISTS repid_reward_at    timestamptz;

COMMENT ON COLUMN public.kya_compliance_receipts.repid_reward_delta IS
  'RepID delta paid for this payment, or NULL if none was ever paid. Written only '
  'by the conditional claim in lib/trustshell/RewardLedger.ts.';

COMMENT ON COLUMN public.kya_compliance_receipts.repid_reward_at IS
  'When the RepID reward was claimed. NULL means unclaimed and is the guard in the '
  'conditional UPDATE — it is what makes the claim idempotent.';

-- Reward lookups are by receipt_id, which is already uniquely indexed, so no new
-- index is needed. A partial index on unclaimed rows was considered and rejected:
-- the claim always resolves a single row by its unique key, so the planner never
-- scans for NULLs and the index would be pure write cost.
