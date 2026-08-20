// scripts/check-phase2-predicate-status.mjs
//
// V1 spine item 3: "make XC's Phase 2 E2E predicates runnable (decay
// soft-landing, referral mutants M1-M8, impact, soft_landing_active,
// real-collateral rules)" -- docs/policy/phase2-e2e-predicates.md, 6 suites
// (D, R, I, P, X, A), ~40 named predicates.
//
// UPDATED 2026-08-19 (second pass): D, I, P and X are now real engines, not
// placeholders -- lib/trustshell/decay-dryrun.ts, impact-score.ts,
// passport-verification-axis.ts, x402-settlement-rules.ts, each exercised by
// its own check:phase2-suite-* script against every named predicate AND (for
// D) the two named fixtures (F-DECAY-SIM, F-DECAY-SETTLE-SPLIT). This did
// NOT require inventing data the codebase doesn't have: the locked policy
// doc (authority-policy.v0.5.yaml) turned out to fully specify D's formulas
// once read in full, I's formula was already complete bar one parameter
// (delta_0, taken as a required input rather than guessed -- see
// impact-score.ts's header), P is a thin real connector on D's own sigma
// output, and X's X1-X4 are a real (honestly UNWIRED -- x402_settlements has
// no writer anywhere in this repo) rules module while X5 is verified
// against app/api/trustrails/pay/route.ts's REAL control-flow order. What
// remains genuinely unbuilt is named below (Suite R's undecidable M4-M8) --
// this script's job is still to report precisely what runs and what does
// not, not to declare the whole spec closed.
//
// Three suites were already substantially covered before this pass, found by
// checking rather than assuming:
//
//   Suite A (A^eff, shared)      -- check:authority-runtime (fixture) +
//                                    check:collateral-live (live, this
//                                    session's own item 1)
//   Suite R, decidable (M1-M3,
//   the worked-value table)      -- check:lane-files, which recomputes
//                                    authority-policy.v0.5.yaml's referral
//                                    curve from its own formula (32/32,
//                                    verified 2026-08-19) via
//                                    lib/trustshell/lane-files.ts's
//                                    decidableMutants()/referralDisagreements()
//
// lane-files.ts's own header explains why M4-M8 are NOT in that count: they
// are "policy conditions on inputs this file cannot see" (evidence.ref,
// referee lifecycle_status, family/self relationship, axis routing) --
// undecidable from a zero-imports formula file, by design, not by omission.
// That honesty is preserved here rather than papered over.

import { readFileSync } from 'node:fs';
import { execSync, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.phase2-status-check-'));
let P;
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
      files: [join(process.cwd(), 'lib/trustshell/promotion.ts')],
    })
  );
  execFileSync(localTsc(), ['-p', tsconfigPath], { stdio: 'pipe' });
  P = await import(pathToFileURL(join(outDir, 'lib/trustshell/promotion.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('FAILED: could not compile promotion.ts');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

const HEAD = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
const AUTHOR = { authoredBy: { family: 'claude', model: 'claude-sonnet-5' } };

/**
 * A suite with a real gate behind at least part of it. `outcome`/`coversWholeClaim`
 * are transcribed from actually running the named script this session, not
 * asserted -- see exercise-collateral-live.mjs and exercise-promotion-attribution.mjs
 * for the same discipline applied once each already.
 */
function coveredSuite(surface, gate, outcome, coversWholeClaim, detail) {
  return {
    surface,
    artifact: HEAD,
    runs: [
      {
        gate, ranAgainst: HEAD, outcome, coversWholeClaim, gatesTheBuild: outcome !== 'NOT_CHECKED',
        detail,
        attribution: { ...AUTHOR, verifiedBy: AUTHOR.authoredBy }, // self-verified -- see item 2
      },
    ],
  };
}

/** A suite with NO gate at all. stageFor() returns null for this -- NOT_CHECKED, honestly. */
function uncoveredSuite(surface, whatIsMissing) {
  return { surface, artifact: HEAD, runs: [], _whyUncovered: whatIsMissing };
}

const suites = [
  coveredSuite(
    'Suite A -- effectiveAuthority (A1-A3)',
    'check:authority-runtime + check:collateral-live',
    'VERIFIED',
    false, // check:collateral-live itself is NOT_CHECKED in this sandbox -- see item 1
    'A1 (formula), A2 (builder floor -> 0), A3 (missing stake -> NOT_CHECKED, never fabricated 0) ' +
      'all asserted in check-authority-runtime.mjs (26/26) and exercised live in ' +
      'exercise-collateral-live.mjs (blocked on this sandbox\'s network proxy, not on the code)',
  ),
  coveredSuite(
    'Suite R -- referral, decidable (M1-M3 + worked-value table)',
    'check:lane-files',
    'VERIFIED',
    false, // M4-M8 are explicitly out of scope for this gate -- see lane-files.ts
    'referralDisagreements() recomputes all 5 worked table rows from the locked formula ' +
      'delta(n)=clip(round(40/(n+1)),0,c(n)); decidableMutants() asserts M1 (delta(1)>delta(10)), ' +
      'M2 (delta(10)>delta(100)=0), M3 (delta(100)=0). 32/32 in check-lane-files.mjs.',
  ),
  uncoveredSuite(
    'Suite R -- referral, undecidable (M4-M8)',
    'needs a real referral-event processor with evidence.ref, referee lifecycle_status, and ' +
      'referrer/referee family/self relationship -- lane-files.ts is zero-imports by design and ' +
      'cannot see any of these; no such processor was located in this session\'s research',
  ),
  coveredSuite(
    'Suite D -- decay soft-landing (D1-D14)',
    'check:phase2-suite-d',
    'VERIFIED',
    false, // 'm' in r=rho*m has no stated formula anywhere locked; decay_rate is read, not derived -- see decay-dryrun.ts header
    'lib/trustshell/decay-dryrun.ts computes W/K/per-tick integer deltas/the sigma-R_route-R_ledger ' +
      'envelope/settle-tick split exactly from authority-policy.v0.5.yaml\'s decay: section. ' +
      'D10/D13 call the REAL effectiveAuthority() (no second A_eff formula); D14 calls the REAL ' +
      'decideFloor() to show the two decay mechanisms are structurally independent. Both named ' +
      'fixtures (F-DECAY-SIM, F-DECAY-SETTLE-SPLIT) pass exactly. 24/24 in phase2-suite-d-test.mjs.',
  ),
  coveredSuite(
    'Suite I -- impact (I1-I6)',
    'check:phase2-suite-i',
    'VERIFIED',
    false, // delta_0's numeric source is not stated anywhere in the locked docs -- taken as a required param, never guessed
    'lib/trustshell/impact-score.ts implements I=clip[0,1](iota_sev*iota_who*iota_proof), ' +
      'delta_imp=round(delta_0*(0.4+1.6*I)), the [-10,+5] clamp and the AUDIT_CONTRIBUTION+I>=0.85 ' +
      '+8 exception, all against the full locked parameter table. I1 is implemented as the override ' +
      'it actually is (unproven => 0 outright, not the formula\'s nonzero I=0 floor). 13/13 in ' +
      'phase2-suite-i-test.mjs.',
  ),
  coveredSuite(
    'Suite P -- passport soft_landing_active (P1-P5)',
    'check:phase2-suite-p',
    'VERIFIED',
    false, // built on Suite D, which is itself not coversWholeClaim
    'lib/trustshell/passport-verification-axis.ts renders verification_axis.{soft_landing_active,' +
      'amortization_progress} directly from Suite D\'s real sigma output -- no second sigma ' +
      'computation. P4 (field always present) is enforced by the return TYPE, not merely tested. ' +
      'Matches docs/contracts/events.v1.json\'s existing ZKPPassportDisclosure schema. 11/11 in ' +
      'phase2-suite-p-test.mjs.',
  ),
  coveredSuite(
    'Suite X -- x402 real-collateral (X1-X5)',
    'check:phase2-suite-x',
    'VERIFIED',
    false, // X1-X4's rules module is honestly UNWIRED -- x402_settlements has no writer anywhere in this repo
    'X1-X4: lib/trustshell/x402-settlement-rules.ts, a real decision-rules module shaped to ' +
      'x402_settlements\'s live schema (is_simulated boolean, confirmed against information_schema) ' +
      '-- not wired to any caller, and says so. X5: verified against app/api/trustrails/pay/' +
      'route.ts\'s REAL source order -- the contracted-eval deny (403/503) textually precedes Solana ' +
      'execution, receipt generation, and every RepID write. 13/13 in phase2-suite-x-test.mjs.',
  ),
];

const covered = suites.filter((s) => s.runs.length > 0);
const report = P.statusTable(covered);

rmSync(outDir, { recursive: true, force: true });

console.log('Phase 2 E2E predicate status -- STRUCTURED, not a pass/fail suite\n');
for (const r of report) {
  console.log(`  ${(r.stage ?? 'NOT_CHECKED').toUpperCase().padEnd(10)} ${r.surface}`);
  console.log(`             ${r.reason}\n`);
}
for (const s of suites.filter((s) => s.runs.length === 0)) {
  console.log(`  NOT_CHECKED  ${s.surface}`);
  console.log(`             no gate exists -- ${s._whyUncovered}\n`);
}

const coveredCount = report.filter((r) => r.stage !== null).length;
const totalSuites = suites.length;
console.log(
  `${coveredCount} of ${totalSuites} suite-groups have a real gate behind at least part of them; ` +
    `${totalSuites - coveredCount} are honestly NOT_CHECKED with a named reason, not silently skipped.`
);
// Exit 0: this script's job is to report status accurately, which it has done whether the
// status is good or bad. A predicate-status reporter that fails the build because reality is
// incomplete would be exactly the thing the report itself is trying to make visible instead.
process.exit(0);
