// scripts/check-reward-earned.mjs
//
// The payment path handed out +10 RepID for a payment that never happened.
//
// `app/api/trustrails/pay/route.ts` step 6 called
// `updateRepID(agentName, 10, 'Successful compliant payment: N USDC')`
// unconditionally, on the approved branch, beneath a response that could report
// `bft.evaluated:false` and `settlement.simulated:true` for the SAME request.
//
// `check:payment-fail-posture` already pins the disclosure — the route tells the
// caller when consensus did not run. Nothing pinned what the route then WROTE.
// The two disagreed, and the write is the durable half: `updateRepID` sets
// `repid_score`, recomputes `repid_tier`, and rewrites both spending limits, so
// the unearned reward raises the ceiling on the next request. No idempotency
// key, no authentication on the route: N calls are +10N.
//
// Both preconditions fail by DEFAULT — BFT_ENFORCEMENT_MODE defaults to observe
// (returns passed:true, evaluated:false) and the executor simulates whenever
// AGENT_SOPHIA_SECRET_BYTES is unset. So this was the normal configuration.
//
// This suite drives `lib/trustshell/reward.ts` over the truth table, and greps
// the route to hold the wiring: a decision module nothing calls is the shape
// LESSONS records for `auditor-grant.ts`, which had zero importers for a sprint.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.reward-check-'));
let R;
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
      files: [join(process.cwd(), 'lib/trustshell/reward.ts')],
    })
  );
  execFileSync(localTsc(), ['-p', tsconfigPath], { stdio: 'pipe' });
  R = await import(pathToFileURL(join(outDir, 'lib/trustshell/reward.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('FAILED: could not compile lib/trustshell/reward.ts');
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

const EARNED = {
  consensusEvaluated: true,
  consensusPassed: true,
  settlementSimulated: false,
  settlementConfirmed: true,
};

// ── 1. The only combination that pays ───────────────────────────────────────

check('consensus passed + settlement confirmed earns exactly SUCCESS_REWARD', () => {
  const d = R.rewardFor(EARNED);
  if (d.outcome !== 'EARNED') return `outcome ${d.outcome}`;
  if (d.delta !== R.SUCCESS_REWARD) return `delta ${d.delta} != ${R.SUCCESS_REWARD}`;
  return d.unmet.length === 0 ? true : `unmet non-empty: ${d.unmet.join(', ')}`;
});

check('SUCCESS_REWARD is the 10 the route used to hardcode', () =>
  R.SUCCESS_REWARD === 10 ? true : `SUCCESS_REWARD is ${R.SUCCESS_REWARD}`);

// ── 2. The default configuration pays NOTHING ───────────────────────────────
//
// This is the bug, stated as an assertion: observe mode plus a simulated
// executor is what an unconfigured deployment does on every request.

check('DEFAULT CONFIG (observe mode + simulated executor) earns nothing', () => {
  const d = R.rewardFor({
    consensusEvaluated: false,
    consensusPassed: true,   // observe mode returns passed:true — the whole trap
    settlementSimulated: true,
    settlementConfirmed: false,
  });
  if (d.delta !== 0) return `paid ${d.delta} on the default path`;
  if (d.outcome !== 'WITHHELD_NOT_CHECKED') return `outcome ${d.outcome}`;
  return d.unmet.length === 2 ? true : `expected 2 unmet, got ${d.unmet.length}`;
});

check('passed:true without evaluated:true is not a consensus result', () => {
  const d = R.rewardFor({ ...EARNED, consensusEvaluated: false });
  return d.delta === 0 && d.outcome === 'WITHHELD_NOT_CHECKED'
    ? true
    : `delta ${d.delta}, outcome ${d.outcome}`;
});

// ── 3. Each precondition alone is enough to withhold ────────────────────────

check('a simulated settlement withholds even with real consensus', () => {
  const d = R.rewardFor({ ...EARNED, settlementSimulated: true, settlementConfirmed: false });
  return d.delta === 0 && d.unmet.some((u) => /SIMULATED/.test(u))
    ? true
    : `delta ${d.delta}, unmet ${d.unmet.join(', ')}`;
});

check('submitted-but-unconfirmed withholds', () => {
  const d = R.rewardFor({ ...EARNED, settlementConfirmed: false });
  return d.delta === 0 && d.unmet.some((u) => /NOT CONFIRMED/.test(u))
    ? true
    : `delta ${d.delta}, unmet ${d.unmet.join(', ')}`;
});

// ── 4. NOT_CHECKED and FAILED are different answers ─────────────────────────

check('evaluated consensus that FAILED is WITHHELD_FAILED, not NOT_CHECKED', () => {
  const d = R.rewardFor({ ...EARNED, consensusPassed: false });
  return d.outcome === 'WITHHELD_FAILED' ? true : `outcome ${d.outcome}`;
});

check('an unconfirmed settlement is NOT_CHECKED, never FAILED', () => {
  // The mirror of the bug: a broadcast transaction may still confirm, and
  // charging it as a failure would be the same error pointed the other way.
  const d = R.rewardFor({ ...EARNED, settlementConfirmed: false });
  return d.outcome === 'WITHHELD_NOT_CHECKED' ? true : `outcome ${d.outcome}`;
});

check('FAILED dominates NOT_CHECKED when both are present', () => {
  const d = R.rewardFor({
    consensusEvaluated: true, consensusPassed: false,
    settlementSimulated: true, settlementConfirmed: false,
  });
  return d.outcome === 'WITHHELD_FAILED' && d.unmet.length === 2
    ? true
    : `outcome ${d.outcome}, ${d.unmet.length} unmet`;
});

// ── 5. The delta is never negative and never larger than the reward ─────────

check('no evidence combination pays anything but 0 or SUCCESS_REWARD', () => {
  const bools = [false, true];
  for (const a of bools) for (const b of bools) for (const c of bools) for (const e of bools) {
    const d = R.rewardFor({
      consensusEvaluated: a, consensusPassed: b,
      settlementSimulated: c, settlementConfirmed: e,
    });
    if (d.delta !== 0 && d.delta !== R.SUCCESS_REWARD) return `paid ${d.delta} for ${a}/${b}/${c}/${e}`;
    if (!R.isPermittedReward(d.delta)) return `isPermittedReward rejected its own output ${d.delta}`;
  }
  return true;
});

check('exactly one of the 16 evidence combinations earns', () => {
  const bools = [false, true];
  let earned = 0;
  for (const a of bools) for (const b of bools) for (const c of bools) for (const e of bools) {
    if (R.rewardFor({
      consensusEvaluated: a, consensusPassed: b,
      settlementSimulated: c, settlementConfirmed: e,
    }).outcome === 'EARNED') earned++;
  }
  return earned === 1 ? true : `${earned} combinations earn`;
});

check('isPermittedReward rejects an arbitrary delta', () =>
  !R.isPermittedReward(1000) && !R.isPermittedReward(-10) && !R.isPermittedReward(10.5)
    ? true
    : 'isPermittedReward admitted a delta the payment path may not pay');

// ── 6. The log line cannot outrun the evidence again ────────────────────────

check('the withheld reason never claims a successful payment', () => {
  const d = R.rewardFor({
    consensusEvaluated: false, consensusPassed: true,
    settlementSimulated: true, settlementConfirmed: false,
  });
  const line = R.rewardReason(d, 500);
  return /withheld/i.test(line) && !/successful/i.test(line)
    ? true
    : `withheld line reads: ${line}`;
});

check('the earned reason names both conditions it depends on', () => {
  const line = R.rewardReason(R.rewardFor(EARNED), 500);
  return /consensus/i.test(line) && /confirmed/i.test(line)
    ? true
    : `earned line reads: ${line}`;
});

// ── 7. The route must actually use it ───────────────────────────────────────
//
// The gate the auditor-grant lesson demands: a decision module with no importer
// changes nothing, and the route's old unconditional call is exactly what a
// revert would restore.

const routeSource = readFileSync('app/api/trustrails/pay/route.ts', 'utf8');

// Comment lines are stripped before the code assertions run. The route's own
// comment QUOTES the call being removed — that is the point of the comment, and
// a grep that cannot tell the quote from the call reports the bug it just fixed.
// (Caught by this suite on its first run.) Whole-line comments only: stripping
// `//` mid-line would truncate the explorer URLs, and nothing below needs them.
let inBlock = false;
const route = routeSource
  .split('\n')
  .filter((line) => {
    const t = line.trim();
    if (inBlock) { if (t.includes('*/')) inBlock = false; return false; }
    if (t.startsWith('/*')) { if (!t.includes('*/')) inBlock = true; return false; }
    return !t.startsWith('//') && !t.startsWith('*');
  })
  .join('\n');

check('the pay route imports the reward decision', () =>
  /from '@\/lib\/trustshell\/reward'/.test(routeSource) && /rewardFor\(\{/.test(route)
    ? true
    : 'app/api/trustrails/pay/route.ts does not import rewardFor');

check('no unconditional updateRepID literal remains on the payment path', () => {
  const bad = /updateRepID\(\s*agentName\s*,\s*10\s*,/.test(route);
  return bad ? 'the hardcoded +10 call is back in app/api/trustrails/pay/route.ts' : true;
});

check('updateRepID is reached only through the reward decision', () => {
  const calls = [...route.matchAll(/updateRepID\(([^)]*)\)/g)].map((m) => m[1]);
  if (calls.length === 0) return 'no updateRepID call found — did the route move?';
  const bad = calls.filter((args) => !/reward\.delta/.test(args));
  return bad.length === 0 ? true : `updateRepID called with ${bad.join(' | ')}`;
});

check('the withheld decision is disclosed in the response', () =>
  /reward:\s*\{/.test(route) && /outcome:\s*reward\.outcome/.test(route)
    ? true
    : 'the response does not carry the reward outcome — a silent zero and an earned zero look identical');

rmSync(outDir, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} of ${pass + failures.length} assertions`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`VERIFIED: ${pass} assertions — the RepID reward is paid only on evidence`);
