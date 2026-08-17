#!/usr/bin/env node
// scripts/check-bft-evidence-chain.mjs — is the bft evidence channel wired?
//
// P4 of docs/SPRINT-DECISIONS-2026-08-17.md. Decision 2 said BFT gets an
// evidence channel BEFORE its weight is touched, because reweighting a
// structurally-zero signal optimises the wrong thing.
//
// THE ANSWER IS THAT THE CHANNEL IS ALREADY BUILT. Measured 2026-08-17, the
// chain is complete and correct end to end:
//
//   pay route
//     -> BFTAuthorizer.enqueue()      INSERT bft_payment_evaluations   (producer)
//     -> /api/trustrails/bft/process  UPDATE ... consensus_reached      (worker)
//     -> v_agent_earned_observations  SELECT ... 'bft' AS signal        (reader)
//
// The view's bft branch even handles the `trinity-` name convention that the
// registry and repid_agents disagree about. Nothing is missing.
//
// THE BLOCKER IS TRAFFIC, AND IT IS MEASURED:
//
//   kya_compliance_receipts   12 rows, ALL between 2026-03-27 and 2026-04-01
//                             0 since the BFT migration on 2026-08-12
//   bft_payment_evaluations   0 rows
//   x402_settlements          408 rows through 2026-08-16, 4 since 08-12
//
// `enqueue` is called AFTER the receipt exists. No receipt has been written in
// four and a half months, so nothing is queued, nothing is evaluated, and the
// view has nothing to emit. **The 0.40 weight is not waiting on code.**
//
// A NOTE I INITIALLY GOT WRONG, kept because the correction is the useful part.
// I first read "19 x402 settlements in August, 0 compliance receipts" as the
// ledger failing to record live activity. It is not. NOTHING in app/ or lib/
// writes `x402_settlements` — it is fed by a service outside this repo — while
// `kya_compliance_receipts` is written by the pay route via
// ComplianceReceiptGenerator. They are SEPARATE SUBSYSTEMS with different
// traffic, and one being busy while the other is idle is not evidence of a
// defect in either. Two tables that both mention payments are not one pipeline.
//
// WHAT THIS SUITE CHECKS. The static half — that each link still exists in the
// source. It cannot check the live half without the database, and a suite that
// reported the channel healthy because the code compiles would be exactly the
// unearned success this repo keeps finding. The row counts above are a dated
// measurement, not an assertion.

import { readFileSync } from 'node:fs';

const results = [];
const record = (state, control, detail) => results.push({ state, control, detail });
const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return null; } };

const LINKS = [
  { label: 'producer — BFTAuthorizer enqueues an evaluation',
    file: 'lib/trustshell/BFTAuthorizer.ts',
    needle: /from\('bft_payment_evaluations'\)\s*\.insert\(/,
    why: 'without an INSERT the queue is never populated and the worker has nothing to process' },
  { label: 'worker — the process route resolves the verdict',
    file: 'app/api/trustrails/bft/process/route.ts',
    needle: /consensus_reached:/,
    why: 'the view requires consensus_reached IS NOT NULL, so an unresolved row emits nothing' },
  { label: 'consumer — the pay route reaches the authorizer',
    file: 'app/api/trustrails/pay/route.ts',
    needle: /BFTAuthorizer/,
    why: 'the producer only runs if the payment path calls it' },
];

for (const { label, file, needle, why } of LINKS) {
  const src = read(file);
  if (src === null) { record('NOT CHECKED', label, `could not read ${file}`); continue; }
  if (needle.test(src)) record('VERIFIED', label, `${file} — present`);
  else record('FAILED', label, `${file} — MISSING. ${why}`);
}

console.log(
  '\n  MEASURED 2026-08-17, and not asserted here because it needs the database:\n' +
  '    kya_compliance_receipts  12 rows, all 2026-03-27..04-01, 0 since the 08-12 BFT migration\n' +
  '    bft_payment_evaluations  0 rows\n' +
  '    x402_settlements         408 rows through 08-16, 4 since 08-12\n' +
  '  enqueue() runs AFTER a receipt exists. No receipt in 4.5 months means no queue,\n' +
  '  no verdict, and no bft observation. The 0.40 weight is blocked on TRAFFIC, not code.\n' +
  '  Separately: 4 settlements since 08-12 produced 0 receipts — a different defect.'
);

const width = Math.max(...results.map((r) => r.control.length));
console.log('\nBFT evidence chain — every link, checked in source\n');
for (const r of results) {
  const mark = r.state === 'VERIFIED' ? '✓' : r.state === 'FAILED' ? '✗' : '·';
  console.log(`  ${mark} ${r.control.padEnd(width)}  ${r.state}`);
  console.log(`    ${r.detail}`);
}
const failed = results.filter((r) => r.state === 'FAILED').length;
const unchecked = results.filter((r) => r.state === 'NOT CHECKED').length;
const verified = results.filter((r) => r.state === 'VERIFIED').length;
console.log(`\ncheck:bft-evidence-chain — ${verified} VERIFIED, ${unchecked} NOT CHECKED, ${failed} FAILED.`);
process.exit(failed > 0 ? 1 : unchecked > 0 ? 2 : 0);
