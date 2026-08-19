#!/usr/bin/env node
// scripts/check-pay-brief.mjs — the BFT panel is briefed with the ceiling that
// will actually be enforced.
//
// Run: node scripts/check-pay-brief.mjs
// Exit: 0 VERIFIED · 2 NOT_CHECKED · anything else FAILED
//
// ── THE PROPERTY ────────────────────────────────────────────────────────────
//
// `app/api/trustrails/pay/route.ts` hands the authorization panel a
// `maxWithdrawal`. `KYAValidator.validate()` enforces a per-transaction ceiling.
// **Those must be the same number.** A reviewer weighing a payment against a
// ceiling nobody will apply is being briefed with fiction.
//
// This is the FOURTH recurrence of one defect in this area — the two tier
// ladders, the DID comparison, the payment threshold — and the third time on
// this exact line. The line's own comment records deleting a hand-rolled ladder
// (`repidScore > 7500 ? 100000 : 50000`) from it. The replacement,
// `TIER_LIMITS[tierForScore(score)].perTx`, used the RIGHT ladder against a row
// the ladder did not write, and against a score that had been recomputed since
// — two divergences where the old code had one.
//
// ── WHY THIS IS A SOURCE-LEVEL CHECK, STATED PLAINLY ────────────────────────
//
// `KYAValidator` and the route reach Supabase through the `@/` alias, so neither
// compiles standalone — the reason `repid-scoring.ts` was extracted and the
// reason NEITHER has ever had a unit test. This suite therefore reads SOURCE.
//
// **It proves the wiring, not the runtime behaviour.** It cannot observe a real
// request. What makes that acceptable rather than theatre is that the hard half
// is already enforced by something stronger: `enforcedPerTxLimit` is a REQUIRED
// field on `KYAComplianceResult`, so `tsc` — not this file — guarantees every
// return path in `validate()` sets it. This checks the two things a type cannot:
// that the field stays required, and that the call site keeps reading it instead
// of deriving a second answer.

import { readFileSync } from 'node:fs';
import { createChecker } from './lib/harness-compile.mjs';

const { check, truthy, report } = createChecker('pay-brief');

const read = (p) => readFileSync(p, 'utf8');
const ROUTE = 'app/api/trustrails/pay/route.ts';
const TYPES = 'lib/trustshell/types.ts';
const VALIDATOR = 'lib/trustshell/KYAValidator.ts';

const route = read(ROUTE);
const types = read(TYPES);
const validator = read(VALIDATOR);

/**
 * Source with comments removed.
 *
 * LOAD-BEARING, and learned the hard way in #76: this file's own prose quotes
 * the deleted expression `TIER_LIMITS[tierForScore(score)].perTx` to explain why
 * it is gone. Scanning raw text would match that comment and report the defect
 * present when it is absent — a gate failing on its own documentation.
 */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const routeCode = stripComments(route);
const typesCode = stripComments(types);

// ── the type keeps tsc as the real gate ─────────────────────────────────────

check('enforcedPerTxLimit is REQUIRED on KYAComplianceResult', () => {
  // Required, not optional. If it were `enforcedPerTxLimit?:` the compiler would
  // stop demanding it on every return path, and a future branch could omit it
  // silently — which is exactly how `withinDailyLimit: true` came to be asserted
  // on a path that never read the spend history.
  truthy(/enforcedPerTxLimit\s*:\s*number\s*\|\s*null/.test(typesCode),
    'the field must be declared `number | null`');
  truthy(!/enforcedPerTxLimit\s*\?\s*:/.test(typesCode),
    'the field must NOT be optional — tsc completeness depends on it being required');
});

check('null means NOT EVALUATED, and the type admits it', () => {
  // A bare `number` would force every path to invent a ceiling, including the
  // path where no profile could be read. Absent is not zero — the same rule
  // getDailySpend follows.
  truthy(/enforcedPerTxLimit\s*:\s*number\s*\|\s*null/.test(typesCode),
    'null must be representable');
});

// ── the validator populates it from the ENFORCED source ─────────────────────

check('EVERY return path exports the field checkPerTxLimit measures', () => {
  // Enumerated, not sampled. The first version of this asserted that SOME
  // occurrence read `profile.spendingLimitPerTx`, which a mutation walked
  // straight through: `validate()` has four return paths, changing one left the
  // other three matching and the assertion green. `pay-brief-exports-the-wrong-limit`
  // is that mutation, kept so the weak form cannot come back.
  truthy(/checkPerTxLimit\(\s*amountUSDC\s*,\s*profile\.spendingLimitPerTx\s*\)/.test(validator),
    'the ceiling is measured against profile.spendingLimitPerTx');

  const assigned = [...stripComments(validator).matchAll(/enforcedPerTxLimit:\s*([^,\n]+)/g)]
    .map((m) => m[1].trim());
  truthy(assigned.length === 4,
    `validate() has four return paths; found ${assigned.length} assignments — a new path must set this too`);

  const allowed = new Set(['profile.spendingLimitPerTx', 'null']);
  const wrong = assigned.filter((v) => !allowed.has(v));
  truthy(wrong.length === 0,
    `every assignment must be the enforced field or null; found ${JSON.stringify(wrong)}`);

  // And null exactly once — the no-profile path. More would mean a path that
  // HAS a profile is reporting its ceiling as unevaluated.
  truthy(assigned.filter((v) => v === 'null').length === 1,
    'exactly one path (no profile) may export null');
});

// ── the call site reads it and does not re-derive ───────────────────────────

check('maxWithdrawal is read from the validation result', () => {
  truthy(/const\s+maxWithdrawal\s*=\s*kyaResult\.enforcedPerTxLimit/.test(routeCode),
    'the brief must be the enforced ceiling');
});

check('the route does NOT derive a second per-tx ceiling', () => {
  // The regression this exists for. Any TIER_LIMITS/tierForScore expression
  // reaching a per-tx figure here is a second source for one fact.
  truthy(!/TIER_LIMITS\s*\[/.test(routeCode),
    'no TIER_LIMITS lookup may survive in this route — comments are stripped, so this is real code');
  truthy(!/tierForScore\s*\(/.test(routeCode),
    'no tierForScore call may survive in this route');
});

check('the ladder import is gone, not merely unused', () => {
  // An unused import is a standing invitation to re-derive. It also keeps the
  // module reachable for the dormancy gate on a dependency the route no longer
  // has.
  truthy(!/from\s*'@\/lib\/trustshell\/repid-scoring'/.test(routeCode),
    'the route must not import the ladder at all');
});

// ── an unevaluated ceiling denies; it does not default ──────────────────────

check('a null ceiling is refused, not substituted', () => {
  // The invariant spans two files — validate() only reports kya_verified on the
  // path that populates the field — so it is CHECKED rather than asserted away
  // with `!`. A wrong `!` hands the panel null typed as a number, which is the
  // fabricated bound this whole change removes.
  truthy(/kyaResult\.enforcedPerTxLimit\s*===\s*null/.test(routeCode),
    'the null case must be tested explicitly');
  truthy(!/enforcedPerTxLimit\s*[!?]/.test(routeCode),
    'no non-null assertion (`!`) and no optional-chain default on the ceiling');
  truthy(!/enforcedPerTxLimit\s*\?\?/.test(routeCode),
    'no `??` fallback — a substituted ceiling is the defect, not the fix');
});

check('the refusal is a NOT_CHECKED-shaped denial, not an approval', () => {
  const guard = routeCode.slice(routeCode.indexOf('enforcedPerTxLimit === null'));
  const block = guard.slice(0, guard.indexOf('const maxWithdrawal'));
  truthy(/authorized:\s*false/.test(block), 'the guard must deny');
  truthy(/503/.test(block), 'and report it as unevaluated (503), not as a rejection of the agent');
});

report();
