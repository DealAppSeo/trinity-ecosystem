#!/usr/bin/env node
//
// check-hal-receipt.mjs — a HAL receipt must not claim anything HAL did not do.
//
//   npm run check:hal-receipt
//
// ============================================================================
// WHY THIS SUITE EXISTS
// ============================================================================
//
// Until 2026-08-15 `kya_compliance_receipts` was payment-shaped at the
// constraint level: `payment_amount_usdc` and `recipient_address` were NOT NULL.
// The largest real signal in the system — 147,703 HAL classifications — had
// nowhere to be recorded. A migration added a `receipt_kind` discriminator and
// `lib/trustshell/hal-receipt.ts` is the writer for the new kind.
//
// The danger in that writer is not that it breaks. It is that it QUIETLY
// OVERCLAIMS. Every column on this table was designed for a payment that was
// authorised, voted on and settled. A HAL classification is none of those. The
// default value of nearly every one of those columns is therefore a small lie
// waiting to be written, and nothing about a green build would reveal it.
//
// That is not hypothetical here. All twelve pre-existing rows were RETRACTED by
// a prior lane, because a placeholder authorizer recorded `passed = true` for a
// BFT vote that never happened. The retraction is still in the table:
//
//   "BFT consensus was never evaluated: the payment path used a placeholder
//    authorizer returning passed=true unconditionally... Unverified fields reset
//    to NULL / false; originals in pre_correction_snapshot."
//
// Every assertion below is one field that could repeat that.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.hal-receipt-check-'));

let mod;
try {
  // hal-receipt.ts has ZERO imports, so it compiles standalone. Its sibling
  // ComplianceReceipt.ts reaches Supabase through the `@/` alias and cannot —
  // which is why the payment preimage has never had a test.
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/hal-receipt.ts',
      '--outDir', outDir,
      '--rootDir', 'lib',
      '--module', 'commonjs',
      '--target', 'es2022',
      '--lib', 'es2022,dom',
      '--moduleResolution', 'node',
      '--strict',
    ],
    { stdio: 'pipe' }
  );
  mod = await import(pathToFileURL(join(outDir, 'trustshell', 'hal-receipt.js')).href);
} catch (err) {
  rmSync(outDir, { recursive: true, force: true });
  console.error(
    'FAILED — hal-receipt does not compile:\n' + `${err.stdout ?? ''}${err.stderr ?? ''}`
  );
  process.exit(1);
}

const { halReceiptAuditPreimage, halReceiptRow } = mod;

let pass = 0;
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) pass += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, actual, expected) =>
  ok(name, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

/** A fully-populated classification, so no assertion below passes by absence. */
const FULL = {
  id: 90210,
  prompt_hash: 'ph_abc123',
  category: 'factual_error',
  confidence: 'high',
  provider: 'groq',
  model: 'groq/llama-3.3-70b-versatile',
  previous_entry_hash: 'prev_deadbeef',
};

/** The same classification with every optional field absent. */
const SPARSE = {
  id: 7,
  prompt_hash: 'ph_x',
  category: null,
  confidence: null,
  provider: null,
  model: null,
  previous_entry_hash: null,
};

const RID = '11111111-2222-3333-4444-555555555555';

// ---------------------------------------------------------------------------
// 1. What the receipt must NOT claim. Each of these is a retraction avoided.
// ---------------------------------------------------------------------------

const rowFull = halReceiptRow(FULL, RID, 'hash');

eq('bft_passed is NULL, not false — the panel did not vote', rowFull.bft_passed, null);
ok(
  'bft_passed is not the boolean false (false asserts a failed vote that also never happened)',
  rowFull.bft_passed !== false
);
eq('kya_verified is false — no KYA check runs on this path', rowFull.kya_verified, false);
eq('payment_amount_usdc is absent', rowFull.payment_amount_usdc, undefined);
eq('recipient_address is absent', rowFull.recipient_address, undefined);
eq('on_chain_verified is false', rowFull.on_chain_verified, false);
eq(
  'on_chain_network is explicitly NULL, not the base-sepolia column default',
  rowFull.on_chain_network,
  null
);
eq(
  'tx_verification_status is not_applicable, not the pending default',
  rowFull.tx_verification_status,
  'not_applicable'
);
ok(
  'tx_verification_status is not a payment-path status',
  !['pending', 'submitted', 'confirmed', 'simulated'].includes(rowFull.tx_verification_status)
);
for (const f of ['zkp_proof_cid', 'solana_tx_hash', 'insurance_coverage', 'fireblocks_preauth_id',
                 'human_custody_bound', 'bft_consensus_weight', 'pythagorean_veto']) {
  eq(`${f} is not asserted`, rowFull[f], undefined);
}

// ---------------------------------------------------------------------------
// 2. What it must carry, or the receipt is evidence of nothing
// ---------------------------------------------------------------------------

eq('receipt_kind is hal_classification', rowFull.receipt_kind, 'hal_classification');
eq('hal_classification_id is carried', rowFull.hal_classification_id, FULL.id);
eq('hal_prompt_hash is carried', rowFull.hal_prompt_hash, FULL.prompt_hash);
eq('hal_previous_entry_hash is carried', rowFull.hal_previous_entry_hash, FULL.previous_entry_hash);
eq('audit_hash is carried through', rowFull.audit_hash, 'hash');
eq('agent_name falls back to the provider', rowFull.agent_name, 'groq');
eq('agent_name is "unknown" when the provider is absent', halReceiptRow(SPARSE, RID, 'h').agent_name, 'unknown');
ok('agent_name is never null — the column is NOT NULL', halReceiptRow(SPARSE, RID, 'h').agent_name != null);

// ---------------------------------------------------------------------------
// 3. The audit preimage. A hash that does not bind a field does not protect it.
// ---------------------------------------------------------------------------

eq(
  'preimage is domain-tagged so it cannot collide with a payment preimage',
  halReceiptAuditPreimage(FULL, RID).startsWith('"hal_classification/v1":'),
  true
);

// Every field must change the hash. This is the assertion that catches a field
// silently dropped from the preimage during a refactor — the bound looks the
// same, the receipt still verifies, and the dropped field is now unprotected.
const base = halReceiptAuditPreimage(FULL, RID);
for (const [field, altered] of [
  ['id', { ...FULL, id: 90211 }],
  ['prompt_hash', { ...FULL, prompt_hash: 'ph_other' }],
  ['category', { ...FULL, category: 'hallucination' }],
  ['confidence', { ...FULL, confidence: 'low' }],
  ['provider', { ...FULL, provider: 'anthropic' }],
  ['model', { ...FULL, model: 'other/model' }],
  ['previous_entry_hash', { ...FULL, previous_entry_hash: 'prev_other' }],
]) {
  ok(`preimage binds ${field}`, halReceiptAuditPreimage(altered, RID) !== base,
     'changing it did not change the preimage');
}
ok('preimage binds receiptId', halReceiptAuditPreimage(FULL, 'different-id') !== base);

// AMBIGUITY. Both of these failed on this suite's first run and are why the
// preimage is JSON-encoded rather than raw-interpolated.

ok(
  'an absent field is distinguishable from the literal string "null"',
  halReceiptAuditPreimage({ ...FULL, category: null }, RID) !==
    halReceiptAuditPreimage({ ...FULL, category: 'null' }, RID),
  'category=null and category="null" produce the same preimage'
);

// A separator inside a value must not shift the field boundaries. `model` is a
// provider-qualified string, so a colon in it is a live shape, not a contrivance.
ok(
  'a colon inside a field cannot be confused with the field separator',
  halReceiptAuditPreimage({ ...FULL, model: 'a:b', previous_entry_hash: 'c' }, RID) !==
    halReceiptAuditPreimage({ ...FULL, model: 'a', previous_entry_hash: 'b:c' }, RID),
  'two different classifications produce the same preimage'
);

// A quote inside a value must not escape its own span either — the fix for the
// two above would be undone by an encoding that is itself injectable.
ok(
  'a quote inside a field cannot break out of its encoded span',
  halReceiptAuditPreimage({ ...FULL, category: 'a":"b', confidence: 'c' }, RID) !==
    halReceiptAuditPreimage({ ...FULL, category: 'a', confidence: 'b":"c' }, RID)
);

eq('preimage is deterministic', halReceiptAuditPreimage(FULL, RID), base);

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`FAILED — hal-receipt: ${failures.length} of ${pass + failures.length} assertions\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(
    '\nEach failure above is a field a HAL receipt would claim without evidence.\n' +
      'All 12 pre-existing rows in this table were retracted for exactly that.'
  );
  rmSync(outDir, { recursive: true, force: true });
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
console.log(`check:hal-receipt — VERIFIED. ${pass} assertions; a HAL receipt claims only what HAL did.`);
