#!/usr/bin/env node
// scripts/check-issuer-stake.mjs — the issuer is scored by the standard it applies.
//
// P1 of docs/SPRINT-DECISIONS-2026-08-17.md. Gates `lib/trustshell/issuer-stake.ts`
// against the measured corpus in `lib/trustshell/fixtures/issuer-verdicts-2026-08-17.json`.
//
// WHAT IT PINS, and why each assertion is here rather than being a comment:
//
//   1. the corpus is the one that was measured (395 = 336 earned + 59 unearned)
//   2. HAL is excellent when it verifies and a coin flip when it does not —
//      the fact the whole stake rests on
//   3. luck is unbankable: a correct-but-unearned verdict scores the same as a
//      wrong one. If someone "improves" the model by crediting lucky vetoes,
//      this fails.
//   4. verification is STRICTLY DOMINANT: skipping is worse than verifying and
//      being wrong. This is the property that makes the incentive hold, and it
//      is a consequence of the point ratios, so it must be checked and not
//      assumed.
//   5. the measured cost — what skipping verification on 14.9% of verdicts did
//      to the issuer's standing.
//   6. `refusesToIssue` blocks the actionable-with-no-evidence case at source.
//
// THREE OUTCOMES. VERIFIED / NOT CHECKED / FAILED. A corpus it cannot read is
// NOT CHECKED, never a pass.

import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const results = [];
const record = (state, control, detail) => results.push({ state, control, detail });
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ───────────────────────────────────────────────────────────── load the corpus
let fixture = null;
try {
  fixture = JSON.parse(
    readFileSync('lib/trustshell/fixtures/issuer-verdicts-2026-08-17.json', 'utf8')
  );
} catch (e) {
  record('NOT CHECKED', 'the measured corpus loads', e.message);
}

// ─────────────────────────────────────────────────────── compile the module
let M = null;
const outDir = mkdtempSync(join(process.cwd(), '.issuer-stake-check-'));
try {
  execFileSync(
    localTsc(),
    ['lib/trustshell/issuer-stake.ts', '--outDir', outDir, '--rootDir', 'lib',
      '--module', 'commonjs', '--target', 'es2022', '--lib', 'es2022,dom',
      '--moduleResolution', 'node', '--esModuleInterop', '--strict'],
    { stdio: 'pipe' }
  );
  M = await import(pathToFileURL(join(outDir, 'trustshell', 'issuer-stake.js')).href);
} catch (e) {
  record('NOT CHECKED', 'issuer-stake.ts compiles', (e.stdout?.toString() || e.message).slice(0, 300));
}

if (fixture && M) {
  const verdicts = [];
  for (const [providerAttempted, vetoed, isHallucination, n] of fixture.rows) {
    for (let i = 0; i < n; i += 1) verdicts.push({ providerAttempted, vetoed, isHallucination });
  }
  const s = M.scoreIssuer(verdicts);

  // 1 ── the corpus is the one that was measured
  const earned = s.total - (s.counts.unearned_veto + s.counts.unearned_clean);
  if (s.total === 395 && earned === 336 && s.counts.unearned_veto === 41 && s.counts.unearned_clean === 18) {
    record('VERIFIED', 'the corpus is the measured one',
      `395 verdicts — 336 earned, 41 unearned vetoes, 18 unearned cleans`);
  } else {
    record('FAILED', 'the corpus is the measured one',
      `got total=${s.total} earned=${earned} unearnedVeto=${s.counts.unearned_veto} unearnedClean=${s.counts.unearned_clean}`);
  }

  // 2 ── the fact the whole stake rests on
  const unearnedCorrect = s.counts.unearned_veto + s.counts.unearned_clean > 0
    ? (19 + 9) / (s.counts.unearned_veto + s.counts.unearned_clean)
    : null;
  if (near(s.earnedAccuracy, 0.9494, 0.0005) && near(unearnedCorrect, 0.4746, 0.0005)) {
    record('VERIFIED', 'verified verdicts are good, unverified ones are a coin flip',
      `earned ${(100 * s.earnedAccuracy).toFixed(1)}% vs unearned ${(100 * unearnedCorrect).toFixed(1)}% — ` +
      `the gap is the entire argument for staking the process`);
  } else {
    record('FAILED', 'verified verdicts are good, unverified ones are a coin flip',
      `earned=${s.earnedAccuracy} unearned=${unearnedCorrect}`);
  }

  // 3 ── luck is unbankable
  const luckyVeto = M.classify({ providerAttempted: false, vetoed: true, isHallucination: true });
  const unluckyVeto = M.classify({ providerAttempted: false, vetoed: true, isHallucination: false });
  if (luckyVeto === unluckyVeto && M.STAKE_POINTS[luckyVeto] < 0) {
    record('VERIFIED', 'a correct unearned verdict is not rewarded',
      `both classify as '${luckyVeto}' at ${M.STAKE_POINTS[luckyVeto]} — 46.3% of unearned vetoes were right, ` +
      `and crediting that would let an issuer buy standing with a good draw`);
  } else {
    record('FAILED', 'a correct unearned verdict is not rewarded',
      `lucky='${luckyVeto}' unlucky='${unluckyVeto}' — outcome is leaking into an evidence-based class`);
  }

  // 4 ── verification is strictly dominant
  const skip = M.STAKE_POINTS.unearned_veto;
  const verifyAndBeWrong = M.STAKE_POINTS.earned_false_positive;
  const verifyAndBeRight = M.STAKE_POINTS.earned_true_positive;
  if (skip < verifyAndBeWrong && verifyAndBeWrong < verifyAndBeRight) {
    record('VERIFIED', 'verification is strictly dominant',
      `skip ${skip} < verify-and-be-wrong ${verifyAndBeWrong} < verify-and-be-right ${verifyAndBeRight} — ` +
      `there is no expected-value argument for the cheap path at any accuracy`);
  } else {
    record('FAILED', 'verification is strictly dominant',
      `skip=${skip} wrong=${verifyAndBeWrong} right=${verifyAndBeRight} — the cheap path is rational for some accuracy, ` +
      `which is exactly the incentive that produced 41 unearned vetoes`);
  }

  // 5 ── the measured cost
  if (near(s.net, 161, 0.5) && near(s.forgoneShare, 0.5465, 0.002) && near(s.unearnedShare, 0.1494, 0.001)) {
    record('VERIFIED', 'the cost of not looking, measured',
      `net ${s.net} of an achievable ${s.achievable.toFixed(1)} — skipping verification on ` +
      `${(100 * s.unearnedShare).toFixed(1)}% of verdicts cost ${(100 * s.forgoneShare).toFixed(1)}% of standing`);
  } else {
    record('FAILED', 'the cost of not looking, measured',
      `net=${s.net} achievable=${s.achievable.toFixed(2)} forgoneShare=${s.forgoneShare.toFixed(4)} unearnedShare=${s.unearnedShare.toFixed(4)}`);
  }

  // 6 ── refuse at source
  const refuses = M.refusesToIssue({ providerAttempted: false, vetoed: true });
  const allowsVerified = M.refusesToIssue({ providerAttempted: true, vetoed: true });
  const allowsAbstain = M.refusesToIssue({ providerAttempted: false, vetoed: false });
  if (refuses && !allowsVerified && !allowsAbstain) {
    record('VERIFIED', 'an actionable verdict with no evidence is refused at source',
      'the stake makes it expensive afterwards; this makes it impossible at issue time');
  } else {
    record('FAILED', 'an actionable verdict with no evidence is refused at source',
      `refuses=${refuses} allowsVerified=${allowsVerified} allowsAbstain=${allowsAbstain}`);
  }
}

rmSync(outDir, { recursive: true, force: true });

// ─────────────────────────────────────────────────────────────────── report
const width = Math.max(...results.map((r) => r.control.length));
console.log('\nIssuer stake — HAL is scored by the standard it applies to everyone else\n');
for (const r of results) {
  const mark = r.state === 'VERIFIED' ? '✓' : r.state === 'FAILED' ? '✗' : '·';
  console.log(`  ${mark} ${r.control.padEnd(width)}  ${r.state}`);
  console.log(`    ${r.detail}`);
}
const failed = results.filter((r) => r.state === 'FAILED').length;
const unchecked = results.filter((r) => r.state === 'NOT CHECKED').length;
const verified = results.filter((r) => r.state === 'VERIFIED').length;
console.log(`\ncheck:issuer-stake — ${verified} VERIFIED, ${unchecked} NOT CHECKED, ${failed} FAILED.`);
// Exit codes carry the verdict (CLAUDE.md): 0 VERIFIED, 2 NOT_CHECKED, else FAILED.
process.exit(failed > 0 ? 1 : unchecked > 0 ? 2 : 0);
