-- Correct the 12 compliance receipts written during the stub era.
--
-- Every existing row in kya_compliance_receipts claims things no part of the
-- system ever established:
--
--   bft_passed = true            — the authorizer was a placeholder that
--                                  returned true unconditionally
--   bft_consensus_weight = 1.0   — a perfect consensus for a vote never held
--   bft_votes_for = {VERITAS,SHOFET,SOPHIA}
--                                — fabricated voters. The BFT engine's
--                                  providers are groq, anthropic and deepseek;
--                                  these are Trinity agent names, and the stub
--                                  returned no votes at all
--   pythagorean_veto = false     — recorded as "veto did not fire" when nothing
--                                  could have fired it
--   on_chain_verified = true     — set by hand; the column defaults to false and
--                                  nothing in the codebase writes it
--   tx_verification_status = 'confirmed'
--                                — confirmTransaction() was commented out, so
--                                  no receipt was ever confirmed; two of the
--                                  twelve point at fabricated mock_tx_hash_
--                                  values with real-looking Explorer links
--
-- The correction is to NULL what was never measured rather than invent a
-- corrected value. NULL means "not checked", which is the truth, and it is what
-- the current code writes for an unevaluated payment.
--
-- Nothing is destroyed. The original values are preserved verbatim in
-- pre_correction_snapshot so the row as originally written stays
-- reconstructible — which also keeps the original audit_hash meaningful: it
-- still hashes the record that was actually issued. Recomputing the hash over
-- corrected values would erase the evidence that the original was wrong, which
-- is the opposite of what a tamper-evident field is for.

alter table public.kya_compliance_receipts
  add column if not exists corrected_at             timestamptz,
  add column if not exists corrected_by             text,
  add column if not exists correction_reason        text,
  add column if not exists pre_correction_snapshot  jsonb;

comment on column public.kya_compliance_receipts.pre_correction_snapshot is
  'Verbatim copy of the fields changed by a correction, so the receipt as '
  'originally issued remains reconstructible and audit_hash still describes it.';

update public.kya_compliance_receipts
set
  -- Snapshot first: this reads the pre-update values in the same statement.
  pre_correction_snapshot = jsonb_build_object(
    'bft_passed',             bft_passed,
    'bft_consensus_weight',   bft_consensus_weight,
    'bft_threshold',          bft_threshold,
    'bft_votes_for',          bft_votes_for,
    'bft_votes_against',      bft_votes_against,
    'pythagorean_veto',       pythagorean_veto,
    'on_chain_verified',      on_chain_verified,
    'tx_verification_status', tx_verification_status,
    'solana_explorer_url',    solana_explorer_url
  ),
  corrected_at = now(),
  corrected_by = 'stub-era-correction',
  correction_reason =
    'BFT consensus was never evaluated: the payment path used a placeholder '
    || 'authorizer returning passed=true unconditionally, and the recorded '
    || 'voters were not the engine''s providers. Settlement was never '
    || 'confirmed: confirmTransaction() was disabled. Unverified fields reset '
    || 'to NULL / false; originals in pre_correction_snapshot.',

  -- Consensus: never ran.
  bft_passed           = null,
  bft_consensus_weight = null,
  bft_votes_for        = null,
  bft_votes_against    = null,
  pythagorean_veto     = null,

  -- Settlement: nothing was ever verified on chain.
  on_chain_verified = false,
  tx_verification_status = case
    when solana_tx_hash like 'mock_tx_hash%' then 'simulated'
    else 'submitted'
  end,

  -- A fabricated hash never had a real Explorer page; drop the link that made
  -- it look inspectable. The hash itself stays, prefixed mock_tx_hash_, because
  -- it is more informative as a labelled fake than as a null.
  solana_explorer_url = case
    when solana_tx_hash like 'mock_tx_hash%' then null
    else solana_explorer_url
  end
where corrected_at is null;
