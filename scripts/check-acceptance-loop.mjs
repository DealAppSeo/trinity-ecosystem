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
  evaluateAcceptance, auditorIsStable, isDelivered, isTerminal, roundVerdictFor,
  DEFAULT_MAX_REJECTIONS, DEFAULT_MAX_ROUNDS,
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
  // ── mapping a round's evidence to a verdict ───────────────────────────────
  //
  // The readability signals are signatureValid + boundToContract, NOT
  // verificationOutcome. That field folds in criteriaOutcome, so a valid verdict
  // rejecting the work reports FAILED and was misread as unreadable — every
  // rejection became NOT_CHECKED, no round spent budget, and the loop hung.
  [
    'a readable verdict saying VERIFIED is an acceptance',
    () => roundVerdictFor({ hasVerdict: true, signatureValid: true, boundToContract: true, verdictOutcome: 'VERIFIED' }) === 'ACCEPTED',
  ],
  [
    'A READABLE VERDICT SAYING FAILED IS A REJECTION — the case whose misreading hung the loop',
    () => roundVerdictFor({ hasVerdict: true, signatureValid: true, boundToContract: true, verdictOutcome: 'FAILED' }) === 'REJECTED',
  ],
  [
    'no signed verdict is NOT_CHECKED — an absent verdict signs nothing off and condemns nothing',
    () => roundVerdictFor({ hasVerdict: false }) === 'NOT_CHECKED',
  ],
  [
    'a bad signature is NOT_CHECKED, never a rejection — the harness failing to read the ' +
      'auditor is not the auditor faulting the work',
    () => roundVerdictFor({ hasVerdict: true, signatureValid: false, boundToContract: true, verdictOutcome: 'FAILED' }) === 'NOT_CHECKED',
  ],
  [
    'a verdict bound to a different contract is NOT_CHECKED',
    () => roundVerdictFor({ hasVerdict: true, signatureValid: true, boundToContract: false, verdictOutcome: 'FAILED' }) === 'NOT_CHECKED',
  ],
  [
    'an unreadable verdict cannot ACCEPT either — forging acceptance is the worse direction',
    () => roundVerdictFor({ hasVerdict: true, signatureValid: false, boundToContract: true, verdictOutcome: 'VERIFIED' }) === 'NOT_CHECKED',
  ],
  [
    'an ABSENT readability flag is not a pass — both must be explicitly true',
    () => roundVerdictFor({ hasVerdict: true, verdictOutcome: 'VERIFIED' }) === 'NOT_CHECKED',
  ],
  [
    'an auditor that read the work and declined to decide has not rejected it',
    () => roundVerdictFor({ hasVerdict: true, signatureValid: true, boundToContract: true, verdictOutcome: 'NOT_CHECKED' }) === 'NOT_CHECKED',
  ],
  [
    'a missing verdict outcome is never an acceptance',
    () => roundVerdictFor({ hasVerdict: true, signatureValid: true, boundToContract: true }) === 'NOT_CHECKED',
  ],

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

  // ── TERMINATION: the property that "NOT_CHECKED costs nothing" breaks ─────
  //
  // These exist because the loop HUNG. "An outage never spends budget" and "run
  // until terminal" are each correct and jointly non-terminating: a judge that
  // never decides yields REVISE forever. Found by running it, not by reading it.
  [
    'an unavailable judge terminates as ABANDONED rather than looping forever',
    () => {
      reset();
      const rounds = Array.from({ length: 10 }, () => r('NOT_CHECKED'));
      return evaluateAcceptance(rounds, { maxRejections: 3, maxRounds: 10 }).status === 'ABANDONED';
    },
  ],
  [
    'ABANDONED is terminal — this is the assertion that would have caught the hang',
    () => {
      reset();
      const rounds = Array.from({ length: 10 }, () => r('NOT_CHECKED'));
      return isTerminal(evaluateAcceptance(rounds, { maxRejections: 3, maxRounds: 10 })) === true;
    },
  ],
  [
    'ABANDONED is not a delivery',
    () => {
      reset();
      const rounds = Array.from({ length: 10 }, () => r('NOT_CHECKED'));
      return isDelivered(evaluateAcceptance(rounds, { maxRejections: 3, maxRounds: 10 })) === false;
    },
  ],
  [
    'ABANDONED counts the unjudged rounds, so an outage is visible as an outage',
    () => {
      reset();
      const rounds = Array.from({ length: 4 }, () => r('NOT_CHECKED'));
      return evaluateAcceptance(rounds, { maxRejections: 3, maxRounds: 4 }).notChecked === 4;
    },
  ],
  [
    'EXHAUSTED outranks ABANDONED — a doer that really spent its revisions is not an outage',
    () => {
      reset();
      return evaluateAcceptance(
        [r('REJECTED'), r('REJECTED'), r('REJECTED')],
        { maxRejections: 3, maxRounds: 3 }
      ).status === 'EXHAUSTED';
    },
  ],
  [
    'below the round cap an outage still just asks for another round',
    () => {
      reset();
      return evaluateAcceptance(
        [r('NOT_CHECKED'), r('NOT_CHECKED')], { maxRejections: 3, maxRounds: 10 }
      ).status === 'REVISE';
    },
  ],
  [
    'the round cap defaults, so a policy that omits it still terminates',
    () => {
      reset();
      const rounds = Array.from({ length: DEFAULT_MAX_ROUNDS }, () => r('NOT_CHECKED'));
      return evaluateAcceptance(rounds, { maxRejections: 3 }).status === 'ABANDONED';
    },
  ],
  [
    'the round cap sits above the rejection bound, so it never pre-empts a real EXHAUSTED',
    () => DEFAULT_MAX_ROUNDS > DEFAULT_MAX_REJECTIONS,
  ],

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
