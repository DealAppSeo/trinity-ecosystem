// lib/trustshell/RewardLedger.ts
//
// The one write that makes a RepID reward payable exactly once.
//
// This is a stateful ADAPTER, and it is the only part of the idempotency work
// that touches the database. The decisions live in `reward-idempotency.ts` with
// zero imports, so they are gateable; this file does one statement and
// classifies its outcome.
//
// LAZY CLIENT, per lib/CLAUDE.md. `getSupabaseAdmin()` is called inside the
// method, never at module scope and never in a field initialiser — a client
// built at import time executes during `next build`'s page-data collection and
// fails the build with `supabaseKey is required`. That pattern broke every
// deployment of this project from 2026-06-05 to 2026-08-11.

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  ledgerStateFromClaim,
  ledgerStateFromError,
  type LedgerState,
} from './reward-idempotency';

export interface ClaimResult {
  state: LedgerState;
  /** The raw Postgres error code, when there was one. For the operator, not the caller. */
  errorCode?: string;
  detail: string;
}

export class RewardLedger {
  /** A getter, never a field — see the header. */
  private get supabase() {
    return getSupabaseAdmin();
  }

  /**
   * Claim this receipt's reward, atomically.
   *
   *   UPDATE kya_compliance_receipts
   *      SET repid_reward_delta = delta, repid_reward_at = now()
   *    WHERE receipt_id = receiptId AND repid_reward_at IS NULL
   *
   * `receipt_id` is UNIQUE, so the statement resolves and locks exactly one row.
   * Two concurrent requests cannot both satisfy `repid_reward_at IS NULL`: one
   * updates one row, the other updates zero. A SELECT-then-UPDATE would let both
   * through, which is the entire reason this is one statement.
   *
   * Returns a state, never a boolean. `already-awarded` and `unreadable` both
   * mean "do not pay" and are opposite operational facts — one is the system
   * working, the other needs a human.
   */
  async claim(receiptId: string, delta: number): Promise<ClaimResult> {
    try {
      const { data, error } = await this.supabase
        .from('kya_compliance_receipts')
        .update({ repid_reward_delta: delta, repid_reward_at: new Date().toISOString() })
        .eq('receipt_id', receiptId)
        .is('repid_reward_at', null)
        .select('receipt_id');

      if (error) {
        // 42703 (undefined_column) is the unapplied migration and the ONLY code
        // read as store-absent. Anything else is an outage — defaulting an
        // unknown error to "migration missing" would send the operator to the
        // wrong place while a live database problem persisted.
        const state = ledgerStateFromError(error.code);
        return { state, errorCode: error.code, detail: error.message };
      }

      const rows = data?.length ?? 0;
      // The caller wrote this receipt two steps earlier in the same request, so
      // "no such receipt" is not a possibility it needs to consider — but the
      // classification takes it explicitly rather than assuming, because zero
      // rows is otherwise ambiguous between "already claimed" and "not there".
      const state = ledgerStateFromClaim(rows, true);
      return {
        state,
        detail:
          state === 'claimed'
            ? `claimed receipt ${receiptId} for ${delta}`
            : `receipt ${receiptId} already carries a reward`,
      };
    } catch (e: any) {
      // A throw here is a client or connectivity failure, not a duplicate.
      return { state: 'unreadable', detail: e?.message ?? String(e) };
    }
  }
}
