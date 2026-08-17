#!/usr/bin/env node
// scripts/check-ceiling-source.mjs — an enforceable ceiling has exactly ONE
// source: the stored row.
//
// Run: node scripts/check-ceiling-source.mjs
// Exit: 0 VERIFIED · 2 NOT_CHECKED · anything else FAILED
//
// ── THE DECISION THIS ENFORCES ──────────────────────────────────────────────
//
// Sean's call, 2026-08-17, on the option pair recorded in
// `docs/REPID-REGISTRY-DRIFT-2026-08-17.md` §5: **TRUST THE ROW.**
// `agent_kya_registry.spending_limit_daily` and `spending_limit_per_tx` are the
// authoritative ceiling. `tierForScore` / `TIER_LIMITS` are a derivation aid and
// a briefing aid — never the enforcement source, and never a writer of one.
//
// The alternative — trust the ladder, deriving limits on read — was considered
// and rejected. It would have granted TORCH 500,000 USDC the moment it shipped.
//
// ── WHAT WENT WRONG WITHOUT THIS ────────────────────────────────────────────
//
// `updateRepID` rewrote the ceiling columns from the ladder on every reputation
// update, so an agent's authorized limit depended on which writer last touched
// its row: one compliant payment moved TORCH from 10,000 to 500,000 USDC daily,
// and because the delta is signed a PENALTY did the same, with 5,100 points of
// headroom before the limit fell.
//
// ── WHY `repid_tier` COUNTS AS A CEILING COLUMN ─────────────────────────────
//
// It labels the ceiling rather than the score. #82 measured that every stored
// `repid_tier` matches its own `spending_limit_daily` under `TIER_LIMITS`.
// Rewriting the label while leaving the limits would leave a row whose tier
// names a ceiling it does not carry — so all three move together, by operator
// action only.
//
// ── SOURCE-LEVEL, AND IT SAYS SO ────────────────────────────────────────────
//
// `KYAValidator` and the routes reach Supabase through the `@/` alias, so
// neither compiles standalone. This proves the WIRING, not runtime behaviour.
// Comments are stripped before scanning — this repo's own prose quotes the
// removed expressions to explain why they are gone, and scanning raw text would
// fail the gate on its own documentation (the #76 lesson).

import { readFileSync } from 'node:fs';
import { createChecker } from './lib/harness-compile.mjs';

const { check, truthy, report } = createChecker('ceiling-source');

const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const code = (p) => stripComments(readFileSync(p, 'utf8'));

const validator = code('lib/trustshell/KYAValidator.ts');
const systemTrust = code('app/api/trustrails/system-trust/route.ts');

/** The three columns that together describe an agent's authorized ceiling. */
const CEILING_COLUMNS = ['spending_limit_daily', 'spending_limit_per_tx', 'repid_tier'];

// ── the write path ──────────────────────────────────────────────────────────

check('updateRepID writes the score, not the ceiling', () => {
  const start = validator.indexOf('async updateRepID');
  truthy(start > 0, 'updateRepID must exist for this to mean anything');
  const body = validator.slice(start);
  const update = body.slice(body.indexOf('.update('), body.indexOf('.eq('));
  truthy(update.length > 0, 'the update payload must be locatable');

  truthy(/repid_score:/.test(update), 'the score IS still written — this is not a no-op method');
  for (const col of CEILING_COLUMNS) {
    truthy(!new RegExp(`${col}\\s*:`).test(update),
      `${col} must not be written by a reputation update — it is the authoritative ceiling`);
  }
});

check('KYAValidator does not import the ladder at all', () => {
  // Not merely unused. An unused import is a standing invitation to re-derive,
  // and it is the difference between "we decided" and "we happened not to".
  truthy(!/\bTIER_LIMITS\b/.test(validator), 'no TIER_LIMITS reference may survive');
  truthy(!/\btierForScore\b/.test(validator), 'no tierForScore reference may survive');
});

check('the enforced limits are still READ from the stored row', () => {
  // The other half of trust-the-row, and the half a careless fix would drop:
  // stopping the writes while also ceasing to read the stored columns would
  // leave nothing enforcing anything.
  truthy(/spendingLimitPerTx:\s*data\.spending_limit_per_tx/.test(validator),
    'per-tx ceiling read from the row');
  truthy(/spendingLimitDaily:\s*data\.spending_limit_daily/.test(validator),
    'daily ceiling read from the row');
  truthy(/checkPerTxLimit\(\s*amountUSDC\s*,\s*profile\.spendingLimitPerTx\s*\)/.test(validator),
    'and the per-tx ceiling is what is enforced');
  truthy(/profile\.spendingLimitDaily/.test(validator),
    'and the daily ceiling is what is enforced');
});

// ── the reporting surface ───────────────────────────────────────────────────

check('system-trust reports the STORED tier, not a derived one', () => {
  // Deriving here would publish a tier the enforcer does not use — the
  // reviewer-vs-enforcer split closed on the payment path, reopened on a
  // dashboard.
  truthy(/a\.repid_tier/.test(systemTrust), 'the distribution reads the stored column');
  truthy(!/\btierForScore\b/.test(systemTrust), 'no tierForScore call may appear here');
  truthy(!/\bTIER_LIMITS\b/.test(systemTrust), 'no TIER_LIMITS lookup may appear here');
});

check('the system score is a mean and is not described as weighted', () => {
  // The comment claimed "Weighted average — higher RepID agents get more
  // weight" above arithmetic that weights every agent equally. Wrong comments
  // are how the next lane misreads the code, so the claim is asserted gone
  // rather than left to review.
  const raw = readFileSync('app/api/trustrails/system-trust/route.ts', 'utf8');
  truthy(!/Weighted average — higher RepID agents get more weight/.test(raw),
    'the false weighted-average claim must not return');
  truthy(/\/\s*agents\.length/.test(systemTrust),
    'and the arithmetic is still a plain mean, so the corrected comment stays true');
});

report();
