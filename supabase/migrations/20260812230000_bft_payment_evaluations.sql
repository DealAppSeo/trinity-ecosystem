-- bft_payment_evaluations — the queue that connects the real BFT engine to the
-- payment path.
--
-- Until now `/api/trustrails/pay` called a 16-line placeholder that returned
-- `passed: true` unconditionally, while the real engine (lib/trust/BFTEngine.ts
-- — three providers, golden-ratio vote weights, Pythagorean Comma veto) sat
-- wired to one route no UI called.
--
-- Why a queue rather than a direct call. BFTEngine.vote() fans out to three LLM
-- providers; the cost is negligible (~$0.001 per payment) but the latency is
-- seconds, and the posture for this system is observe, not enforce. So the
-- payment writes its receipt with bft_passed = NULL, enqueues here, and a
-- worker fills the verdict in afterwards. Settlement never waits on a model.
--
-- The row is also the audit record: it keeps the exact claim put to the panel,
-- every provider's belief/disbelief, the comma gap, and the resulting verdict,
-- so a receipt's bft_passed can always be traced back to what was actually
-- asked and who said what.

create table if not exists public.bft_payment_evaluations (
  id                bigserial primary key,

  -- Links back to the receipt whose bft_passed this evaluation fills in.
  receipt_id        text not null,
  payment_id        text,

  -- The authorization context put to the panel, captured at payment time so a
  -- later evaluation judges what was actually true then.
  agent_name        text not null,
  amount_usdc       numeric,
  recipient_address text,
  purpose           text,
  repid_score       numeric,
  repid_tier        text,
  max_withdrawal    numeric,
  human_custody     boolean,
  claim             text not null,

  -- pending → evaluated | failed. A row that errors keeps its message rather
  -- than disappearing, so a silently broken worker is visible in the table.
  status            text not null default 'pending'
                    check (status in ('pending', 'evaluated', 'failed')),
  attempts          integer not null default 0,
  error             text,

  -- Verdict. All nullable: a pending row has no verdict, and "no verdict yet"
  -- must never be storable as a pass.
  consensus_reached boolean,
  consensus_score   numeric,
  threshold         numeric,
  comma_gap         numeric,
  comma_severity    text,
  pythagorean_veto  boolean,
  hitl_required     boolean,
  votes             jsonb,
  proof_hash        text,

  created_at        timestamptz not null default now(),
  evaluated_at      timestamptz
);

-- The worker's hot path: oldest pending first.
create index if not exists bft_payment_evaluations_pending_idx
  on public.bft_payment_evaluations (created_at)
  where status = 'pending';

create index if not exists bft_payment_evaluations_receipt_idx
  on public.bft_payment_evaluations (receipt_id);

alter table public.bft_payment_evaluations enable row level security;

-- No anon policy, by design — the publishable key is public, and this table
-- carries recipient addresses and payment amounts. Reads for signed-in users;
-- writes are service-key only, so a browser cannot forge an evaluation.
drop policy if exists bft_payment_evaluations_authenticated_select
  on public.bft_payment_evaluations;
create policy bft_payment_evaluations_authenticated_select
  on public.bft_payment_evaluations for select to authenticated using (true);

comment on table public.bft_payment_evaluations is
  'Async BFT consensus evaluations for payments. Written by /api/trustrails/pay, '
  'drained by /api/trustrails/bft/process, fills kya_compliance_receipts.bft_passed.';
