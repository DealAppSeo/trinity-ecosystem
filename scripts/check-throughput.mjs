#!/usr/bin/env node
//
// check-throughput.mjs — would the ledger have caught the four weeks?
//
//   npm run check:throughput
//
// ============================================================================
// THE STANDARD THIS SUITE HOLDS THE LEDGER TO
// ============================================================================
//
// A monitor is easy to write and almost as easy to write uselessly. The only
// question worth asking is whether it fires on the incident it was built for —
// so the primary fixtures below are the MEASURED numbers from 2026-07-15..08-15,
// not invented ones. If a change makes the ledger stop catching the outage that
// motivated it, these go red.
//
// The incident, as measured on 2026-08-15:
//
//   date     peer_verify tasks   hal_classifications   what any dashboard said
//   07-15            6,972              2,689          green
//   07-16            2,847              1,707          green
//   07-17            1,615              1,360          green
//   07-18                4                  2          green
//   ...29 days of green, one identical canary prompt per day...
//
// Assertion 1 below is the whole point: a silence-only rule fires on 07-18; the
// degradation rule fires on 07-16, two days earlier, while the fleet was alive
// and the cause was still just provider rate limits.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.throughput-check-'));

let mod;
try {
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/throughput/ledger.ts',
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
  mod = await import(pathToFileURL(join(outDir, 'trustshell', 'throughput', 'ledger.js')).href);
} catch (err) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('FAILED — throughput ledger does not compile:\n' + `${err.stdout ?? ''}${err.stderr ?? ''}`);
  process.exit(1);
}

const { assess, undeclared, validateDeclaration, isLoud, DECLARED_STATES, LOUD,
        assessDiversity, lostMembers, gainedMembers } = mod;

let pass = 0;
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) pass += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};
const verdict = (name, d, o, now, want) => {
  const a = assess(d, o, now);
  ok(name, a.verdict === want, `got ${a.verdict} (${a.detail}), want ${want}`);
  return a;
};

const NOW = '2026-08-15T00:00:00Z';
const RUNNING = { producer: 'peer_verify_mesh', state: 'running' };
/** A healthy observation, so no assertion below passes by accident of absence. */
const HEALTHY = {
  producer: 'peer_verify_mesh',
  rows: 6972, syntheticRows: 0, baseline: 6900, baselineDays: 30,
  lastRealWrite: '2026-07-15T23:59:00Z',
};

// ---------------------------------------------------------------------------
// 1. THE INCIDENT. Real numbers. This is the suite's reason to exist.
// ---------------------------------------------------------------------------

verdict('07-15 (6,972 vs 6,900 baseline) is OK', RUNNING, HEALTHY, NOW, 'OK');

verdict(
  '07-16 (2,847 = 41% of baseline) is caught as DEGRADATION — two days before silence',
  RUNNING,
  { ...HEALTHY, rows: 2847, lastRealWrite: '2026-07-16T23:59:00Z' },
  NOW,
  'UNEXPLAINED_DEGRADATION'
);

verdict(
  '07-17 (1,615 = 23% of baseline) is still caught',
  RUNNING,
  { ...HEALTHY, rows: 1615, lastRealWrite: '2026-07-17T22:18:00Z' },
  NOW,
  'UNEXPLAINED_DEGRADATION'
);

verdict(
  '07-18 (4 rows, then 29 days) is UNEXPLAINED_SILENCE once real output is zero',
  RUNNING,
  { ...HEALTHY, rows: 0, baseline: 6900, lastRealWrite: '2026-07-17T22:18:00Z' },
  NOW,
  'UNEXPLAINED_SILENCE'
);

// The canary. Zero real rows, one synthetic row per day for 29 days — the exact
// shape that kept every liveness check green.
verdict(
  'the daily canary alone is CANARY_ONLY, never OK',
  { producer: 'hal_classifications', state: 'running' },
  { producer: 'hal_classifications', rows: 0, syntheticRows: 29, baseline: 2650,
    baselineDays: 30, lastRealWrite: '2026-07-17T22:05:00Z' },
  NOW,
  'CANARY_ONLY'
);

ok(
  'CANARY_ONLY is loud — a probe must never satisfy a liveness check',
  isLoud('CANARY_ONLY')
);

// The heartbeat: status said 'online' while last_ping was 698 hours stale. The
// ledger must judge on rows, and never on a self-reported status string.
verdict(
  'a producer whose only claim is a stored status string still reads as silence',
  { producer: 'agent_heartbeat', state: 'running' },
  { producer: 'agent_heartbeat', rows: 0, syntheticRows: 0, baseline: 12,
    baselineDays: 30, lastRealWrite: '2026-07-17T22:18:57Z' },
  NOW,
  'UNEXPLAINED_SILENCE'
);

// ---------------------------------------------------------------------------
// 2. DECLARED OFF — the states that make silence legitimate
// ---------------------------------------------------------------------------

const SILENT = { producer: 'x', rows: 0, syntheticRows: 0, baseline: 100, baselineDays: 30, lastRealWrite: null };

verdict(
  'not_wired + silent is EXPECTED_SILENCE (quorum-receipt-writer.ts, imported by nothing)',
  { producer: 'x', state: 'not_wired', reason: 'hook never landed; hal_quorum_receipts empty since 2026-07-13' },
  SILENT, NOW, 'EXPECTED_SILENCE'
);

verdict(
  'decommissioned + silent is EXPECTED_SILENCE',
  { producer: 'x', state: 'decommissioned', reason: 'replaced' },
  SILENT, NOW, 'EXPECTED_SILENCE'
);

verdict(
  'paused_cost within its review window is EXPECTED_SILENCE',
  { producer: 'x', state: 'paused_cost', reason: 'saving LLM spend', reviewBy: '2026-09-01' },
  SILENT, NOW, 'EXPECTED_SILENCE'
);

verdict(
  'paused_cost PAST its review date is STALE_PAUSE — a pause with an expired expiry is drift',
  { producer: 'x', state: 'paused_cost', reason: 'saving LLM spend', reviewBy: '2026-08-01' },
  SILENT, NOW, 'STALE_PAUSE'
);

// The expensive inverse: you believe it is off, and it is spending.
verdict(
  'paused_cost but PRODUCING is UNDECLARED_ACTIVITY — you are paying for something you think is off',
  { producer: 'x', state: 'paused_cost', reason: 'saving spend', reviewBy: '2026-09-01' },
  { ...SILENT, rows: 500 }, NOW, 'UNDECLARED_ACTIVITY'
);

verdict(
  'not_wired but PRODUCING is UNDECLARED_ACTIVITY — the map is wrong',
  { producer: 'x', state: 'not_wired', reason: 'believed unreachable' },
  { ...SILENT, rows: 3 }, NOW, 'UNDECLARED_ACTIVITY'
);

ok(
  'activity is checked before silence on an off producer, so a spending "paused" service is never quiet',
  assess({ producer: 'x', state: 'paused_cost', reason: 'r' }, { ...SILENT, rows: 5 }, NOW).verdict ===
    'UNDECLARED_ACTIVITY'
);

// ---------------------------------------------------------------------------
// 3. REFUSING TO JUDGE — three outcomes, never two
// ---------------------------------------------------------------------------

verdict(
  'too little history is NOT_CHECKED, not OK — an unearned pass is the house defect',
  RUNNING,
  { ...HEALTHY, rows: 10, baseline: 12, baselineDays: 2 },
  NOW,
  'NOT_CHECKED'
);

verdict(
  'a zero baseline is NOT_CHECKED, not a 0% ratio',
  RUNNING,
  { ...HEALTHY, rows: 5, baseline: 0, baselineDays: 30 },
  NOW,
  'NOT_CHECKED'
);

ok('NOT_CHECKED is not loud — refusing to judge is not an alarm', !isLoud('NOT_CHECKED'));
ok('OK is not loud', !isLoud('OK'));
ok('EXPECTED_SILENCE is not loud', !isLoud('EXPECTED_SILENCE'));
ok('UNEXPLAINED_SILENCE is loud', isLoud('UNEXPLAINED_SILENCE'));
ok('UNEXPLAINED_DEGRADATION is loud', isLoud('UNEXPLAINED_DEGRADATION'));
ok('UNDECLARED_ACTIVITY is loud', isLoud('UNDECLARED_ACTIVITY'));
ok('STALE_PAUSE is loud', isLoud('STALE_PAUSE'));

// ---------------------------------------------------------------------------
// 4. THE DEGRADATION BOUNDARY
// ---------------------------------------------------------------------------

verdict('exactly at the floor is not degraded',
  RUNNING, { ...HEALTHY, rows: 50, baseline: 100 }, NOW, 'OK');
verdict('just below the floor is degraded',
  RUNNING, { ...HEALTHY, rows: 49, baseline: 100 }, NOW, 'UNEXPLAINED_DEGRADATION');
verdict('a stricter per-producer floor is honoured',
  { ...RUNNING, degradedBelow: 0.9 }, { ...HEALTHY, rows: 80, baseline: 100 }, NOW, 'UNEXPLAINED_DEGRADATION');
verdict('above baseline is OK, never flagged as anomalous',
  RUNNING, { ...HEALTHY, rows: 20000, baseline: 100 }, NOW, 'OK');

// ---------------------------------------------------------------------------
// 5. DISCOVERY — the registry must find what it is missing
// ---------------------------------------------------------------------------

ok('an undeclared producer is surfaced',
  JSON.stringify(undeclared(['a', 'b', 'c'], ['a'])) === JSON.stringify(['b', 'c']));
ok('undeclared output is sorted and stable',
  JSON.stringify(undeclared(['z', 'a'], [])) === JSON.stringify(['a', 'z']));
ok('nothing undeclared when all are registered',
  undeclared(['a'], ['a', 'b']).length === 0);

// ---------------------------------------------------------------------------
// 6. A REGISTRY THAT LIES IS WORSE THAN NO REGISTRY
// ---------------------------------------------------------------------------

ok('a valid running declaration passes',
  validateDeclaration({ producer: 'p', state: 'running' }).length === 0);
ok('running needs no reason — producing is its own justification',
  validateDeclaration({ producer: 'p', state: 'running' }).length === 0);
ok('paused_cost without a reason is rejected',
  validateDeclaration({ producer: 'p', state: 'paused_cost', reviewBy: '2026-09-01' }).length > 0);
ok('paused_cost without reviewBy is rejected',
  validateDeclaration({ producer: 'p', state: 'paused_cost', reason: 'r' }).length > 0);
ok('not_wired without a reason is rejected',
  validateDeclaration({ producer: 'p', state: 'not_wired' }).length > 0);
ok('reviewBy on a non-paused state is rejected',
  validateDeclaration({ producer: 'p', state: 'running', reviewBy: '2026-09-01' }).length > 0);
ok('an unparseable reviewBy is rejected',
  validateDeclaration({ producer: 'p', state: 'paused_cost', reason: 'r', reviewBy: 'soon' }).length > 0);
ok('an unknown state is rejected',
  validateDeclaration({ producer: 'p', state: 'probably_fine', reason: 'r' }).length > 0);
ok('an empty producer name is rejected',
  validateDeclaration({ producer: '  ', state: 'running' }).length > 0);
ok('degradedBelow above 1 is rejected',
  validateDeclaration({ producer: 'p', state: 'running', degradedBelow: 1.5 }).length > 0);
ok('degradedBelow of 0 is rejected',
  validateDeclaration({ producer: 'p', state: 'running', degradedBelow: 0 }).length > 0);
ok('there are exactly four declared states',
  DECLARED_STATES.length === 4, `got ${DECLARED_STATES.length}`);
ok('every loud verdict is a real verdict, not a typo',
  LOUD.every((v) => typeof v === 'string' && v === v.toUpperCase()));

// ---------------------------------------------------------------------------
// QUORUM DIVERSITY — the 2026-07-14 signature
// ---------------------------------------------------------------------------
//
// Measured: gemini 2,653 -> 0 overnight while TOTAL VOLUME DID NOT MOVE
// (2,683 -> 2,689). A row count is blind to that by construction. These
// assertions are the incident, and if they fail the ledger has lost the two
// days of warning that were sitting in `hal_classifications.model`.

const RUN = { producer: 'hal_quorum', state: 'running' };
const DIV = (seen, baselineSeen, baselineDays = 14) =>
  ({ producer: 'hal_quorum', seen, baselineSeen, baselineDays });

const FIVE = ['gemini', 'qwen', 'llama', 'glm', 'mistral'];

const dv = (name, decl, obs, want) => {
  const a = assessDiversity(decl, obs, NOW);
  ok(name, a.verdict === want, `got ${a.verdict} (${a.detail}), want ${want}`);
  return a;
};

dv('a full quorum is OK', RUN, DIV(FIVE, FIVE), 'OK');

// THE LOAD-BEARING ONE.
dv(
  'THE 07-14 SIGNATURE: gemini absent is MEMBER_LOST even though row volume is untouched',
  RUN,
  DIV(['qwen', 'llama', 'glm', 'mistral'], FIVE),
  'MEMBER_LOST'
);
dv(
  'the 07-15 state — gemini AND qwen gone — is still MEMBER_LOST',
  RUN,
  DIV(['llama', 'glm', 'mistral'], FIVE),
  'MEMBER_LOST'
);
ok(
  'the missing members are NAMED, not counted — "1 provider missing" sends nobody anywhere',
  (() => {
    const a = assessDiversity(RUN, DIV(['qwen', 'llama', 'glm', 'mistral'], FIVE), NOW);
    return a.missing.length === 1 && a.missing[0] === 'gemini' && a.detail.includes('gemini');
  })()
);
ok('MEMBER_LOST is LOUD', isLoud('MEMBER_LOST'));
ok(
  'the detail warns that row volume may look fine — the trap that cost two days',
  assessDiversity(RUN, DIV(['llama', 'glm', 'mistral'], FIVE), NOW)
    .detail.includes('Row volume may be unaffected')
);

// A gain is reported, never faulted.
ok(
  'a NEW member is reported and is not a fault',
  (() => {
    const a = assessDiversity(RUN, DIV([...FIVE, 'claude'], FIVE), NOW);
    return a.verdict === 'OK' && a.gained.includes('claude');
  })()
);

// Declared-off mirrors `assess`, or the ledger cries wolf about its own pause.
for (const st of ['paused_cost', 'not_wired', 'decommissioned']) {
  dv(
    `a ${st} producer is EXPECTED_SILENCE on diversity, not MEMBER_LOST`,
    { producer: 'hal_quorum', state: st, reason: 'r', reviewBy: '2099-01-01' },
    DIV([], FIVE),
    'EXPECTED_SILENCE'
  );
}

// Refusing to judge, in the two cases where judging would be a guess.
dv(
  'a short baseline is NOT_CHECKED — it cannot tell a lost member from one never seen',
  RUN, DIV(['llama'], FIVE, 3), 'NOT_CHECKED'
);
dv(
  'an empty baseline is NOT_CHECKED, never OK',
  RUN, DIV(['llama'], [], 30), 'NOT_CHECKED'
);
ok('NOT_CHECKED on diversity is not loud', !isLoud('NOT_CHECKED'));

// The set comparison itself.
ok('lostMembers finds the absentee', lostMembers(['a','b'], ['a','b','c']).join() === 'c');
ok('lostMembers is empty when nothing is lost', lostMembers(['a','b','c'], ['a','b']).length === 0);
ok('lostMembers follows baseline order, so a report reads the same twice',
  lostMembers([], ['x','y','z']).join() === 'x,y,z');
ok('gainedMembers finds the newcomer', gainedMembers(['a','b'], ['a']).join() === 'b');
ok('a total wipeout loses every member',
  lostMembers([], FIVE).length === 5);

// ---------------------------------------------------------------------------

rmSync(outDir, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`FAILED — throughput ledger: ${failures.length} of ${pass + failures.length} assertions\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(
    '\nThe assertions in section 1 are the measured 2026-07-15..08-15 outage.\n' +
      'If those fail, the ledger no longer catches the incident it was built for.'
  );
  process.exit(1);
}

console.log(
  `check:throughput — VERIFIED. ${pass} assertions; the ledger fires on the ` +
    'measured 07-16 degradation, two days before the silence.'
);
