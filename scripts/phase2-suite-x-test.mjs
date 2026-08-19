#!/usr/bin/env node
// scripts/phase2-suite-x-test.mjs
//
// Suite X — x402 real-collateral (docs/policy/phase2-e2e-predicates.md,
// X1-X5). X1-X4 exercise a real rules module
// (lib/trustshell/x402-settlement-rules.ts) that is honestly UNWIRED — see
// its header. X5 is different: it is backed by real, live code
// (app/api/trustrails/pay/route.ts), so this script verifies THAT route's
// actual control-flow ORDER by reading its source, rather than re-asserting
// a rule with no caller. Conflating the two would overstate what either path
// does — kept separate on purpose.
//
// npm run check:phase2-suite-x

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.phase2-suite-x-check-'));
let Rules;
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
      files: [join(process.cwd(), 'lib/trustshell/x402-settlement-rules.ts')],
    })
  );
  execFileSync(localTsc(), ['-p', tsconfigPath], { stdio: 'pipe' });
  Rules = await import(pathToFileURL(join(outDir, 'lib/trustshell/x402-settlement-rules.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('FAILED: could not compile x402-settlement-rules.ts');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}
rmSync(outDir, { recursive: true, force: true });

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

// ── X1, X2: simulated settlement => no positive delta, not real collateral ──

check('X1: simulated settlement permits no positive delta on any axis', () => {
  const r = Rules.settlementRepidEffect({ is_simulated: true, status: 'delivered' });
  return r.permitsPositiveDelta === false ? true : `permitsPositiveDelta=${r.permitsPositiveDelta}`;
});

check('X2: simulated=true is never treated as real collateral', () => {
  const r = Rules.settlementRepidEffect({ is_simulated: true, status: 'delivered' });
  return r.treatsCollateralAsReal === false ? true : `treatsCollateralAsReal=${r.treatsCollateralAsReal}`;
});

check('X1/X2, contrast case: a genuinely non-simulated, delivered settlement DOES permit a delta / count as real', () => {
  const r = Rules.settlementRepidEffect({ is_simulated: false, status: 'delivered' });
  return r.permitsPositiveDelta === true && r.treatsCollateralAsReal === true
    ? true
    : `permitsPositiveDelta=${r.permitsPositiveDelta}, treatsCollateralAsReal=${r.treatsCollateralAsReal} — the rule must not be simulated-only in one direction`;
});

// ── X3: referral qualification via x402 requires >= 1 non-sim settlement ───

check('X3: any number of SIMULATED-only settlements never qualifies a referral', () => {
  const settlements = [
    { is_simulated: true, status: 'delivered' },
    { is_simulated: true, status: 'delivered' },
    { is_simulated: true, status: 'delivered' },
  ];
  return Rules.referralQualifiesViaX402(settlements) === false ? true : 'simulated-only settlements qualified a referral';
});

check('X3: exactly one non-simulated settlement among many simulated ones DOES qualify', () => {
  const settlements = [
    { is_simulated: true, status: 'delivered' },
    { is_simulated: false, status: 'delivered' },
    { is_simulated: true, status: 'delivered' },
  ];
  return Rules.referralQualifiesViaX402(settlements) === true ? true : 'one real settlement among simulated ones failed to qualify';
});

check('X3: zero settlements never qualifies', () => {
  return Rules.referralQualifiesViaX402([]) === false ? true : 'empty settlement list qualified a referral';
});

// ── X4: missing Capability Declaration does not mint simulated collateral as real ──

check('X4: simulated settlement stays non-real REGARDLESS of Capability Declaration presence', () => {
  const withDecl = Rules.collateralIsReal({ is_simulated: true, status: 'delivered' }, true);
  const withoutDecl = Rules.collateralIsReal({ is_simulated: true, status: 'delivered' }, false);
  return withDecl === false && withoutDecl === false
    ? true
    : `withDecl=${withDecl}, withoutDecl=${withoutDecl} — a missing declaration must not flip either`;
});

check('X4, contrast case: a genuinely non-simulated settlement is real regardless of declaration presence too', () => {
  const withDecl = Rules.collateralIsReal({ is_simulated: false, status: 'delivered' }, true);
  const withoutDecl = Rules.collateralIsReal({ is_simulated: false, status: 'delivered' }, false);
  return withDecl === true && withoutDecl === true ? true : `withDecl=${withDecl}, withoutDecl=${withoutDecl}`;
});

// ── X5: contracted pay deny (#104) => no settlement-creating step ever runs ──
//
// x402_settlements has no writer in this repo (see the module header), so
// there is no settlement ROW to inspect for this predicate. What IS real and
// live is app/api/trustrails/pay/route.ts's own control flow: a contracted-
// eval deny (403/503) must return BEFORE any step that could produce
// something "that looks approved" (Solana execution, receipt generation, or
// a RepID write). Verified by reading the actual source and checking ORDER —
// a real structural check, not a re-assertion of the rule in prose.

const routeSrc = readFileSync(join(process.cwd(), 'app/api/trustrails/pay/route.ts'), 'utf8');

check('X5: route.ts actually calls mayApproveAfterContract and can return 403/503 from it', () => {
  return /mayApproveAfterContract\(contracted\)/.test(routeSrc) &&
    /status:\s*contracted\.invoked\s*\?\s*403\s*:\s*503/.test(routeSrc)
    ? true
    : 'expected mayApproveAfterContract(...) gating a 403/503 response — source shape changed, re-check by hand';
});

check('X5: the contracted-eval deny appears BEFORE Solana execution in source order', () => {
  const denyIdx = routeSrc.indexOf('mayApproveAfterContract(contracted)');
  const executeIdx = routeSrc.indexOf('solana.execute(');
  if (denyIdx === -1) return 'mayApproveAfterContract(contracted) not found in route.ts';
  if (executeIdx === -1) return 'solana.execute( not found in route.ts';
  return denyIdx < executeIdx ? true : `deny check at offset ${denyIdx} comes AFTER solana.execute( at ${executeIdx}`;
});

check('X5: the contracted-eval deny appears BEFORE compliance receipt generation in source order', () => {
  const denyIdx = routeSrc.indexOf('mayApproveAfterContract(contracted)');
  const receiptIdx = routeSrc.indexOf('receipts.generate(');
  if (receiptIdx === -1) return 'receipts.generate( not found in route.ts';
  return denyIdx < receiptIdx ? true : `deny check at offset ${denyIdx} comes AFTER receipts.generate( at ${receiptIdx}`;
});

check('X5: the contracted-eval deny appears BEFORE any RepID write in source order', () => {
  const denyIdx = routeSrc.indexOf('mayApproveAfterContract(contracted)');
  const updateIdx = routeSrc.indexOf('kya.updateRepID(');
  if (updateIdx === -1) return 'kya.updateRepID( not found in route.ts';
  return denyIdx < updateIdx ? true : `deny check at offset ${denyIdx} comes AFTER kya.updateRepID( at ${updateIdx}`;
});

check('X5: the deny path is an actual early return, not a flag checked later (the function body does not continue past it unconditionally)', () => {
  // The deny block must itself contain a return statement between the check
  // and the next top-level step, not just set a variable.
  const denyIdx = routeSrc.indexOf('if (!mayApproveAfterContract(contracted)) {');
  if (denyIdx === -1) return 'expected "if (!mayApproveAfterContract(contracted)) {" — source shape changed';
  const blockEnd = routeSrc.indexOf('}', denyIdx);
  const block = routeSrc.slice(denyIdx, blockEnd);
  return /return NextResponse\.json/.test(block) ? true : `deny block does not contain an early return:\n${block}`;
});

// ── Report ───────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} of ${pass + failures.length} assertions`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`phase2-suite-x: ${pass} passed, 0 failed`);
console.log('VERIFIED: X1-X4 against a real (deliberately unwired) rules module; X5 against the REAL');
console.log('  app/api/trustrails/pay/route.ts control flow, by source order, not by prose restatement.');
console.log('NOT_CHECKED, by design: x402_settlements has no writer anywhere in this repo (confirmed by');
console.log('  repo-wide grep) -- X1-X4 exercise the rules for ANY settlement row shape; they do not claim');
console.log('  any live caller feeds one through yet. See lib/trustshell/x402-settlement-rules.ts\'s header.');
