#!/usr/bin/env node
//
// check-alert-digest.mjs — the digest must not bury the thing worth reading.
//
//   npm run check:alert-digest
//
// ============================================================================
// THE STANDARD
// ============================================================================
//
// A consumer that drains 142,560 rows into a channel is worse than no consumer:
// it buries 114 HELP_REQUESTs under 40,236 repetitions of one fact and trains
// the recipient to ignore the channel — which is how the fleet came to shout for
// 29 days into a room nobody was in.
//
// So the assertions below are mostly about what the digest must NOT do:
// must not fail to collapse repeats, must not lose corroboration, must not page
// on a five-month-old condition, and must not report a subject it did not
// actually parse.
//
// Fixtures use the MEASURED shape of a real survivor_alert.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.alert-digest-check-'));
let mod;
try {
  execFileSync(
    localTsc(),
    ['lib/trustshell/alerts/digest.ts', '--outDir', outDir, '--rootDir', 'lib',
     '--module', 'commonjs', '--target', 'es2022', '--lib', 'es2022,dom',
     '--moduleResolution', 'node', '--strict'],
    { stdio: 'pipe' }
  );
  mod = await import(pathToFileURL(join(outDir, 'trustshell', 'alerts', 'digest.js')).href);
} catch (err) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('FAILED — digest does not compile:\n' + `${err.stdout ?? ''}${err.stderr ?? ''}`);
  process.exit(1);
}
rmSync(outDir, { recursive: true, force: true });

const { normalizeShape, subjectOf, digestRows, decide, willNotify, chronicDays, renderLine } = mod;

let pass = 0;
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) pass += 1; else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, a, b) => ok(name, Object.is(a, b), `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const NOW = '2026-08-16T12:00:00Z';

/** The measured shape, verbatim from trinity_agent_logs. */
const survivor = (mins, subject = 'trinity-orch') =>
  `🚨 SURVIVOR ALERT: ${subject} is DOWN\n⏱️ Time Down: ${mins} minutes\n` +
  `🧠 Last Known Task: Idle\n🔗 Railway Dashboard: https://railway.app/dashboard\n` +
  `🛠️ Action: Manual redeploy required. Autonomous redeploy disabled.`;

// ---------------------------------------------------------------------------
// 1. COLLAPSE — the whole point
// ---------------------------------------------------------------------------

const repeats = [42314, 42317, 42320, 42323].map((m, i) => ({
  id: i + 1, action: 'survivor_alert', agent: 'trinity-shofet',
  message: survivor(m), createdAt: `2026-08-16T0${i}:00:00Z`,
}));
const collapsed = digestRows(repeats);
eq('four repeats differing only in a counter collapse to ONE digest', collapsed.length, 1);
eq('and the digest keeps the count', collapsed[0].count, 4);
eq('and the earliest occurrence', collapsed[0].firstSeen, '2026-08-16T00:00:00Z');
eq('and the latest', collapsed[0].lastSeen, '2026-08-16T03:00:00Z');
ok('and one verbatim sample, so evidence is not replaced by a summary',
   collapsed[0].sample.includes('SURVIVOR ALERT'));

ok('a changing number does not create a new shape',
   normalizeShape('Time Down: 42314 minutes') === normalizeShape('Time Down: 99999 minutes'));
ok('a URL does not create a new shape',
   normalizeShape('see https://a.example/x') === normalizeShape('see https://b.example/y'));
ok('a uuid does not create a new shape',
   normalizeShape('id 0290d828-83a4-45f3-b54e-5127e6448e55') ===
   normalizeShape('id 69bc7627-3169-4ca7-a016-a65e141df721'));
ok('genuinely different text does NOT collapse',
   normalizeShape('trinity-orch is DOWN') !== normalizeShape('trinity-mel is DOWN'),
   'two different agents collapsed into one digest');

// ---------------------------------------------------------------------------
// 2. CORROBORATION — three agents agreeing is stronger, not redundant
// ---------------------------------------------------------------------------

const threeReporters = ['trinity-shofet', 'trinity-veritas', 'trinity-torch'].map((a, i) => ({
  id: 10 + i, action: 'survivor_alert', agent: a,
  message: survivor(42314 + i), createdAt: `2026-08-16T0${i}:30:00Z`,
}));
const corr = digestRows(threeReporters);
eq('three reporters of the same fact are ONE digest', corr.length, 1);
eq('and all three are retained', corr[0].reporters.length, 3);
ok('reporters are sorted, so the digest is stable across runs',
   JSON.stringify(corr[0].reporters) === JSON.stringify([...corr[0].reporters].sort()));

// ---------------------------------------------------------------------------
// 3. SUBJECT — parse only the measured shape, never guess
// ---------------------------------------------------------------------------

eq('the survivor subject is extracted', subjectOf('survivor_alert', survivor(1, 'trinity-mel')), 'trinity-mel');
eq('an unmeasured action yields NO subject rather than a guess',
   subjectOf('api_auth_attempt', 'anything at all'), null);
eq('an empty message yields no subject', subjectOf('api_auth_attempt', ''), null);
eq('a survivor message that does not match the shape yields null',
   subjectOf('survivor_alert', 'something else entirely'), null);
ok('the subject is the agent alerted ABOUT, not the reporter',
   corr[0].subject === 'trinity-orch' && corr[0].reporters.includes('trinity-shofet'));

// ---------------------------------------------------------------------------
// 4. THE BACKLOG MUST NOT PAGE — this is the assertion that matters most
// ---------------------------------------------------------------------------

const live = digestRows([{ id: 1, action: 'survivor_alert', agent: 'a',
  message: survivor(10), createdAt: '2026-08-16T11:00:00Z' }])[0];
const ancient = digestRows([{ id: 2, action: 'main_loop_error', agent: 'trinity-torch',
  message: "Cannot read properties of undefined (reading 'id')",
  createdAt: '2026-03-25T00:00:00Z' }])[0];

eq('a live, never-notified condition notifies', decide(live, null, NOW), 'DELIVER_FIRST');
eq('a FIVE-MONTH-OLD never-notified condition does NOT page',
   decide(ancient, null, NOW), 'SUPPRESS_STALE');
ok('stale is checked before first-notice, or the backlog floods the channel',
   !willNotify(decide(ancient, null, NOW)));
eq('a chronic condition re-notified an hour ago stays quiet',
   decide(live, '2026-08-16T11:00:00Z', NOW), 'SUPPRESS_RECENT');
eq('a chronic condition last notified two days ago notifies again',
   decide(live, '2026-08-14T11:00:00Z', NOW), 'DELIVER_HEARTBEAT');
ok('DELIVER_FIRST notifies', willNotify('DELIVER_FIRST'));
ok('DELIVER_HEARTBEAT notifies', willNotify('DELIVER_HEARTBEAT'));
ok('SUPPRESS_RECENT does not', !willNotify('SUPPRESS_RECENT'));
ok('SUPPRESS_STALE does not', !willNotify('SUPPRESS_STALE'));

// A suppressed digest is still DIGESTED and still visible. Suppression is about
// paging, not about hiding — the 29-day outage was hidden, not un-paged.
ok('a stale condition still produces a digest with its full count',
   ancient.count === 1 && ancient.action === 'main_loop_error');

// ---------------------------------------------------------------------------
// 5. CHRONICITY MUST BE STATED
// ---------------------------------------------------------------------------

const chronic = digestRows([
  { id: 1, action: 'survivor_alert', agent: 'a', message: survivor(1), createdAt: '2026-07-18T05:00:00Z' },
  { id: 2, action: 'survivor_alert', agent: 'a', message: survivor(2), createdAt: '2026-08-16T11:00:00Z' },
])[0];
eq('a 29-day-old condition reports its age', chronicDays(chronic, NOW), 29);
ok('the rendered line says how long it has been going',
   renderLine(chronic, NOW).includes('29d'), renderLine(chronic, NOW));
ok('the rendered line says how many times it fired',
   renderLine(chronic, NOW).includes('2×'));
ok('a same-day condition does not claim an age',
   !renderLine(live, NOW).includes('ongoing'));

// ---------------------------------------------------------------------------
// 6. MIXED TRAFFIC — the real shape of this table
// ---------------------------------------------------------------------------

const mixed = digestRows([
  ...Array.from({ length: 50 }, (_, i) => ({
    id: 100 + i, action: 'survivor_alert', agent: 'trinity-shofet',
    message: survivor(40000 + i), createdAt: '2026-08-16T10:00:00Z',
  })),
  { id: 900, action: 'HELP_REQUEST', agent: 'trinity-nexus',
    message: 'Symphony Consensus Failure. Disagreement: 0.00. Judas: ROOT.',
    createdAt: '2026-08-16T11:30:00Z' },
]);
eq('50 repeats plus 1 distinct event digest to 2 lines', mixed.length, 2);
ok('the HELP_REQUEST is not buried — it is the most recent, so it sorts first',
   mixed[0].action === 'HELP_REQUEST',
   `first was ${mixed[0].action}`);

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`FAILED — alert-digest: ${failures.length} of ${pass + failures.length} assertions\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`check:alert-digest — VERIFIED. ${pass} assertions; repeats collapse, the backlog does not page.`);
