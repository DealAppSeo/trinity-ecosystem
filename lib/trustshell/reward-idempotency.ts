// lib/trustshell/reward-idempotency.ts
//
// May this payment's reward be paid AGAIN?
//
// ZERO IMPORTS, like `reward.ts` beside it. The two are deliberately separate
// decisions: `reward.ts` answers "has this reward been EARNED", this answers
// "has it already been PAID". Collapsing them would let a fix to one silently
// change the other, and they fail for different reasons.
//
// ── WHY A SECOND MODULE AT ALL ──────────────────────────────────────────────
//
// `updateRepID` takes an arbitrary signed delta and writes it. There is no key,
// no constraint and no dedupe, so N calls are +10N — and the write is not a
// scoreboard entry, it recomputes `repid_tier` and BOTH spending limits in the
// same statement. Replaying one accepted payment therefore raises the ceiling on
// the next one. `reward.ts` bounded WHEN the reward is earned; it did nothing
// about how many times.
//
// ── THE PRIMITIVE IS ALREADY IN THE DATABASE ────────────────────────────────
//
// `kya_compliance_receipts.receipt_id` carries a UNIQUE index
// (`kya_compliance_receipts_receipt_id_key`, verified live 2026-08-19). The
// receipt is written at step 4 of the payment path, before the reward at step 6,
// and its id IS the payment id. So the idempotency key exists, is unique, and is
// already populated — nothing needs inventing.
//
// What is missing is somewhere on that row to record that the reward was paid.
// The migration adding `repid_reward_delta` / `repid_reward_at` is written and
// **deliberately UNAPPLIED**, in the same posture as
// `20260813210000_agent_repid_earned_observations.sql`. Until it is applied the
// claim cannot be recorded, and the honest response to that is to WITHHOLD.
//
// ── FAIL CLOSED, AND SAY WHICH KIND OF CLOSED ───────────────────────────────
//
// Four ledger states, not two. "The reward was already paid" and "I could not
// tell whether it was paid" both withhold, and they are completely different
// operational facts: the first is the system working, the second is an outage
// that needs a human. A boolean would report an unapplied migration as a
// successful duplicate-suppression forever, and nobody would look.

/** What the ledger says about this receipt. */
export type LedgerState =
  /** The claim was recorded by us, now, and nobody had it before. */
  | 'claimed'
  /** A reward is already recorded against this receipt. */
  | 'already-awarded'
  /** The store exists but could not be read or written — an outage. */
  | 'unreadable'
  /** The columns do not exist. The migration is unapplied. */
  | 'store-absent';

export type IdempotentOutcome =
  | 'PAY'
  | 'WITHHELD_DUPLICATE'
  | 'WITHHELD_LEDGER_UNREADABLE'
  | 'WITHHELD_LEDGER_ABSENT'
  /** The reward was not earned in the first place — `reward.ts` already said no. */
  | 'WITHHELD_UNEARNED';

export interface IdempotentDecision {
  /** True only for PAY. Nothing else may reach `updateRepID`. */
  award: boolean;
  outcome: IdempotentOutcome;
  /** True when a human needs to look — an outage or an unapplied migration. */
  needsOperator: boolean;
  reason: string;
}

/**
 * Combine "was it earned" with "was it already paid".
 *
 * `earnedDelta` is `reward.delta` from `reward.ts`. Zero short-circuits: an
 * unearned reward must never touch the ledger, because claiming a receipt we
 * were never going to pay would make the eventual legitimate payment look like a
 * duplicate. That ordering is load-bearing and is why this takes the delta
 * rather than being called first.
 */
export function idempotentDecision(
  earnedDelta: number,
  ledger: LedgerState
): IdempotentDecision {
  if (earnedDelta === 0) {
    return {
      award: false,
      outcome: 'WITHHELD_UNEARNED',
      needsOperator: false,
      reason: 'no reward was earned; the ledger was not consulted',
    };
  }

  switch (ledger) {
    case 'claimed':
      return {
        award: true,
        outcome: 'PAY',
        needsOperator: false,
        reason: 'first claim on this receipt',
      };
    case 'already-awarded':
      return {
        award: false,
        outcome: 'WITHHELD_DUPLICATE',
        needsOperator: false,
        reason: 'a reward is already recorded against this receipt',
      };
    case 'unreadable':
      return {
        award: false,
        outcome: 'WITHHELD_LEDGER_UNREADABLE',
        needsOperator: true,
        reason:
          'the reward ledger could not be read or written — withholding, because paying ' +
          'without a claim is how a replay becomes permanent',
      };
    case 'store-absent':
      return {
        award: false,
        outcome: 'WITHHELD_LEDGER_ABSENT',
        needsOperator: true,
        reason:
          'the reward ledger columns do not exist (migration unapplied) — no claim can be ' +
          'recorded, so no reward can be paid exactly once',
      };
  }
}

/**
 * Classify a Postgres error into a ledger state.
 *
 * `42703` is undefined_column — the unapplied migration, and the ONLY error that
 * may be read as `store-absent`. Everything else is an outage: an unknown error
 * that defaulted to `store-absent` would report a live database problem as a
 * missing migration and send the operator to the wrong place.
 *
 * `23505` is unique_violation. It cannot occur on the conditional UPDATE this
 * module is built for, but a future INSERT-based claim would raise it and it
 * means the same thing as zero rows updated.
 */
export function ledgerStateFromError(code: string | null | undefined): LedgerState {
  if (code === '42703') return 'store-absent';
  if (code === '23505') return 'already-awarded';
  return 'unreadable';
}

/**
 * Interpret the result of the conditional claim.
 *
 * The claim is one statement:
 *
 *   UPDATE kya_compliance_receipts
 *      SET repid_reward_delta = $2, repid_reward_at = now()
 *    WHERE receipt_id = $1 AND repid_reward_at IS NULL
 *
 * Atomic because `receipt_id` is UNIQUE: the row is locked for the update, so two
 * concurrent requests cannot both match `repid_reward_at IS NULL`. One updates
 * one row, the other updates zero. **A read-then-write would not have this
 * property** and is the shape this module exists to avoid.
 *
 * Zero rows is ambiguous in exactly one way and it is worth naming: it means
 * either "already claimed" or "no such receipt". The caller passes
 * `receiptExists` because it wrote the receipt two steps earlier and knows.
 */
export function ledgerStateFromClaim(
  rowsUpdated: number,
  receiptExists: boolean
): LedgerState {
  if (rowsUpdated > 0) return 'claimed';
  if (!receiptExists) return 'unreadable';
  return 'already-awarded';
}
