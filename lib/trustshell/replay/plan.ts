// lib/trustshell/replay/plan.ts — the decisions a 147,704-row replay makes.
//
// Zero imports, so the check suite can compile and assert it standalone.
//
// WHY THE LOGIC IS HERE AND NOT IN THE SCRIPT. A replay over the HAL corpus is
// a job that gets interrupted: a token expires, a container is reclaimed, a
// deploy restarts the runner. Every interesting decision it makes happens on
// the resume path, which is exactly the path that never runs during a happy
// test. Inline in a script that needs a database and a secret, none of it is
// assertable — and `ComplianceReceipt.generate()` is already the cautionary
// example: its preimage was built inline, therefore never tested, and shipped
// two defects that the extracted HAL preimage had already fixed.
//
// ── THE TRAP THIS CORPUS SETS ────────────────────────────────────────────────
//
// `kya_receipts_hal_classification_uniq` is a partial unique index on
// `hal_classification_id`. It is what makes the replay safe to resume: a second
// pass cannot double-mint, so every rate later computed from the corpus stays
// right.
//
// The same index makes a BAD replay irreversible. `audit_hash` is NULLABLE, so
// a run without a secret would insert 147,704 receipts that no one can verify —
// and idempotency would then BLOCK re-minting them correctly. The recovery is a
// mass delete of production receipts, which is worse than the disease.
//
// Hence `assertMintable`: this module refuses to produce a row when the secret
// is absent, rather than degrading to a null hash. There is no "partial credit"
// mode. A receipt without an audit hash is not a weaker receipt, it is a
// permanent claim that something was verified when nothing was.

/** Where a resumed run picks up. Ids ascend, so a high-water mark is enough. */
export interface Cursor {
  /** Highest `hal_classifications.id` already ATTEMPTED. Exclusive lower bound. */
  afterId: number;
}

export interface ReplayCounts {
  /** Receipts newly written. */
  minted: number;
  /** Already present — the index did its job. NOT a failure. */
  skipped: number;
  /** Rows the writer refused, with a reason. Any of these stops the run. */
  failed: number;
  /** Rows read but not attempted, because the run stopped early. */
  remaining: number;
}

export type Verdict = 'VERIFIED' | 'NOT_CHECKED' | 'FAILED';

/**
 * How an insert error is to be read.
 *
 * `duplicate` is the ONLY benign error. Everything else stops the run, and that
 * is deliberate: a replay that grinds through 147,704 rows logging failures
 * produces a corpus that is partly minted, partly not, with no record of which
 * — and the next operator sees a green "replay complete" line.
 */
export type InsertOutcome = 'minted' | 'duplicate' | 'fatal';

/** Postgres unique-violation. The partial index raises exactly this. */
const UNIQUE_VIOLATION = '23505';

/**
 * Classify an insert error.
 *
 * Matched on SQLSTATE, never on message text. Supabase surfaces `code` on
 * PostgrestError; message wording is not a contract and has changed between
 * client versions. Matching `/duplicate key/i` would silently reclassify a
 * genuine failure as a benign skip the first time that string moved — and a
 * skip is invisible, so the corpus would quietly go short.
 */
export function classifyInsert(error: { code?: string | null } | null): InsertOutcome {
  if (!error) return 'minted';
  if (error.code === UNIQUE_VIOLATION) return 'duplicate';
  return 'fatal';
}

/**
 * WHY THERE IS NO `assertMintable` HERE.
 *
 * A draft of this module carried one: a preflight that refused to replay when
 * `TRUSTRAILS_HMAC_SECRET` was unset, so an operator would learn about a
 * missing credential before the first row rather than after forty thousand.
 * The intent was right and the implementation was a liability.
 *
 * `requireAuditSecret` in `receipt-audit.ts` already owns that policy, and owns
 * strictly more of it: it refuses empty, refuses anything under
 * MIN_AUDIT_SECRET_LENGTH, and refuses ABANDONED_DEFAULT_SECRET by name — the
 * 26-character constant that clears a length rule and is published in this
 * repository's git history. The draft here checked only for empty. It accepted
 * every secret that function exists to reject.
 *
 * So the two would have disagreed, with the WEAKER one running first and
 * printing a reassuring line. That is LESSONS A20 — two correct-looking
 * components, one value, two meanings — with the added twist that the second
 * opinion was the unqualified one.
 *
 * The replay therefore calls `requireAuditSecret` directly as its first
 * statement. One implementation of the policy, already mutation-tested by
 * `check:receipt-audit`. The irreversibility warning that motivated the
 * preflight is still printed by the script; it just no longer comes with a
 * second, laxer verdict attached.
 */

/**
 * The next cursor after attempting a batch.
 *
 * Takes the max id ATTEMPTED, not the max id MINTED. A batch that was entirely
 * skipped as duplicates still advanced through the corpus; advancing only on
 * mints would re-read those rows forever and the run would never terminate on a
 * second pass.
 */
export function advance(cursor: Cursor, attemptedIds: readonly number[]): Cursor {
  if (attemptedIds.length === 0) return cursor;
  let max = cursor.afterId;
  for (const id of attemptedIds) if (id > max) max = id;
  return { afterId: max };
}

/**
 * Batch size, clamped.
 *
 * An unbounded batch is a single statement over 147,704 rows: one failure loses
 * the whole pass, and no progress is recorded. A batch of 1 is 147,704 round
 * trips. Neither bound is a tuning preference — they are the two ways this job
 * fails to finish.
 */
export const MIN_BATCH = 1;
export const MAX_BATCH = 1000;
export const DEFAULT_BATCH = 250;

export function clampBatch(requested: number): number {
  if (!Number.isFinite(requested)) return DEFAULT_BATCH;
  const n = Math.floor(requested);
  if (n < MIN_BATCH) return MIN_BATCH;
  if (n > MAX_BATCH) return MAX_BATCH;
  return n;
}

/**
 * The run's verdict. Three outcomes, taken from the counts.
 *
 * `remaining > 0` is NOT_CHECKED, not FAILED: an interrupted run did not
 * disprove anything about the rows it never reached. Collapsing it into either
 * pass or fail is the house defect in miniature — "we did not look" reported as
 * "it passed", or a clean partial run reported as a breakage.
 */
export function verdictOf(counts: ReplayCounts): Verdict {
  if (counts.failed > 0) return 'FAILED';
  if (counts.remaining > 0) return 'NOT_CHECKED';
  return 'VERIFIED';
}

/**
 * One-line summary. Every count is named, including the zeros.
 *
 * Printing only the non-zero counts is how `skipped: 147704, minted: 0` — a
 * replay that did nothing because it had already run — reads as success.
 */
export function summarize(counts: ReplayCounts): string {
  return (
    `${verdictOf(counts)} — minted ${counts.minted}, ` +
    `already present ${counts.skipped}, failed ${counts.failed}, ` +
    `not attempted ${counts.remaining}`
  );
}
