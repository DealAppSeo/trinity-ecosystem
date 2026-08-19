// scripts/check-authority-runtime.mjs
//
// Real collateral, and the first runtime consumer of the authority policy.
//
// Two modules, one suite, because they are one seam: `collateral.ts` produces
// `S_usd` and `authority-policy.ts` turns it into a spending ceiling. Getting
// either wrong hands out authority nobody backed.
//
// ── THE SAMPLE, MEASURED BEFORE THE CODE ────────────────────────────────────
//
// `public.stake_deposits`, live, 2026-08-19:
//
//   is_simulated  status      asset  rows   sum(amount)      = USDC
//   true          active      USDC     49   4,622,000,000      4,622
//   true          completed   USDC      2   1,050,000,000      1,050
//   false         active      USDC      1      50,000,000         50
//
// ONE real deposit; fifty-one simulated. Summing the table gives 5,722 USDC
// against a truth of 50 — **114x**. That figure feeds `100 * sqrt(S_usd)`:
// sqrt(5722)=75.6 vs sqrt(50)=7.07, so an unfiltered sum hands out more than
// **ten times** the collateralised authority.
//
// Two traps the column names do not advertise, and both are asserted below:
//   1. ALL 49 simulated active rows carry a tx_hash. "Has a hash" selects the
//      SIMULATED set almost perfectly. `is_simulated` is the authority.
//   2. `completed` deposits are closed. Counting them lets withdrawn money keep
//      buying authority.
//
// ── THE POLICY CONSUMER ─────────────────────────────────────────────────────
//
// `check:lane-files` grades the policy file soft-live because NOTHING IN THE
// RUNTIME READS IT — `effectiveAuthority` and `authorityPolicy` were measured
// absent from lib/ and app/. This suite drives the new consumer against the REAL
// YAML FILE, not a fixture, so the constants it uses are the constants XC wrote.
//
// The load-bearing assertion is that **no constant has a default**. A default
// would be a second copy of the policy: the runtime would drift from the file
// while every gate went on grading the file, and the system would report
// agreement it had not earned. `RepIDConfig` produced exactly that shape once —
// an unreadable institution threshold silently became 5000, LOWERING the bar for
// an institution that had stored a stricter number.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { localTsc } from './local-tsc.mjs';
import { stripComments } from './lib/module-specifiers.mjs';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');

const outDir = mkdtempSync(join(process.cwd(), '.authority-runtime-check-'));
let C, A;
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
        join(process.cwd(), 'lib/trustshell/collateral.ts'),
        join(process.cwd(), 'lib/trustshell/authority-policy.ts'),
      ],
    })
  );
  execFileSync(localTsc(), ['-p', tsconfigPath], { stdio: 'pipe' });
  C = await import(pathToFileURL(join(outDir, 'lib/trustshell/collateral.js')).href);
  A = await import(pathToFileURL(join(outDir, 'lib/trustshell/authority-policy.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('FAILED: could not compile the authority modules');
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

// The live table's shape, transcribed from the query above. Every simulated
// active row carries a hash, because that is what the real table does.
const LIVE_ROWS = [
  ...Array.from({ length: 49 }, (_, i) => ({
    builder_id: `sim-${i}`, amount: '94326530', asset: 'USDC',
    is_simulated: true, status: 'active', tx_hash: `0xsim${i}`,
  })),
  { builder_id: 'sim-a', amount: '525000000', asset: 'USDC', is_simulated: true, status: 'completed', tx_hash: null },
  { builder_id: 'sim-b', amount: '525000000', asset: 'USDC', is_simulated: true, status: 'completed', tx_hash: null },
  { builder_id: 'real-1', amount: '50000000', asset: 'USDC', is_simulated: false, status: 'active', tx_hash: '0xreal' },
];

// ── 1. Real collateral ──────────────────────────────────────────────────────

check('the live table yields 50 USDC, not 5,722', () => {
  const r = C.realCollateralUsd(LIVE_ROWS);
  return r.usd === 50 && r.outcome === 'MEASURED' && r.countedRows === 1
    ? true
    : `got ${r.usd} from ${r.countedRows} row(s) — the unfiltered sum is 5,722`;
});

check('the overstatement from summing everything is >100x, and stays visible', () => {
  const o = C.overstatementIfUnfiltered(LIVE_ROWS);
  return o.ratio !== null && o.ratio > 100
    ? true
    : `ratio ${o.ratio} — the 114x must not become invisible`;
});

check('a TX HASH does not make a deposit real', () => {
  // All 49 simulated active rows have one. Filtering on the hash selects the
  // simulated set almost perfectly, which is the trap.
  const withHash = LIVE_ROWS.filter((r) => r.tx_hash);
  const simWithHash = withHash.filter((r) => r.is_simulated).length;
  if (simWithHash === 0) return 'fixture is wrong: no simulated row carries a hash';
  const r = C.realCollateralUsd(withHash);
  return r.usd === 50
    ? true
    : `filtering by hash yielded ${r.usd} — is_simulated is the authority, not the hash`;
});

check('COMPLETED deposits do not collateralise', () => {
  const completedReal = [
    { builder_id: 'b', amount: '900000000', asset: 'USDC', is_simulated: false, status: 'completed' },
  ];
  const r = C.realCollateralUsd(completedReal);
  return r.usd === 0 && r.excluded.notActive === 1
    ? true
    : `a closed deposit contributed ${r.usd} — withdrawn money would keep buying authority`;
});

check('an unknown asset is NOT_CHECKED, not silently rescaled', () => {
  const r = C.realCollateralUsd([
    { builder_id: 'b', amount: '1000000000000000000', asset: 'ETH', is_simulated: false, status: 'active' },
  ]);
  return r.usd === null && r.outcome === 'NOT_CHECKED'
    ? true
    : `an ETH row produced ${r.usd} — dividing wei by 1e6 misprices it by 1e12`;
});

check('a partial sum is never reported as a total', () => {
  const r = C.realCollateralUsd([
    { builder_id: 'b', amount: '50000000', asset: 'USDC', is_simulated: false, status: 'active' },
    { builder_id: 'b', amount: 'not-a-number', asset: 'USDC', is_simulated: false, status: 'active' },
  ]);
  return r.usd === null
    ? true
    : `reported ${r.usd} while one row was unreadable — this number is a spending ceiling`;
});

check('NONE and NOT_CHECKED are different answers', () => {
  const none = C.realCollateralUsd([
    { builder_id: 'b', amount: '1', asset: 'USDC', is_simulated: true, status: 'active' },
  ]);
  const unknown = C.realCollateralUsd([
    { builder_id: 'b', amount: '1', asset: 'WBTC', is_simulated: false, status: 'active' },
  ]);
  return none.usd === 0 && none.outcome === 'NONE' && unknown.usd === null
    ? true
    : `none=${none.usd}/${none.outcome}, unknown=${unknown.usd}/${unknown.outcome}`;
});

// ── 2. The policy consumer, driven against the REAL FILE ───────────────────

const POLICY_PATH = 'docs/policy/authority-policy.v0.5.yaml';
const doc = yaml.load(readFileSync(POLICY_PATH, 'utf8'));
const load = A.loadAuthorityPolicy(doc);

check('the real policy file loads', () =>
  load.ok ? true : `missing: ${load.missing?.join(', ')}`);

check('every constant comes FROM the file, matching it exactly', () => {
  if (!load.ok) return 'policy did not load';
  const p = load.policy;
  if (p.builderFloor !== doc.authority.builder_floor)
    return `builderFloor ${p.builderFloor} vs file ${doc.authority.builder_floor}`;
  if (p.lambdaSigma !== doc.decay.lambda_sigma)
    return `lambdaSigma ${p.lambdaSigma} vs file ${doc.decay.lambda_sigma}`;
  for (const axis of ['S', 'P', 'H', 'Q', 'E']) {
    if (p.weights[axis] !== doc.composite.weights[axis])
      return `weight ${axis} ${p.weights[axis]} vs file ${doc.composite.weights[axis]}`;
  }
  return true;
});

check('the anti-whale multiplier is PARSED from the formula, not hardcoded', () => {
  if (!load.ok) return 'policy did not load';
  const inFile = String(doc.authority.A).match(/(\d+(?:\.\d+)?)\s*\*\s*sqrt\(/);
  return inFile && load.policy.antiWhaleMultiplier === Number(inFile[1])
    ? true
    : `parsed ${load.policy?.antiWhaleMultiplier} from "${doc.authority.A}"`;
});

check('the file\'s five weights sum to 1', () =>
  load.ok && A.weightsSumToOne(load.policy) ? true : 'the composite is not a weighted mean');

check('a MISSING field returns NOT_CHECKED — never a default', () => {
  const stripped = JSON.parse(JSON.stringify(doc));
  delete stripped.authority.builder_floor;
  const r = A.loadAuthorityPolicy(stripped);
  return !r.ok && r.missing.includes('authority.builder_floor')
    ? true
    : 'a missing builder_floor was defaulted — that is a second copy of the policy';
});

check('the module contains NO numeric fallback for a policy constant', () => {
  // A `?? 500` or `|| 0.5` is the whole failure mode, and it is invisible at
  // runtime until the file changes. Grep the source, comments stripped.
  const src = stripComments(readFileSync('lib/trustshell/authority-policy.ts', 'utf8'));
  const fallbacks = src.match(/(\?\?|\|\|)\s*\d+(\.\d+)?/g) ?? [];
  return fallbacks.length === 0
    ? true
    : `numeric fallback(s) present: ${fallbacks.join(', ')} — the runtime would drift from the file silently`;
});

// ── 3. effectiveAuthority ──────────────────────────────────────────────────

check('A_eff is zero below the builder floor, and says which term bound it', () => {
  if (!load.ok) return 'policy did not load';
  const r = A.effectiveAuthority({ rRoute: 9000, stakeUsd: 10000, builderScore: 499 }, load.policy);
  return r.aEff === 0 && r.bindingTerm === 'builder_floor'
    ? true
    : `aEff ${r.aEff}, bound by ${r.bindingTerm}`;
});

check('the anti-whale term binds when stake is small', () => {
  if (!load.ok) return 'policy did not load';
  // The live case: 50 USDC of real collateral. 100*sqrt(50) = 707.
  const r = A.effectiveAuthority({ rRoute: 9000, stakeUsd: 50, builderScore: 600 }, load.policy);
  return r.bindingTerm === 'anti_whale_sqrt_stake' && Math.abs(r.aEff - 707.106) < 0.01
    ? true
    : `aEff ${r.aEff} bound by ${r.bindingTerm}`;
});

check('r_route binds when stake is large', () => {
  if (!load.ok) return 'policy did not load';
  const r = A.effectiveAuthority({ rRoute: 500, stakeUsd: 1_000_000, builderScore: 600 }, load.policy);
  return r.bindingTerm === 'r_route' && r.aEff === 500
    ? true
    : `aEff ${r.aEff} bound by ${r.bindingTerm}`;
});

check('unknown collateral is NOT_CHECKED — it does not spend as zero or as anything', () => {
  if (!load.ok) return 'policy did not load';
  const r = A.effectiveAuthority({ rRoute: 9000, stakeUsd: null, builderScore: 600 }, load.policy);
  return r.aEff === null && r.outcome === 'NOT_CHECKED' && /not zero backing/.test(r.detail)
    ? true
    : `unknown backing produced aEff ${r.aEff} (${r.outcome}): ${r.detail} — "could not read the ` +
      'backing" and "there is no backing" must not collapse into one answer';
});

check('the UNFILTERED collateral would grant >10x the authority', () => {
  if (!load.ok) return 'policy did not load';
  const real = A.effectiveAuthority({ rRoute: 9000, stakeUsd: 50, builderScore: 600 }, load.policy);
  const inflated = A.effectiveAuthority({ rRoute: 9000, stakeUsd: 5722, builderScore: 600 }, load.policy);
  return inflated.aEff / real.aEff > 10
    ? true
    : `inflated/real = ${(inflated.aEff / real.aEff).toFixed(2)} — the point of filtering is this ratio`;
});

rmSync(outDir, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} of ${pass + failures.length} assertions`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`VERIFIED: ${pass} assertions — collateral is real, and A_eff reads the policy file`);
