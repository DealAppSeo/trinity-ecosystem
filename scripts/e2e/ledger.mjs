#!/usr/bin/env node
//
// ledger.mjs — three outcomes, never two.
//
// This exists because of repid-engine #414, recorded in SESSION_SUMMARY.md: a
// live-flow E2E there got *greener the more broken the deployment was*. Returning
// early from an `it()` marks it passed, so every soft-skip rendered green. With
// every route 401 it reported 6/6 passed, exit 0.
//
// The lesson is not "write better skips". It is that two outcomes collapse "we
// did not look" into "it passed". So a step here resolves to exactly one of:
//
//   VERIFIED    — we executed it and it held
//   NOT CHECKED — we could not execute it, and here is why
//   FAILED      — we executed it and it did not hold
//
// and the ledger applies three guards that a pass-count cannot:
//
//   1. Any FAILED fails the run.
//   2. Zero VERIFIED core steps fails the run, even with no failures. A run that
//      checked nothing is not a green run.
//   3. `--strict` promotes NOT CHECKED to fatal. Use it where the environment is
//      supposed to be complete (CI); leave it off where a dependency is
//      legitimately unreachable (a sandbox that cannot see Solana devnet).
//
// A step may resolve only once. Re-resolving is itself a FAILED entry: it is how
// a skipped step later gets counted as a pass.

export const VERIFIED = 'VERIFIED';
export const NOT_CHECKED = 'NOT CHECKED';
export const FAILED = 'FAILED';

export class VerificationLedger {
  /**
   * @param {object} opts
   * @param {boolean} opts.strict       NOT CHECKED becomes fatal
   * @param {string[]} opts.coreSteps   steps that constitute "the flow ran at all"
   */
  constructor({ strict = false, coreSteps = [] } = {}) {
    this.strict = strict;
    this.coreSteps = new Set(coreSteps);
    /** @type {Map<string, {outcome: string, note: string}>} */
    this.entries = new Map();
    this.doubleResolved = [];
  }

  #resolve(step, outcome, note) {
    if (this.entries.has(step)) {
      // Do not overwrite. The first resolution is the honest one; a second is
      // either a copy-paste bug or a skip being upgraded to a pass.
      this.doubleResolved.push(step);
      return;
    }
    this.entries.set(step, { outcome, note: note ?? '' });
  }

  verified(step, note) { this.#resolve(step, VERIFIED, note); }
  notChecked(step, reason) { this.#resolve(step, NOT_CHECKED, reason); }
  failed(step, reason) { this.#resolve(step, FAILED, reason); }

  /**
   * Run an assertion body, recording VERIFIED or FAILED. Never swallows into a
   * skip — a throw is a failure, not an "unable to check".
   */
  async check(step, fn) {
    try {
      const note = await fn();
      this.verified(step, typeof note === 'string' ? note : '');
      return true;
    } catch (err) {
      this.failed(step, err?.message ?? String(err));
      return false;
    }
  }

  counts() {
    let verified = 0, notChecked = 0, failed = 0, coreVerified = 0;
    for (const [step, { outcome }] of this.entries) {
      if (outcome === VERIFIED) { verified++; if (this.coreSteps.has(step)) coreVerified++; }
      else if (outcome === NOT_CHECKED) notChecked++;
      else if (outcome === FAILED) failed++;
    }
    return { verified, notChecked, failed, coreVerified, total: this.entries.size };
  }

  /** Reasons the run must fail. Empty array means it may pass. */
  violations() {
    const { failed, notChecked, coreVerified } = this.counts();
    const out = [];
    if (failed > 0) out.push(`${failed} step(s) FAILED`);
    if (coreVerified === 0) {
      out.push(
        this.coreSteps.size === 0
          ? 'no core steps were declared, so the run cannot show it verified anything'
          : `no core flow step was VERIFIED (0 of ${this.coreSteps.size}) — ` +
            'the suite did not exercise the thing it exists to test',
      );
    }
    if (this.strict && notChecked > 0) {
      out.push(`${notChecked} step(s) NOT CHECKED under --strict`);
    }
    if (this.doubleResolved.length) {
      out.push(`step(s) resolved more than once: ${this.doubleResolved.join(', ')}`);
    }
    return out;
  }

  report(log = console.log) {
    const width = Math.max(0, ...[...this.entries.keys()].map((k) => k.length));
    for (const [step, { outcome, note }] of this.entries) {
      const tag = outcome.padEnd(11);
      log(`  ${tag} ${step.padEnd(width)}${note ? `  — ${note}` : ''}`);
    }
    const c = this.counts();
    log('');
    log(`  ${c.verified} VERIFIED, ${c.notChecked} NOT CHECKED, ${c.failed} FAILED ` +
        `(core verified: ${c.coreVerified}/${this.coreSteps.size})`);
    const violations = this.violations();
    if (violations.length) {
      log('');
      for (const v of violations) log(`  RUN FAILED: ${v}`);
    }
    return violations.length === 0;
  }

  exitCode() { return this.violations().length === 0 ? 0 : 1; }
}
