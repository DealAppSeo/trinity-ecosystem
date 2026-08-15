-- 20260815190000_work_seat_event_types.sql
--
-- STATUS: WRITTEN, NOT APPLIED. Left for Sean.
--
-- Adds the four doer/checker event types that `repid_score_events` has no
-- vocabulary for, so a verified unit of work can be recorded against the agent
-- that did it.
--
-- WHY IT IS REQUIRED, not a nicety.
--
-- The live ledger holds 152,152 rows across 16 distinct `event_type` values
-- [VERIFIED 2026-08-15]. 147,717 of them are `HAL_SCORE_EVENT`. There is no
-- event type meaning "this agent completed work that an independent checker
-- verified", so a doer whose work passes every agreed criterion earns nothing,
-- and failed work cannot be charged against them either. The closed set
-- measures judging, settling and latency — not doing.
--
-- The CHECK constraint is what makes this a migration rather than a code
-- change: `repid_score_events_event_type_check` enumerates 36 permitted
-- literals, and an INSERT of anything else fails. That is not hypothetical —
-- it is why the peer-verify writer has produced **zero rows**: no `PEER_VERIFY`
-- literal appears in the list. A writer whose event type is not in the CHECK
-- does not write, and the failure is a constraint violation at insert time
-- rather than anything visible in a dashboard.
--
-- WHAT THIS DELIBERATELY DOES NOT DO.
--
--   * It sets no delta and no policy. Deltas are supplied by the writer. The
--     correct magnitude for verified work is UNMEASURED, and this repo's
--     standing practice is that a number nothing justifies is worse than no
--     number plus an honest gap — the same reason `maxDisagreement` has no
--     default in contracted-evaluator.ts. For scale, the live HAL band is only
--     three values: 0 (79,390 rows), -10 (68,322) and +1 (5 rows in total).
--     A positive HAL delta has fired five times in 147,717 events, so any
--     proposal to award more than +1 for verified work is a NEW policy and must
--     be argued on its own evidence, not smuggled in as "matching HAL".
--
--   * It does NOT add a `PEER_VERIFY*` literal. That would fix the dead
--     peer-verify writer in the same statement, which is tempting and is why it
--     is called out here — but the exact literal that writer emits lives in
--     `DealAppSeo/repid-engine`, which is not in this session's scope. Adding a
--     guessed literal would leave the writer just as dead while making the
--     constraint look repaired. **Confirm the string from the writer, then add
--     it in a follow-up.**
--
--   * It does NOT touch `ReputationSignal` in
--     `lib/trustshell/identity/reputation-transition.ts`. That is a different
--     vocabulary — 7 snake_case values, zero overlap with this one — and it is
--     consumed by the other lane's circuit. Growing it is a cross-lane
--     decision, not a migration.
--
-- WHAT STILL BLOCKS AN ACTUAL ROW, after this is applied.
--
--   1. `agent_id` and `counterparty_agent_id` are FKs to `repid_agents(id)`,
--      which are uuids. A signed verdict names a **DID**. There is no mapping
--      from DID to `repid_agents.id` anywhere in the schema —
--      `identity_claims` and `sandbox_repid_credentials` both hold **0 rows**.
--      Until that mapping exists, a verdict cannot name the agent it is about.
--   2. No writer exists in `trinity-ecosystem`; this repo only reads the table.
--   3. The Trinity fleet has been down since 2026-07-17, so nothing is
--      currently producing verdicts to record.
--
-- Applying this migration is therefore safe and inert on its own: it widens a
-- CHECK and writes no rows.
--
-- The `counterparty_not_self` CHECK already on the table
-- (`counterparty_agent_id IS NULL OR counterparty_agent_id <> agent_id`) is
-- what enforces doer ≠ checker at the database level. It is deliberately left
-- exactly as it is: it is the constitutional invariant's last line of defence,
-- and these four event types are the first ones for which it becomes
-- load-bearing rather than incidental.

alter table public.repid_score_events
  drop constraint if exists repid_score_events_event_type_check;

alter table public.repid_score_events
  add constraint repid_score_events_event_type_check
  check (event_type = any (array[
    -- ── existing 36, reproduced verbatim from the live constraint ──────────
    'CHALLENGE_WIN', 'CHALLENGE_LOSS', 'CHALLENGE_DRAW',
    'EPISTEMIC_VIOLATION', 'CONSTITUTIONAL_VIOLATION',
    'PREDICTION_RESOLVE', 'STAKE', 'GENESIS', 'REFERRAL', 'PEACEMAKER',
    'SELF_MONITOR', 'DECAY', 'DORMANCY_DECAY', 'SALE_DROP',
    'MIRROR_TEST_MODE7', 'CONSTITUTIONAL_PASS',
    'CODE_CONTRIBUTION', 'WORKFLOW_CONTRIBUTION', 'TOOL_PIONEER',
    'AGENT_TEACHING', 'AUDIT_CONTRIBUTION', 'CONSTITUTIONAL_AUDIT',
    'MCP_TOOL_CALL', 'LATENCY_OPPORTUNITY_LEARNING',
    'BOUNTY_CLAIM', 'BOUNTY_COMPLETE', 'BOUNTY_VERIFY',
    'HAL_SCORE_EVENT', 'PAPER_TRADE_OUTCOME',
    'VALIDATION_PASSED', 'VALIDATION_FAILED',
    'VALIDATOR_REWARD', 'VALIDATOR_PENALTY',
    'SERVICE_FULFILLED', 'SERVICE_SATISFIED',
    'x402_value_delivered',

    -- ── new: the doer seat ────────────────────────────────────────────────
    -- Work an independent checker verified against a pre-execution contract.
    'WORK_VERIFIED',
    -- Work that failed a criterion the doer had agreed to in advance.
    'WORK_DISPUTED',

    -- ── new: the checker seat ─────────────────────────────────────────────
    -- A verdict an outside observation later agreed with.
    'VERIFY_CONFIRMED',
    -- A verdict an outside observation later contradicted — the checker
    -- passed work that was not good. This is the one that makes the verifier
    -- seat accountable rather than merely present.
    'VERIFY_FALSE_PASS'
  ]));

comment on constraint repid_score_events_event_type_check
  on public.repid_score_events is
  'Permitted event types. WORK_*/VERIFY_* added 2026-08-15 for the doer and '
  'checker seats; deltas are the writer''s, and doer != checker is enforced '
  'separately by repid_score_events_counterparty_not_self.';
