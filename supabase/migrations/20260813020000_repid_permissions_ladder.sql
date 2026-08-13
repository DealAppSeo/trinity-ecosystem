-- 20260813020000_repid_permissions_ladder.sql
--
-- Populates repid_permissions — the autonomy ladder — which has existed with
-- exactly the right shape and ZERO ROWS. Its only consumer,
-- get_conductor_permissions(), therefore returns nothing for every conductor,
-- and has done since the table was created.
--
-- ============================================================================
-- NOT APPLIED. BLOCKED_FOR_SEAN. Read this before running it.
-- ============================================================================
--
-- Applying this file is a live authority expansion, not a schema addition.
-- Verified against the database on 2026-08-13:
--
--   conductor_state holds 8 rows. reputation_score is on a 0..1 scale
--   (min 0.4, max 1.0) — NOT the 0..10000 RepID scale used by
--   agent_kya_registry.repid_score and lib/trustshell/RepIDConfig.ts.
--   get_conductor_permissions() reads conductor_state, so these bands must be
--   0..1. Bands written on the RepID scale would park every conductor in the
--   floor tier forever while looking like a working ladder.
--
--   Under the bands below, the moment this is applied:
--     Observer  (4)  ANTIGRAV, GCM, NEXUS, TORCH
--     Platinum  (4)  APM, HDM, MEL, VERITAS
--
--   Those four Platinum scores are exactly 1.0 and are not receipt-backed.
--   There are zero session receipts in the system (trustshell_tool_receipts is
--   empty; kya_compliance_receipts was last written 2026-04-01). Promoting an
--   agent on a score with no evidence behind it is the specific failure
--   docs/HARNESS-SPEC.md exists to prevent, so this is Sean's call and not an
--   agent's.
--
--   Nothing in this repo calls get_conductor_permissions(). A caller outside
--   the repo (a Railway service) cannot be ruled out from a sandboxed session,
--   so the blast radius of applying this is UNVERIFIED rather than zero.
--
-- Recommended order: land the session-receipt substrate first, re-derive
-- conductor scores from receipts, then apply this with the fleet paused.
--
-- ROLLBACK:
--   delete from repid_permissions
--    where tier_name in ('Observer','Bronze','Silver','Gold','Platinum');
--
-- ============================================================================
--
-- Band design. The thresholds are not round numbers chosen for looks; each is a
-- constant this system already treats as meaningful, so the ladder inherits
-- whatever justification those constants have rather than inventing its own:
--
--   0.43   hal_veto_threshold      — below this an agent's output is vetoed
--   0.55   hal_block_threshold     — constitutional block
--   0.618  1/phi                   — the BFT consensus threshold
--   0.80   certainty_threshold     — below this a claim must be challenged
--
-- Bands are half-open [min_repid, max_repid), matching the comparison in
-- get_conductor_permissions(). The top band ends at 2.0 — safely past the 1.0
-- ceiling — so the ladder tiles the whole scale with no gap and no float
-- equality edge at exactly 1.0.
--
-- can_modify_config is FALSE at every tier, including Platinum. Config writes
-- are bounded by repid_config's own conductor_tunable/min_value/max_value
-- columns, and that enforcement path is not built. A boolean that grants config
-- authority with nothing enforcing the bounds is worse than no ladder at all.

begin;

insert into repid_permissions (
  tier_name, min_repid, max_repid,
  voting_weight, max_concurrent_tasks, max_subtask_depth, max_entropy_budget,
  can_spawn_subtasks, can_issue_directives, can_modify_config,
  can_propose_changes, can_vote, permissions
) values
  ('Observer', 0.0, 0.43,
   0.0, 1, 0, 100,
   false, false, false, false, false,
   jsonb_build_object(
     'tool_classes',        jsonb_build_array('read'),
     'write_ops_per_session', 0,
     'spend_per_tx_usdc',   0,
     'spend_daily_usdc',    0,
     'irreversible_actions','never — human-gated at every tier',
     'config_keys_writable','none',
     'note',                'Below hal_veto_threshold. Reads and reports; asserts nothing that acts.')),

  ('Bronze', 0.43, 0.55,
   0.25, 2, 0, 250,
   false, false, false, true, false,
   jsonb_build_object(
     'tool_classes',        jsonb_build_array('read','write_reversible'),
     'write_ops_per_session', 50,
     'spend_per_tx_usdc',   0,
     'spend_daily_usdc',    0,
     'irreversible_actions','never — human-gated at every tier',
     'config_keys_writable','none',
     'note',                'May propose; may not spawn, direct, or vote.')),

  ('Silver', 0.55, 0.618,
   0.5, 4, 1, 500,
   true, false, false, true, true,
   jsonb_build_object(
     'tool_classes',        jsonb_build_array('read','write_reversible'),
     'write_ops_per_session', 200,
     'spend_per_tx_usdc',   0,
     'spend_daily_usdc',    0,
     'irreversible_actions','never — human-gated at every tier',
     'config_keys_writable','none',
     'note',                'First tier that may spawn a subtask, at depth 1 only.')),

  ('Gold', 0.618, 0.80,
   1.0, 8, 2, 1000,
   true, true, false, true, true,
   jsonb_build_object(
     'tool_classes',        jsonb_build_array('read','write_reversible','spend_metered'),
     'write_ops_per_session', 1000,
     'spend_per_tx_usdc',   10,
     'spend_daily_usdc',    100,
     'irreversible_actions','never — human-gated at every tier',
     'config_keys_writable','none',
     'note',                'At/above the BFT consensus threshold. May direct other agents.')),

  ('Platinum', 0.80, 2.0,
   1.5, 16, 3, 2000,
   true, true, false, true, true,
   jsonb_build_object(
     'tool_classes',        jsonb_build_array('read','write_reversible','spend_metered'),
     'write_ops_per_session', 5000,
     'spend_per_tx_usdc',   100,
     'spend_daily_usdc',    1000,
     'irreversible_actions','never — human-gated at every tier',
     'config_keys_writable','none — see header; blocked until repid_config bounds are enforced',
     'note',                'Ceiling tier. Still cannot merge, publish, rotate a key, or write mainnet.'));

insert into trinity_changelog (change_type, description, rollback_sql, changed_by)
values (
  'data',
  'Populate repid_permissions with the five-tier autonomy ladder on the 0..1 '
  || 'conductor_state.reputation_score scale. Bands derive from existing '
  || 'constants (hal_veto 0.43, hal_block 0.55, 1/phi 0.618, certainty 0.80). '
  || 'can_modify_config false at every tier pending enforcement of '
  || 'repid_config min/max bounds. Table was empty, so get_conductor_permissions '
  || 'returned no rows for all 8 conductors before this.',
  'delete from repid_permissions where tier_name in '
  || '(''Observer'',''Bronze'',''Silver'',''Gold'',''Platinum'');',
  'claude-code:harness-spec'
);

commit;
