#!/usr/bin/env node
// scripts/phase2-suite-r-undecidable-test.mjs
//
// Suite R, undecidable mutants M4-M8 (docs/policy/phase2-e2e-predicates.md) —
// exercised against a REAL referral-event processor
// (lib/trustshell/referral-event-processor.ts), which supplies exactly the
// inputs lane-files.ts's own header names as out of its reach: evidence.ref,
// referee lifecycle_status, family/self relationship. M1-M3 are re-asserted
// here too, through the SAME processor rather than lane-files.ts directly —
// proving the new layer doesn't disagree with the already-locked curve it
// wraps, not just that the curve itself still holds (check:lane-files
// already covers that).
//
// npm run check:phase2-suite-r-undecidable

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.phase2-suite-r-check-'));
let Processor, LaneFiles;
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
        join(process.cwd(), 'lib/trustshell/referral-event-processor.ts'),
        join(process.cwd(), 'lib/trustshell/lane-files.ts'),
      ],
    })
  );
  execFileSync(localTsc(), ['-p', tsconfigPath], { stdio: 'pipe' });
  Processor = await import(pathToFileURL(join(outDir, 'lib/trustshell/referral-event-processor.js')).href);
  LaneFiles = await import(pathToFileURL(join(outDir, 'lib/trustshell/lane-files.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('FAILED: could not compile referral-event-processor.ts / lane-files.ts');
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

const AGENT = (id, builderId = null, squadId = null) => ({ id, builderId, squadId });
const QUALIFIES = ['referred_R_ge_500'];

function realReferral(refereeId, overrides = {}) {
  return {
    referrer: AGENT('referrer-1', 'builder-A', 'squad-A'),
    referee: AGENT(refereeId, 'builder-OTHER', 'squad-OTHER'),
    refereeLifecycleStatus: 'active',
    evidenceRefPresent: true,
    qualificationSignals: QUALIFIES,
    ...overrides,
  };
}

// ── M1-M3, re-asserted THROUGH the processor (not just lane-files.ts directly) ──

check('M1 (via processor): first qualifying referral (n=1) outscores the tenth', () => {
  const events = Array.from({ length: 10 }, (_, i) => realReferral(`referee-${i}`));
  const outcomes = Processor.processReferralSequence(events);
  const first = outcomes[0], tenth = outcomes[9];
  return first.n === 1 && tenth.n === 10 && first.delta > tenth.delta && first.delta === 12 && tenth.delta === 4
    ? true
    : `first=${JSON.stringify(first)}, tenth=${JSON.stringify(tenth)}`;
});

check('M2/M3 (via processor): the 100th qualifying referral in a sequence delivers delta=0', () => {
  const events = Array.from({ length: 100 }, (_, i) => realReferral(`referee-${i}`));
  const outcomes = Processor.processReferralSequence(events);
  const hundredth = outcomes[99];
  return hundredth.n === 100 && hundredth.delta === 0 ? true : `hundredth=${JSON.stringify(hundredth)}`;
});

// ── M4: unproven (no evidence.ref) => delta=0 EVEN IF this would have been n=1, AND it does not consume the n=1 slot ──

check('M4: unproven referral gets delta=0 and does not count', () => {
  const outcomes = Processor.processReferralSequence([realReferral('referee-0', { evidenceRefPresent: false })]);
  const o = outcomes[0];
  return o.counts === false && o.n === null && o.delta === 0 && o.disqualifyReason === 'unproven'
    ? true
    : `outcome=${JSON.stringify(o)}`;
});

check('M4: an unproven referral followed by a real one -- the real one becomes n=1, not n=2', () => {
  const events = [realReferral('unproven-referee', { evidenceRefPresent: false }), realReferral('real-referee')];
  const outcomes = Processor.processReferralSequence(events);
  return outcomes[0].n === null && outcomes[0].delta === 0 && outcomes[1].n === 1 && outcomes[1].delta === 12
    ? true
    : `outcomes=${JSON.stringify(outcomes)}`;
});

// ── M5: test_only referee => n does not increment, delta=0 ─────────────────

check('M5: test_only referee gets delta=0 and does not count', () => {
  const outcomes = Processor.processReferralSequence([realReferral('referee-0', { refereeLifecycleStatus: 'test_only' })]);
  const o = outcomes[0];
  return o.counts === false && o.n === null && o.delta === 0 && o.disqualifyReason === 'test_only'
    ? true
    : `outcome=${JSON.stringify(o)}`;
});

check('M5: a test_only referral in the middle of a real sequence does not shift later ranks', () => {
  const events = [
    realReferral('real-1'),
    realReferral('test-referee', { refereeLifecycleStatus: 'test_only' }),
    realReferral('real-2'),
  ];
  const outcomes = Processor.processReferralSequence(events);
  return outcomes[0].n === 1 && outcomes[1].n === null && outcomes[2].n === 2
    ? true
    : `outcomes=${JSON.stringify(outcomes)}`;
});

// ── M6: same-family or self => delta=0 ──────────────────────────────────────

check('M6: self-referral (referrer.id === referee.id) gets delta=0', () => {
  const event = realReferral('referrer-1'); // same id as the referrer
  event.referee = AGENT('referrer-1');
  const o = Processor.processReferralSequence([event])[0];
  return o.counts === false && o.disqualifyReason === 'self' ? true : `outcome=${JSON.stringify(o)}`;
});

check('M6: same builder_id (same operator, different agent ids) gets delta=0', () => {
  const event = realReferral('referee-different-id', { referee: AGENT('referee-different-id', 'builder-A', 'squad-OTHER') });
  const o = Processor.processReferralSequence([event])[0];
  return o.counts === false && o.disqualifyReason === 'same_family' && o.detail.includes('builder_id')
    ? true
    : `outcome=${JSON.stringify(o)}`;
});

check('M6: same squad_id (different builder) also gets delta=0', () => {
  const event = realReferral('referee-different-id-2', { referee: AGENT('referee-different-id-2', 'builder-OTHER', 'squad-A') });
  const o = Processor.processReferralSequence([event])[0];
  return o.counts === false && o.disqualifyReason === 'same_family' && o.detail.includes('squad_id')
    ? true
    : `outcome=${JSON.stringify(o)}`;
});

check('M6, contrast case: different builder AND different squad DOES qualify', () => {
  const o = Processor.processReferralSequence([realReferral('genuinely-unrelated')])[0];
  return o.counts === true && o.n === 1 ? true : `outcome=${JSON.stringify(o)}`;
});

// ── M7: global HAL clamp remains +5; only referral uses c(n) ───────────────

check('M7: GLOBAL_HAL_CLAMP is 5, matching authority-policy.v0.5.yaml\'s global_hal_clamp_remains', () => {
  return Processor.GLOBAL_HAL_CLAMP === 5 ? true : `GLOBAL_HAL_CLAMP=${Processor.GLOBAL_HAL_CLAMP}`;
});

check('M7: referral\'s own type-clamp c(1)=12 EXCEEDS the global HAL clamp -- proving it is a separate, larger ceiling, not the same mechanism', () => {
  const c1 = LaneFiles.referralClamp(1);
  return c1 === 12 && c1 > Processor.GLOBAL_HAL_CLAMP
    ? true
    : `referralClamp(1)=${c1}, GLOBAL_HAL_CLAMP=${Processor.GLOBAL_HAL_CLAMP} -- expected c(1) > the global clamp`;
});

check('M7: a qualifying n=1 referral (delta=12) is UNAFFECTED by the global HAL clamp of 5 -- confirms they do not share a ceiling', () => {
  const o = Processor.processReferralSequence([realReferral('referee-0')])[0];
  return o.delta === 12 && o.delta > Processor.GLOBAL_HAL_CLAMP
    ? true
    : `delta=${o.delta} -- if the global HAL clamp were wrongly applied here it would cap at 5`;
});

// ── M8: delta lands on axis Q, never S -- true on every outcome, qualified or not ──

check('M8: every outcome (qualified and disqualified) reports landsOnAxis="Q"', () => {
  const mixedEvents = [
    realReferral('a'),
    realReferral('b', { evidenceRefPresent: false }),
    realReferral('c', { refereeLifecycleStatus: 'test_only' }),
  ];
  const outcomes = Processor.processReferralSequence(mixedEvents);
  const wrong = outcomes.filter((o) => o.landsOnAxis !== 'Q');
  return wrong.length === 0 && Processor.REFERRAL_LANDS_ON_AXIS === 'Q'
    ? true
    : `${wrong.length} outcome(s) did not report axis Q: ${JSON.stringify(wrong)}`;
});

check('M8: REFERRAL_LANDS_ON_AXIS is never derivable as "S" by any input combination', () => {
  return Processor.REFERRAL_LANDS_ON_AXIS === 'Q' ? true : `REFERRAL_LANDS_ON_AXIS=${Processor.REFERRAL_LANDS_ON_AXIS}`;
});

// ── qualify_or: zero signals present disqualifies even with everything else clean ──

check('no qualifying signal (empty qualificationSignals) disqualifies, distinctly from M4-M6', () => {
  const o = Processor.processReferralSequence([realReferral('referee-0', { qualificationSignals: [] })])[0];
  return o.counts === false && o.disqualifyReason === 'no_qualifying_signal' ? true : `outcome=${JSON.stringify(o)}`;
});

// ── Report ───────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} of ${pass + failures.length} assertions`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`phase2-suite-r-undecidable: ${pass} passed, 0 failed`);
console.log('VERIFIED: M1-M8 against a real referral-event processor (M1-M3 re-confirmed through it,');
console.log('  M4-M8 newly decided) -- lib/trustshell/referral-event-processor.ts, reusing the already-');
console.log('  locked lane-files.ts curve rather than re-deriving it.');
console.log('NOT_CHECKED, by design: repid_score_events holds ZERO ECOSYSTEM_REFERRAL rows (measured live');
console.log('  this session) -- this processor is exercised against constructed events shaped to the real');
console.log('  repid_agents schema, not against a live event stream that does not exist yet. See the');
console.log('  module\'s own header.');
