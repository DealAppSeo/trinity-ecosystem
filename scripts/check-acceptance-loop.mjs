#!/usr/bin/env node
// scripts/check-acceptance-loop.mjs — revise-until-accepted, and its edges.
//
// Run: npm run check:acceptance-loop
//
// The properties asserted here are the ones that make the loop a review rather
// than a formality: a sticky auditor (or the draw's anti-shopping guarantee is
// void), exhaustion that is not a pass, and an outage that cannot spend the
// doer's budget.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const ROOT = process.cwd();
const outDir = mkdtempSync(join(ROOT, '.acceptance-loop-check-'));
process.on('exit', () => rmSync(outDir, { recursive: true, force: true }));

let mod;
try {
  execFileSync(
    localTsc(),
    ['lib/trustshell/identity/acceptance-loop.ts', '--outDir', outDir, '--rootDir', 'lib',
     '--module', 'commonjs', '--target', 'es2022', '--lib', 'es2022,dom',
     '--moduleResolution', 'node', '--strict'],
    { stdio: 'pipe' }
  );
  mod = await import(pathToFileURL(join(outDir, 'trustshell', 'identity', 'acceptance-loop.js')).href);
} catch (err) {
  console.error(
    'check:acceptance-loop — FAILED. module does not compile:\n' +
      `${err.stdout ?? ''}${err.stderr ?? ''}`
  );
  process.exit(1);
}

const {
  evaluateAcceptance, auditorIsStable, isDelivered, isTerminal, DEFAULT_MAX_REJECTIONS,
} = mod;

const AUD = 'did:key:auditor-1';
const OTHER = 'did:key:auditor-2';

let n = 0;
/** Rounds default to one auditor and a fresh digest, so each case states only what it varies. */
const r = (verdict, opts = {}) => ({
  index: opts.index ?? n++,
  auditorDid: opts.auditorDid ?? AUD,
  submissionDigest: opts.digest ?? `sha256:${Math.abs(n * 7919)}`,
  verdict,
  detail: opts.detail,
});
const reset = () => { n = 0; };

const P = (maxRejections) => ({ maxRejections });

const assertions = [
  // ── the sticky auditor: the draw's guarantee, extended across rounds ───────
  ['one auditor across rounds is stable', () => {
    reset();
    return auditorIsStable([r('REJECTED'), r('REJECTED'), r('ACCEPTED')]).stable === true;
  }],
  ['a substituted auditor is caught', () => {
    reset();
    return auditorIsStable([r('REJECTED'), r('ACCEPTED', { auditorDid: OTHER })]).stable === false;
  }],
  ['the substitution is located, not just flagged', () => {
    reset();
    const v = auditorIsStable([r('REJECTED'), r('REJECTED'), r('ACCEPTED', { auditorDid: OTHER })]);
    return v.stable === false && v.at === 2;
  }],
  ['no rounds is vacuously stable, not an error', () => auditorIsStable([]).stable === true],

  // ── nothing run yet is its own state ──────────────────────────────────────
  ['no rounds is NOT_STARTED, never ACCEPTED', () => evaluateAcceptance([]).status === 'NOT_STARTED'],
  ['NOT_STARTED is not delivered', () => isDelivered(evaluateAcceptance([])) === false],
  ['NOT_STARTED is not terminal — the loop has not begun', () => isTerminal(evaluateAcceptance([])) === false],

  // ── acceptance ────────────────────────────────────────────────────────────
  ['a single acceptance delivers', () => {
    reset();
    return evaluateAcceptance([r('ACCEPTED')]).status === 'ACCEPTED';
  }],
  ['acceptance after rejections delivers', () => {
    reset();
    return evaluateAcceptance([r('REJECTED'), r('REJECTED'), r('ACCEPTED')]).status === 'ACCEPTED';
  }],
  ['the accepting round is named', () => {
    reset();
    return evaluateAcceptance([r('REJECTED'), r('ACCEPTED')]).round === 1;
  }],
  ['the accepting auditor is named, so a signed-off result is attributable', () => {
    reset();
    return evaluateAcceptance([r('ACCEPTED')]).auditorDid === AUD;
  }],
  [
    'a later rejection cannot un-accept — a re-review must not revoke a delivered result',
    () => {
      reset();
      return evaluateAcceptance([r('ACCEPTED'), r('REJECTED'), r('REJECTED'), r('REJECTED')])
        .status === 'ACCEPTED';
    },
  ],
  ['ACCEPTED is delivered and terminal', () => {
    reset();
    const s = evaluateAcceptance([r('ACCEPTED')]);
    return isDelivered(s) === true && isTerminal(s) === true;
  }],

  // ── exhaustion is not a pass ──────────────────────────────────────────────
  ['rejections up to the bound still ask for a revision', () => {
    reset();
    return evaluateAcceptance([r('REJECTED')], P(3)).status === 'REVISE';
  }],
  ['the remaining budget is reported', () => {
    reset();
    return evaluateAcceptance([r('REJECTED')], P(3)).remaining === 2;
  }],
  ['spending the budget is EXHAUSTED', () => {
    reset();
    return evaluateAcceptance([r('REJECTED'), r('REJECTED'), r('REJECTED')], P(3)).status === 'EXHAUSTED';
  }],
  [
    'EXHAUSTED is NOT delivered — a spent budget is not a standard met',
    () => {
      reset();
      return isDelivered(evaluateAcceptance([r('REJECTED'), r('REJECTED'), r('REJECTED')], P(3))) === false;
    },
  ],
  ['EXHAUSTED is terminal — it stops the loop rather than looping forever', () => {
    reset();
    return isTerminal(evaluateAcceptance([r('REJECTED'), r('REJECTED'), r('REJECTED')], P(3))) === true;
  }],
  [
    "EXHAUSTED carries the last auditor's reason, so the escalation is actionable",
    () => {
      reset();
      const s = evaluateAcceptance(
        [r('REJECTED'), r('REJECTED'), r('REJECTED', { detail: 'no error handling on the write path' })],
        P(3)
      );
      return s.lastDetail === 'no error handling on the write path';
    },
  ],
  ['the default bound is 3 rejections', () => DEFAULT_MAX_REJECTIONS === 3],

  // ── an outage must not cost the doer a round ──────────────────────────────
  [
    'NOT_CHECKED does not consume budget — a flaky judge cannot exhaust good work',
    () => {
      reset();
      return evaluateAcceptance(
        [r('NOT_CHECKED'), r('NOT_CHECKED'), r('NOT_CHECKED'), r('NOT_CHECKED')], P(3)
      ).status === 'REVISE';
    },
  ],
  [
    'NOT_CHECKED rounds leave the full budget intact',
    () => {
      reset();
      return evaluateAcceptance([r('NOT_CHECKED'), r('REJECTED')], P(3)).remaining === 2;
    },
  ],
  ['NOT_CHECKED alone is never ACCEPTED — an unrun judge signs nothing off', () => {
    reset();
    return evaluateAcceptance([r('NOT_CHECKED')]).status === 'REVISE';
  }],

  // ── resubmitting the same bytes ───────────────────────────────────────────
  [
    'identical bytes rejected twice is STALLED, not another revision',
    () => {
      reset();
      return evaluateAcceptance(
        [r('REJECTED', { digest: 'sha256:same' }), r('REJECTED', { digest: 'sha256:same' })], P(5)
      ).status === 'STALLED';
    },
  ],
  [
    'genuinely revised work is not STALLED',
    () => {
      reset();
      return evaluateAcceptance(
        [r('REJECTED', { digest: 'sha256:a' }), r('REJECTED', { digest: 'sha256:b' })], P(5)
      ).status === 'REVISE';
    },
  ],
  [
    'a retry under an outage is not a stall — the NOT_CHECKED round is skipped when comparing',
    () => {
      reset();
      return evaluateAcceptance(
        [
          r('REJECTED', { digest: 'sha256:a' }),
          r('NOT_CHECKED', { digest: 'sha256:b' }),
          r('REJECTED', { digest: 'sha256:b' }),
        ],
        P(5)
      ).status === 'REVISE';
    },
  ],
  ['STALLED is terminal but not delivered', () => {
    reset();
    const s = evaluateAcceptance(
      [r('REJECTED', { digest: 'sha256:same' }), r('REJECTED', { digest: 'sha256:same' })], P(5)
    );
    return isTerminal(s) === true && isDelivered(s) === false;
  }],
  [
    'STALLED outranks EXHAUSTED — "did not change it" and "could not fix it" need different responses',
    () => {
      reset();
      return evaluateAcceptance(
        [
          r('REJECTED', { digest: 'sha256:x' }),
          r('REJECTED', { digest: 'sha256:same' }),
          r('REJECTED', { digest: 'sha256:same' }),
        ],
        P(3)
      ).status === 'STALLED';
    },
  ],
  [
    'acceptance outranks a stall — identical bytes the auditor finally signs off is delivered',
    () => {
      reset();
      return evaluateAcceptance(
        [
          r('REJECTED', { digest: 'sha256:same' }),
          r('REJECTED', { digest: 'sha256:same' }),
          r('ACCEPTED', { digest: 'sha256:same' }),
        ],
        P(5)
      ).status === 'ACCEPTED';
    },
  ],
];

const failures = assertions.filter(([, fn]) => {
  try {
    return fn() !== true;
  } catch {
    return true;
  }
});

if (failures.length > 0) {
  console.error(
    `\ncheck:acceptance-loop — FAILED. ${failures.length} of ${assertions.length} assertions:\n`
  );
  for (const [name] of failures) console.error(`  ${name}`);
  process.exit(1);
}

console.log(`check:acceptance-loop — VERIFIED. ${assertions.length} assertions.`);
