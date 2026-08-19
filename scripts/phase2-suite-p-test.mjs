#!/usr/bin/env node
// scripts/phase2-suite-p-test.mjs
//
// Suite P — passport soft_landing_active (docs/policy/phase2-e2e-predicates.md,
// P1-P5), built on the REAL Suite D engine (lib/trustshell/decay-dryrun.ts) —
// not a second sigma computation that could disagree with it.
//
// npm run check:phase2-suite-p

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.phase2-suite-p-check-'));
let Decay, Passport;
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
      files: [
        join(process.cwd(), 'lib/trustshell/decay-dryrun.ts'),
        join(process.cwd(), 'lib/trustshell/passport-verification-axis.ts'),
      ],
    })
  );
  execFileSync(localTsc(), ['-p', tsconfigPath], { stdio: 'pipe' });
  Decay = await import(pathToFileURL(join(outDir, 'lib/trustshell/decay-dryrun.js')).href);
  Passport = await import(pathToFileURL(join(outDir, 'lib/trustshell/passport-verification-axis.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('FAILED: could not compile decay-dryrun.ts / passport-verification-axis.ts');
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

const NOW = 1_000_000_000_000;
const WEEK = 7 * 24 * 60 * 60 * 1000;
const R_PRE = 3217;

const decaying = Decay.dryRunDecay(
  { lastActiveAt: NOW - 5.3 * WEEK, lifecycleStatus: 'active', decayRate: 0.02, currentRepid: R_PRE },
  NOW
);
const ticks = Decay.decayEnvelopeTicks(decaying, R_PRE);
const openTick = ticks.find((t) => t.sigma === 1 && !t.isSettleTick);
const closedTick = ticks[ticks.length - 1]; // final settle tick, sigma=0 by D11

// ── P1: soft_landing_active <=> sigma=1 ─────────────────────────────────────

check('P1: soft_landing_active is true on an open (sigma=1) tick', () => {
  const axis = Passport.renderVerificationAxis(decaying, openTick);
  return axis.soft_landing_active === true ? true : `expected true, got ${axis.soft_landing_active}`;
});

check('P1: soft_landing_active is false on the closed (sigma=0) tick', () => {
  const axis = Passport.renderVerificationAxis(decaying, closedTick);
  return axis.soft_landing_active === false ? true : `expected false, got ${axis.soft_landing_active}`;
});

check('P1: soft_landing_active tracks sigma across EVERY tick in the sequence, both ways', () => {
  for (const t of ticks) {
    const axis = Passport.renderVerificationAxis(decaying, t);
    if (axis.soft_landing_active !== (t.sigma === 1)) {
      return `tick k=${t.k}: sigma=${t.sigma}, soft_landing_active=${axis.soft_landing_active}`;
    }
  }
  return true;
});

// ── P2: soft_landing_active = false after settle (D11) ─────────────────────

check('P2: after the settle tick (the same one D11 checks), soft_landing_active is false', () => {
  const axis = Passport.renderVerificationAxis(decaying, closedTick);
  return closedTick.sigma === 0 && axis.soft_landing_active === false
    ? true
    : `closedTick.sigma=${closedTick.sigma}, soft_landing_active=${axis.soft_landing_active}`;
});

// ── P3: skip (D1-D3) => soft_landing_active = false ─────────────────────────

const skippedD1 = Decay.dryRunDecay({ lastActiveAt: null, lifecycleStatus: 'active', decayRate: 0.02, currentRepid: 1000 }, NOW);
const skippedD2 = Decay.dryRunDecay({ lastActiveAt: NOW - WEEK, lifecycleStatus: 'test_only', decayRate: 0.02, currentRepid: 1000 }, NOW);
const skippedD3 = Decay.dryRunDecay({ lastActiveAt: NOW - WEEK, lifecycleStatus: 'active', decayRate: null, currentRepid: 1000 }, NOW);

for (const [label, skipped] of [['D1 (last_active_at null)', skippedD1], ['D2 (lifecycle != active)', skippedD2], ['D3 (decay_rate null)', skippedD3]]) {
  check(`P3: skip via ${label} => soft_landing_active = false`, () => {
    if (skipped.kind !== 'skip') return `fixture did not skip: kind=${skipped.kind}`;
    const axis = Passport.renderVerificationAxis(skipped);
    return axis.soft_landing_active === false ? true : `expected false, got ${axis.soft_landing_active}`;
  });
}

// ── P4: field present on the passport object (missing field => FAIL, not false) ──

check('P4: soft_landing_active key is present on every code path (skip, not_checked, open, closed)', () => {
  const notChecked = Decay.dryRunDecay({ lastActiveAt: NOW + WEEK, lifecycleStatus: 'active', decayRate: 0.02, currentRepid: 1000 }, NOW);
  const cases = [
    Passport.renderVerificationAxis(skippedD1),
    Passport.renderVerificationAxis(notChecked),
    Passport.renderVerificationAxis(decaying, openTick),
    Passport.renderVerificationAxis(decaying, closedTick),
    Passport.renderVerificationAxis(decaying), // no tick supplied at all
  ];
  const missing = cases.filter((c) => !('soft_landing_active' in c) || !('amortization_progress' in c));
  return missing.length === 0 ? true : `${missing.length} of ${cases.length} results are missing a required key`;
});

check('P4: the returned object has EXACTLY the two locked keys -- no undeclared field could silently satisfy "present"', () => {
  const axis = Passport.renderVerificationAxis(decaying, openTick);
  const keys = Object.keys(axis).sort();
  const expected = ['amortization_progress', 'soft_landing_active'];
  return JSON.stringify(keys) === JSON.stringify(expected) ? true : `keys=${JSON.stringify(keys)}, expected ${JSON.stringify(expected)}`;
});

// ── P5: soft_landing_active=true claims the envelope is open, not that decay is enforced ──

check('P5: the API surface has no "enforced"/"decayEnforced" field anywhere -- structurally cannot claim enforcement', () => {
  const axis = Passport.renderVerificationAxis(decaying, openTick);
  const serialized = JSON.stringify(axis).toLowerCase();
  return !serialized.includes('enforce') ? true : `result mentions "enforce": ${JSON.stringify(axis)}`;
});

check('P5: amortization_progress matches the locked schema pattern "^[0-9]+ of [0-9]+$" whenever non-null', () => {
  const pattern = /^[0-9]+ of [0-9]+$/;
  for (const t of ticks) {
    const axis = Passport.renderVerificationAxis(decaying, t);
    if (axis.amortization_progress !== null && !pattern.test(axis.amortization_progress)) {
      return `tick k=${t.k}: amortization_progress="${axis.amortization_progress}" does not match the schema pattern`;
    }
  }
  return true;
});

// ── Report ───────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} of ${pass + failures.length} assertions`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`phase2-suite-p: ${pass} passed, 0 failed`);
console.log('VERIFIED: Suite P (P1-P5) against the real decay-dryrun sigma output -- no second sigma computation.');
console.log('  Matches docs/contracts/events.v1.json\'s existing ZKPPassportDisclosure.verification_axis shape.');
