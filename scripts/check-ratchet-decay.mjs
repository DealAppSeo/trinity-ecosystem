#!/usr/bin/env node
// scripts/check-ratchet-decay.mjs — a floor is held, not owned.
//
// P3 of docs/SPRINT-DECISIONS-2026-08-17.md. Gates lib/trustshell/ratchet-decay.ts
// against the live floor census in lib/trustshell/fixtures/floor-census-2026-08-17.json.
//
// WHAT IT PINS
//   1. the census is the measured one, INCLUDING that "21" was loose and 12 is the ratchet
//   2. never-earned is not decay — zero observations means no floor, immediately
//   3. humans are exempt, and it is 4 of 12 so this is not hypothetical
//   4. an attested agent keeps its floor (trinity-gcm, the one real agent affected)
//   5. decay halves on the same 30d clock as the evidence it bounds
//   6. order is load-bearing: a never-observed agent must not decay gracefully
//
// THREE OUTCOMES. VERIFIED / NOT CHECKED / FAILED.

import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const results = [];
const record = (state, control, detail) => results.push({ state, control, detail });

let fixture = null;
try {
  fixture = JSON.parse(readFileSync('lib/trustshell/fixtures/floor-census-2026-08-17.json', 'utf8'));
} catch (e) { record('NOT CHECKED', 'the floor census loads', e.message); }

let M = null;
const outDir = mkdtempSync(join(process.cwd(), '.ratchet-decay-check-'));
try {
  execFileSync(localTsc(),
    ['lib/trustshell/ratchet-decay.ts', '--outDir', outDir, '--rootDir', 'lib',
     '--module', 'commonjs', '--target', 'es2022', '--lib', 'es2022,dom',
     '--moduleResolution', 'node', '--esModuleInterop', '--strict'], { stdio: 'pipe' });
  M = await import(pathToFileURL(join(outDir, 'trustshell', 'ratchet-decay.js')).href);
} catch (e) {
  record('NOT CHECKED', 'ratchet-decay.ts compiles', (e.stdout?.toString() || e.message).slice(0, 300));
}

if (fixture && M) {
  const c = fixture._census;
  if (c.pinned_by_ratchet === 12 && c.on_a_round_number === 21 && c.floor_with_zero_observations_ever === 6 && c.real_agents === 1) {
    record('VERIFIED', 'the census is the measured one',
      `12 pinned by the ratchet (not the 21 on a round number) — 4 human, 7 test, 1 real; ` +
      `6 hold a floor with ZERO observations ever`);
  } else {
    record('FAILED', 'the census is the measured one', JSON.stringify(c));
  }

  const neverObserved = M.effectiveFloor({ grantedFloor: 500, observationsEver: 0, daysSinceLastObservation: null, isHuman: false });
  if (neverObserved.verdict === 'never_earned' && neverObserved.effectiveFloor === 0) {
    record('VERIFIED', 'never-earned is not decay',
      'zero observations gives floor 0 immediately — 6 agents today hold standing no evidence supports, ' +
      'and no decay schedule reaches them because there is nothing to decay from');
  } else {
    record('FAILED', 'never-earned is not decay', JSON.stringify(neverObserved));
  }

  const human = M.effectiveFloor({ grantedFloor: 1000, observationsEver: 1, daysSinceLastObservation: 400, isHuman: true });
  if (human.verdict === 'exempt_human' && human.effectiveFloor === 1000) {
    record('VERIFIED', 'humans are exempt', '4 of the 12 pinned agents are human; compute_tier already exempts them from the counterparty gate');
  } else {
    record('FAILED', 'humans are exempt', JSON.stringify(human));
  }

  const gcm = M.effectiveFloor({ grantedFloor: 1000, observationsEver: 12, daysSinceLastObservation: 16, isHuman: false });
  if (gcm.verdict === 'attested' && gcm.effectiveFloor === 1000) {
    record('VERIFIED', 'an attested agent keeps its floor',
      'trinity-gcm — the ONE real agent pinned today — is 16d since its last observation and keeps 1000, ' +
      'which is also the medical/finance gate in can_act_in_vertical');
  } else {
    record('FAILED', 'an attested agent keeps its floor', JSON.stringify(gcm));
  }

  const oneHalfLife = M.effectiveFloor({ grantedFloor: 1000, observationsEver: 5, daysSinceLastObservation: 60, isHuman: false });
  if (oneHalfLife.verdict === 'decaying' && oneHalfLife.effectiveFloor === 500) {
    record('VERIFIED', 'decay halves on the evidence clock',
      '30d past the window is exactly one 30d half-life: floor 1000 -> 500, the same schedule ' +
      'RECENCY_HALF_LIFE_DAYS applies to the evidence the floor bounds');
  } else {
    record('FAILED', 'decay halves on the evidence clock', JSON.stringify(oneHalfLife));
  }

  // Zero observations WITH a surviving date — the state an agent reaches when its
  // observations age out. It must be never_earned, not a graceful decay.
  const agedOut = M.effectiveFloor({ grantedFloor: 1000, observationsEver: 0, daysSinceLastObservation: 45, isHuman: false });
  const neverNull = M.effectiveFloor({ grantedFloor: 1000, observationsEver: 0, daysSinceLastObservation: null, isHuman: false });
  if (agedOut.verdict === 'never_earned' && agedOut.effectiveFloor === 0 && neverNull.verdict === 'never_earned') {
    record('VERIFIED', 'order is load-bearing',
      'zero observations is judged before recency BOTH when the date is null and when one survives — ' +
      'an agent whose evidence aged out cannot decay gracefully from a floor it never earned');
  } else {
    record('FAILED', 'order is load-bearing', `agedOut=${JSON.stringify(agedOut)} neverNull=${JSON.stringify(neverNull)}`);
  }

  const changed = fixture.agents.filter(([, grantedFloor, observationsEver, daysSinceLastObservation, isHuman]) =>
    M.wouldChange({ grantedFloor, observationsEver, daysSinceLastObservation, isHuman }));
  console.log(`\n  BLAST RADIUS on the census sample: ${changed.length} of ${fixture.agents.length} rows would change —`);
  for (const [label, grantedFloor, observationsEver, daysSinceLastObservation, isHuman] of fixture.agents) {
    const d = M.effectiveFloor({ grantedFloor, observationsEver, daysSinceLastObservation, isHuman });
    console.log(`    ${d.effectiveFloor === grantedFloor ? ' ' : '→'} ${label.padEnd(40)} ${grantedFloor} → ${d.effectiveFloor}  (${d.verdict})`);
  }
}

rmSync(outDir, { recursive: true, force: true });
const width = Math.max(...results.map((r) => r.control.length));
console.log('\nRatchet decay — a floor is held, not owned\n');
for (const r of results) {
  const mark = r.state === 'VERIFIED' ? '✓' : r.state === 'FAILED' ? '✗' : '·';
  console.log(`  ${mark} ${r.control.padEnd(width)}  ${r.state}`);
  console.log(`    ${r.detail}`);
}
const failed = results.filter((r) => r.state === 'FAILED').length;
const unchecked = results.filter((r) => r.state === 'NOT CHECKED').length;
const verified = results.filter((r) => r.state === 'VERIFIED').length;
console.log(`\ncheck:ratchet-decay — ${verified} VERIFIED, ${unchecked} NOT CHECKED, ${failed} FAILED.`);
process.exit(failed > 0 ? 1 : unchecked > 0 ? 2 : 0);
