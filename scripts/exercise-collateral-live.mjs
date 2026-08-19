// scripts/exercise-collateral-live.mjs
//
// Exercises collateral.ts and authority-policy.ts against the LIVE
// stake_deposits table, not the hand-transcribed fixture check-authority-
// runtime.mjs uses. Same modules, same invariant, a different kind of
// evidence: this proves the pure functions agree with the database as it
// stands right now, not with a snapshot someone typed out once.
//
// Read-only. No table is written. Uses @supabase/supabase-js directly
// (SUPABASE_URL / SUPABASE_SERVICE_KEY from env) rather than
// getSupabaseAdmin(), because this is a standalone script, not a Next.js
// route module — lib/CLAUDE.md's "never construct at module scope" rule is
// about avoiding a client built at Next build time inside the app; it does
// not apply to a script that only ever runs from the CLI.
//
// V1 spine item 1 (2026-08-19): "exercise A_eff + real collateral on the
// live pay/authority path ... assertions that simulated stake cannot
// inflate authority." The real caller and the fixture-based assertions
// already existed (check-authority-runtime.mjs, 26/26 green) before this
// script was written — this adds the live half.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import { localTsc } from './local-tsc.mjs';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.log(
    'NOT_CHECKED: no Supabase credentials in this environment ' +
      '(looked for NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SECRET_KEY/' +
      'SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY/SUPABASE_KEY). ' +
      'Not a failure of the code under test -- there is nothing to exercise it against.'
  );
  process.exit(2);
}

const outDir = mkdtempSync(join(process.cwd(), '.collateral-live-check-'));
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

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

// ── 1. Fetch the REAL table, live, right now ────────────────────────────────

const { data: allRows, error: allErr } = await supabase
  .from('stake_deposits')
  .select('builder_id, amount, asset, is_simulated, status, tx_hash');

if (allErr) {
  rmSync(outDir, { recursive: true, force: true });
  // NOT_CHECKED (exit 2), not FAILED: nothing below has run an assertion yet,
  // this is "could not reach the table," not "the code is wrong." In this
  // sandboxed session specifically, qnnpjhlxljtqyigedwkb.supabase.co is
  // denied by the outbound proxy (see trinity-ecosystem/CLAUDE.md, "Network,
  // in cloud/remote sessions") -- a fetch TypeError here is that, not a real
  // outage. Re-run from CI, Vercel, or a local machine with normal network
  // access; this script does not know which case it is in and must not guess.
  console.log(`NOT_CHECKED: could not read stake_deposits live: ${allErr.message}`);
  process.exit(2);
}

check('the live table has rows to exercise against', () =>
  allRows.length > 0 ? true : 'stake_deposits is empty -- nothing to exercise');

// ── 2. The one real, active, USDC deposit -- fetched, not assumed ──────────

const realRows = allRows.filter(
  (r) => r.is_simulated === false && r.status === 'active' && r.asset === 'USDC'
);

check('there is exactly one real active USDC deposit, live', () =>
  realRows.length === 1 ? true : `found ${realRows.length}, expected 1 -- the fixture in check-authority-runtime.mjs may now be stale`);

const realBuilderId = realRows[0]?.builder_id;

check('realCollateralUsd on the live real-deposit row(s) is not inflated by the rest of the table', () => {
  const r = C.realCollateralUsd(allRows.filter((row) => row.builder_id === realBuilderId));
  return r.outcome === 'MEASURED' && r.usd !== null && r.usd > 0
    ? true
    : `outcome ${r.outcome}, usd ${r.usd} for the live real builder`;
});

// ── 3. A builder with ONLY simulated deposits -- live, not a fixture ───────

const simulatedBuilderIds = [
  ...new Set(allRows.filter((r) => r.is_simulated).map((r) => r.builder_id)),
].filter((id) => id !== realBuilderId);

check('at least one live builder_id has only simulated deposits, to exercise the filter against', () =>
  simulatedBuilderIds.length > 0 ? true : 'no purely-simulated builder found in the live table');

if (simulatedBuilderIds[0]) {
  const simOnlyRows = allRows.filter((r) => r.builder_id === simulatedBuilderIds[0]);
  check('a live, purely-simulated builder computes to NONE (0), not its simulated sum', () => {
    const r = C.realCollateralUsd(simOnlyRows);
    const simulatedSum = simOnlyRows.reduce((s, row) => s + Number(row.amount), 0) / C.USDC_SCALE;
    return r.usd === 0 && r.outcome === 'NONE' && simulatedSum > 0
      ? true
      : `usd ${r.usd} (${r.outcome}) -- the simulated sum was ${simulatedSum} USDC and must not leak through`;
  });
}

// ── 4. The overstatement, measured against the table as it is RIGHT NOW ────

check('summing the LIVE table unfiltered overstates real collateral by >100x, right now', () => {
  const o = C.overstatementIfUnfiltered(allRows);
  return o.ratio !== null && o.ratio > 100
    ? true
    : `live ratio ${o.ratio} -- either the table changed shape or the filter regressed`;
});

// ── 5. effectiveAuthority, end to end, against the LIVE real deposit ───────

const POLICY_PATH = 'docs/policy/authority-policy.v0.5.yaml';
const doc = yaml.load(readFileSync(POLICY_PATH, 'utf8'));
const load = A.loadAuthorityPolicy(doc);

if (load.ok && realBuilderId) {
  const real = C.realCollateralUsd(allRows.filter((r) => r.builder_id === realBuilderId));
  const allSum = C.overstatementIfUnfiltered(allRows).unfilteredUsd;

  check('A_eff on the LIVE real collateral is bounded correctly', () => {
    const r = A.effectiveAuthority(
      { rRoute: 9000, stakeUsd: real.usd, builderScore: 600 },
      load.policy
    );
    return r.aEff !== null && r.aEff > 0 && r.aEff < 1000
      ? true
      : `aEff ${r.aEff} on real live collateral of ${real.usd} USDC looks wrong`;
  });

  check('A_eff on the UNFILTERED live table would grant materially more authority than the real figure', () => {
    const rReal = A.effectiveAuthority({ rRoute: 9000, stakeUsd: real.usd, builderScore: 600 }, load.policy);
    const rInflated = A.effectiveAuthority({ rRoute: 9000, stakeUsd: allSum, builderScore: 600 }, load.policy);
    return rInflated.aEff / rReal.aEff > 5
      ? true
      : `inflated/real = ${(rInflated.aEff / rReal.aEff).toFixed(2)} on live data -- the gap that makes filtering matter`;
  });
} else {
  failures.push('effectiveAuthority live check: policy did not load or no real builder id was found');
}

rmSync(outDir, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} of ${pass + failures.length} live assertions`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `VERIFIED: ${pass} assertions against the LIVE stake_deposits table -- ` +
    'real collateral and A_eff hold against today\'s actual data, not only a fixture'
);
