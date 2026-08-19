// scripts/exercise-attestation-presence.mjs
//
// Item B (2026-08-19): exercises lib/trustshell/attestation-presence.ts
// against THIS SESSION's own real, already-produced facts -- not synthetic
// fixtures -- the same discipline exercise-promotion-attribution.mjs applied
// to the verifier-independence seam.
//
// The two inputs below are transcribed from actually running these commands
// on this branch, not asserted:
//   `node scripts/exercise-collateral-live.mjs` printed "NOT_CHECKED: could
//   not read stake_deposits live" (exit 2) -- this sandbox's outbound proxy
//   denies qnnpjhlxljtqyigedwkb.supabase.co, see that script's own header.
//   `node scripts/exercise-promotion-attribution.mjs` printed "Honest verdict
//   ... stage=observe, not promotable -- self-verified" -- both attribution
//   and verification on this branch are claude/claude, i.e. SHARED_FAMILY,
//   not the NOT_CHECKED default (attribution was recorded, just not disjoint).
//
// Re-run both yourself before trusting these two lines if this script is read
// outside of that session.

import { execSync, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.attestation-presence-check-'));
let A;
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
      files: [join(process.cwd(), 'lib/trustshell/attestation-presence.ts')],
    })
  );
  execFileSync(localTsc(), ['-p', tsconfigPath], { stdio: 'pipe' });
  A = await import(pathToFileURL(join(outDir, 'lib/trustshell/attestation-presence.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('FAILED: could not compile attestation-presence.ts');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

const HEAD = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();

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

// ── Attestation #2: collateral + contracted eval, against this branch's REAL facts ──

const realCollateralOnThisBranch = { outcome: 'NOT_CHECKED' }; // exercise-collateral-live.mjs, this session
const realIndependenceOnThisBranch = { independence: 'SHARED_FAMILY' }; // exercise-promotion-attribution.mjs, this session

const collateralEvalVerdict = A.describeCollateralEvalAttestationPresence(
  realCollateralOnThisBranch,
  realIndependenceOnThisBranch
);

check('collateral-eval on this branch\'s real facts reports NOT_CHECKED (collateral leads)', () => {
  return collateralEvalVerdict.presence === 'NOT_CHECKED'
    ? true
    : `expected NOT_CHECKED, got ${collateralEvalVerdict.presence} -- ${collateralEvalVerdict.detail}`;
});

check('collateral-eval carries the proposed namespaced tag', () => {
  return collateralEvalVerdict.tag === 'trustshell:collateral-eval:v1'
    ? true
    : `unexpected tag: ${collateralEvalVerdict.tag}`;
});

// A confirmed-negative combination (both inputs resolved, one is a genuine
// negative) must report FAILED, not NOT_CHECKED -- the whole point of §2's
// x402PaymentProof warning. Exercise it explicitly, not just the branch's own
// (still-unresolved) case above.
check('a resolved, confirmed-negative pair reports FAILED, not NOT_CHECKED', () => {
  const v = A.describeCollateralEvalAttestationPresence({ outcome: 'NONE' }, { independence: 'DISJOINT' });
  return v.presence === 'FAILED' ? true : `expected FAILED, got ${v.presence} -- ${v.detail}`;
});

check('MEASURED is reachable, and only from the one honest combination', () => {
  const v = A.describeCollateralEvalAttestationPresence({ outcome: 'MEASURED' }, { independence: 'DISJOINT' });
  return v.presence === 'MEASURED' ? true : `expected MEASURED, got ${v.presence} -- ${v.detail}`;
});

check('MEASURED collateral alone (independence still SHARED_FAMILY) is FAILED, not MEASURED', () => {
  const v = A.describeCollateralEvalAttestationPresence({ outcome: 'MEASURED' }, { independence: 'SHARED_FAMILY' });
  return v.presence === 'FAILED'
    ? true
    : `expected FAILED (independence must ALSO be DISJOINT, not just collateral real), got ${v.presence}`;
});

// ── Attestation #1: soft-landing range proof -- must be structurally unable to report MEASURED today ──

check('witnessHidden=false can never report MEASURED, however "proven" the commitment is', () => {
  const v = A.describeSoftLandingRangeAttestationPresence({ witnessHidden: false, proven: true, predicateHolds: true });
  return v.presence === 'NOT_CHECKED'
    ? true
    : `expected NOT_CHECKED (a bound-but-visible value must never be reported as a range attestation), got ${v.presence}`;
});

check('witnessHidden=true, proven=false is NOT_CHECKED, not FAILED (no prover ran, no false claim was made)', () => {
  const v = A.describeSoftLandingRangeAttestationPresence({ witnessHidden: true, proven: false, predicateHolds: false });
  return v.presence === 'NOT_CHECKED' ? true : `expected NOT_CHECKED, got ${v.presence}`;
});

check('a real hiding proof that disproves the range reports FAILED, not NOT_CHECKED', () => {
  const v = A.describeSoftLandingRangeAttestationPresence({ witnessHidden: true, proven: true, predicateHolds: false });
  return v.presence === 'FAILED' ? true : `expected FAILED, got ${v.presence}`;
});

check('MEASURED is reachable for the range attestation, in principle, once witnessHidden is real', () => {
  const v = A.describeSoftLandingRangeAttestationPresence({ witnessHidden: true, proven: true, predicateHolds: true });
  return v.presence === 'MEASURED' ? true : `expected MEASURED, got ${v.presence}`;
});

// This repo's ACTUAL provider today: WebCryptoProofProvider, witnessHidden always false.
// Exercised as the honest "if you ran this for real, right now" case.
check('the only provider actually available today (WebCryptoProofProvider-shaped) reports NOT_CHECKED', () => {
  const v = A.describeSoftLandingRangeAttestationPresence({ witnessHidden: false, proven: true, predicateHolds: true });
  return v.presence === 'NOT_CHECKED'
    ? true
    : `this repo's real provider must not be reportable as MEASURED -- got ${v.presence}`;
});

rmSync(outDir, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} of ${pass + failures.length} assertions`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`VERIFIED: ${pass} assertions -- attestation-presence.ts exercised against real inputs`);
console.log(`  @ ${HEAD.slice(0, 12)}`);
console.log(
  `  Attestation #2 (collateral+eval) on THIS branch's real facts today: ` +
    `${collateralEvalVerdict.presence} -- ${collateralEvalVerdict.detail}`
);
console.log(
  '  Attestation #1 (soft-landing range) with this repo\'s only available provider today: ' +
    'NOT_CHECKED -- witnessHidden=false is structural, not a config choice (see proposal doc §4).'
);
console.log(
  '  Neither is wired to a GateRun, a chain, or the pay route -- see ' +
    'docs/ERC8004-ZK-ATTESTATION-PROPOSAL-2026-08-19.md for what this does NOT establish.'
);
