// scripts/check-reward-idempotency.mjs
//
// A reward that can be paid twice is not a reward, it is a faucet.
//
// `check:reward-earned` bounded WHEN the +10 is earned. It did nothing about how
// many times. `KYAValidator.updateRepID` takes an arbitrary signed delta with no
// key and no constraint, and its write is not a scoreboard entry — it sets
// `repid_score`, recomputes `repid_tier`, and rewrites BOTH spending limits in
// the same statement. So replaying one accepted payment pays again AND raises
// the ceiling for the next request. N calls are +10N.
//
// ── THE PRIMITIVE WAS ALREADY THERE ─────────────────────────────────────────
//
// `kya_compliance_receipts.receipt_id` carries a UNIQUE index
// (`kya_compliance_receipts_receipt_id_key`, read from `pg_indexes` on
// 2026-08-19), and the receipt is written at step 4 of the same request, before
// the reward at step 6. The idempotency key exists, is unique, and is already
// populated. A new table would have given one payment two identifiers, which is
// a defect this repo has logged three times.
//
// ── WHAT THIS SUITE ACTUALLY PROTECTS ───────────────────────────────────────
//
// The claim is ONE statement:
//
//   UPDATE kya_compliance_receipts SET repid_reward_delta = $2, repid_reward_at = now()
//    WHERE receipt_id = $1 AND repid_reward_at IS NULL
//
// Atomic because the row is resolved and locked by a unique key: two concurrent
// replays cannot both match `repid_reward_at IS NULL`. **A SELECT-then-UPDATE
// has no such property**, and the assertions below pin the four-state
// classification that keeps a read-then-write from creeping back in disguised as
// a boolean.
//
// FOUR LEDGER STATES, NOT TWO. "already paid" and "I could not tell" both
// withhold and are opposite operational facts — one is the system working, the
// other needs a human. A boolean would report an unapplied migration as
// successful duplicate-suppression forever, and nobody would look.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.reward-idem-check-'));
let I;
try {
  const tsconfigPath = join(outDir, 'tsconfig.json');
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        outDir, rootDir: process.cwd(), module: 'commonjs', target: 'es2022',
        lib: ['es2022'], moduleResolution: 'node', esModuleInterop: true,
        skipLibCheck: true, strict: true,
      },
      files: [join(process.cwd(), 'lib/trustshell/reward-idempotency.ts')],
    })
  );
  execFileSync(localTsc(), ['-p', tsconfigPath], { stdio: 'pipe' });
  I = await import(pathToFileURL(join(outDir, 'lib/trustshell/reward-idempotency.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('FAILED: could not compile lib/trustshell/reward-idempotency.ts');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

let pass = 0;
const failures = [];
function check(name, fn) {
  try {
    const r = fn();
    if (r === true) { pass++; return; }
    failures.push(`${name}: ${r}`);
  } catch (e) {
    failures.push(`${name}: threw ${e.message}`);
  }
}

const REWARD = 10;

// ── 1. Exactly one state pays ───────────────────────────────────────────────

check('only a fresh claim pays', () => {
  const paying = ['claimed', 'already-awarded', 'unreadable', 'store-absent'].filter(
    (s) => I.idempotentDecision(REWARD, s).award
  );
  return paying.length === 1 && paying[0] === 'claimed'
    ? true
    : `these states pay: ${paying.join(', ')}`;
});

check('a second claim on the same receipt does NOT pay', () => {
  const d = I.idempotentDecision(REWARD, 'already-awarded');
  return !d.award && d.outcome === 'WITHHELD_DUPLICATE'
    ? true
    : `award=${d.award}, outcome=${d.outcome}`;
});

// ── 2. Fail CLOSED, and say which kind of closed ────────────────────────────

check('an unreadable ledger withholds rather than paying', () => {
  const d = I.idempotentDecision(REWARD, 'unreadable');
  return !d.award && d.outcome === 'WITHHELD_LEDGER_UNREADABLE'
    ? true
    : `award=${d.award}, outcome=${d.outcome}`;
});

check('an absent ledger (unapplied migration) withholds', () => {
  const d = I.idempotentDecision(REWARD, 'store-absent');
  return !d.award && d.outcome === 'WITHHELD_LEDGER_ABSENT'
    ? true
    : `award=${d.award}, outcome=${d.outcome}`;
});

check('a duplicate needs NO operator; an outage and a missing migration DO', () => {
  const dup = I.idempotentDecision(REWARD, 'already-awarded');
  const out = I.idempotentDecision(REWARD, 'unreadable');
  const abs = I.idempotentDecision(REWARD, 'store-absent');
  if (dup.needsOperator) return 'a suppressed duplicate was escalated — that is the system working';
  return out.needsOperator && abs.needsOperator
    ? true
    : `unreadable=${out.needsOperator}, store-absent=${abs.needsOperator} — an outage that ` +
      'nobody is told about is indistinguishable from working duplicate suppression';
});

check('every withholding outcome is DISTINCT — no two-outcome collapse', () => {
  const outcomes = ['claimed', 'already-awarded', 'unreadable', 'store-absent'].map(
    (s) => I.idempotentDecision(REWARD, s).outcome
  );
  return new Set(outcomes).size === 4 ? true : `only ${new Set(outcomes).size} distinct outcomes`;
});

// ── 3. Unearned short-circuits BEFORE the ledger ────────────────────────────
//
// Ordering is load-bearing: claiming a receipt for a reward we were never going
// to pay would make the eventual legitimate payment look like a duplicate.

check('an unearned reward never consults the ledger', () => {
  for (const s of ['claimed', 'already-awarded', 'unreadable', 'store-absent']) {
    const d = I.idempotentDecision(0, s);
    if (d.award) return `paid on a zero delta with ledger ${s}`;
    if (d.outcome !== 'WITHHELD_UNEARNED') return `ledger state ${s} leaked into outcome ${d.outcome}`;
  }
  return true;
});

check('an unearned reward does not escalate to an operator', () =>
  !I.idempotentDecision(0, 'store-absent').needsOperator
    ? true
    : 'a withheld-unearned reward paged someone about the ledger');

// ── 4. Error classification — the wrong code sends the wrong human ──────────

check('42703 (undefined_column) is the unapplied migration, and only that', () =>
  I.ledgerStateFromError('42703') === 'store-absent' ? true : 'undefined_column misclassified');

check('23505 (unique_violation) reads as already-awarded', () =>
  I.ledgerStateFromError('23505') === 'already-awarded' ? true : 'unique_violation misclassified');

check('an UNKNOWN error is an outage, never a missing migration', () => {
  for (const code of ['08006', '57014', 'PGRST301', '', null, undefined]) {
    if (I.ledgerStateFromError(code) !== 'unreadable') {
      return `code ${String(code)} classified as ${I.ledgerStateFromError(code)} — a live ` +
        'database problem reported as a missing migration sends the operator to the wrong place';
    }
  }
  return true;
});

// ── 5. The claim result — zero rows is ambiguous, and it is resolved ────────

check('one row updated is a fresh claim', () =>
  I.ledgerStateFromClaim(1, true) === 'claimed' ? true : 'a successful claim was not recognised');

check('zero rows against an EXISTING receipt is a duplicate', () =>
  I.ledgerStateFromClaim(0, true) === 'already-awarded' ? true : 'duplicate not recognised');

check('zero rows against a MISSING receipt is an outage, not a duplicate', () =>
  I.ledgerStateFromClaim(0, false) === 'unreadable'
    ? true
    : 'a vanished receipt was reported as a suppressed duplicate — which would hide it forever');

// ── 6. The wiring, and the statement shape ─────────────────────────────────
//
// A decision module nothing calls changes nothing — the auditor-grant lesson.
// And the atomicity claim rests entirely on this being ONE statement, so the
// adapter is grepped for the read-then-write shape it must not have.

const route = readFileSync('app/api/trustrails/pay/route.ts', 'utf8');
const ledger = readFileSync('lib/trustshell/RewardLedger.ts', 'utf8');

check('the pay route gates updateRepID on the idempotent decision', () => {
  const calls = [...route.matchAll(/updateRepID\(([^)]*)\)/g)].map((m) => m[1]);
  if (calls.length === 0) return 'no updateRepID call found — did the route move?';
  return /if \(payout\.award\) \{\s*\n\s*await kya\.updateRepID/.test(route)
    ? true
    : 'updateRepID is not guarded by payout.award';
});

check('the claim is keyed on the receipt, not the agent or the payment body', () =>
  /rewardLedger\.claim\(receipt\.receiptId,/.test(route)
    ? true
    : 'the reward claim is not keyed on receipt.receiptId — the unique column');

check('the claim guards on repid_reward_at IS NULL', () =>
  /\.is\('repid_reward_at', null\)/.test(ledger)
    ? true
    : 'the conditional UPDATE lost its NULL guard — without it every replay re-claims');

check('the adapter does NOT read-then-write', () => {
  // A `select(...)` before the update, or an `eq` on the guard column, would
  // reintroduce the race the single statement exists to close. The trailing
  // `.select('receipt_id')` is the UPDATE's RETURNING clause, not a read.
  const beforeUpdate = ledger.slice(0, ledger.indexOf('.update('));
  return !/\.from\([^)]*\)\s*\.select\(/.test(beforeUpdate)
    ? true
    : 'a SELECT precedes the UPDATE — two concurrent replays would both pass the check';
});

check('the response discloses payout separately from earning', () =>
  /paid:\s*payout\.award/.test(route) && /needsOperator:\s*payout\.needsOperator/.test(route)
    ? true
    : 'the response does not separate what was earned from what was paid');

// ── 7. The migration exists, and is honest about being unapplied ───────────

check('the migration adding the ledger columns is present', () => {
  const sql = readFileSync(
    'supabase/migrations/20260819013000_repid_reward_idempotency.sql',
    'utf8'
  );
  return /repid_reward_delta/.test(sql) && /repid_reward_at/.test(sql) && /UNAPPLIED/.test(sql)
    ? true
    : 'the migration does not add both columns, or no longer says it is unapplied';
});

rmSync(outDir, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} of ${pass + failures.length} assertions`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`VERIFIED: ${pass} assertions — a RepID reward is payable at most once`);
