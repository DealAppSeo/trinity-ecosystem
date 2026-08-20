// scripts/redteam/harness.mjs — the red team probe contract and runner core.
//
// WHY THIS IS NOT JUST ANOTHER `check:*` SUITE.
//
// A `check:*` suite asserts a property the author believes holds. A red team
// probe asserts the OPPOSITE: it tries to make the system do something it
// promises not to do, and it is the ATTACK SUCCEEDING that is the signal. Those
// two need different bookkeeping, because they fail in different directions:
//
//   a check   goes red when the code regresses
//   a probe   goes red when the code was ALWAYS broken and nobody had looked
//
// If probes shared the check convention, the very first campaign would paint
// the build red with findings nobody had triaged, and the universal response to
// that is to delete the probe. So this runner separates "a new hole opened"
// from "a hole we already know about and have owned", and it does that WITHOUT
// giving anyone a quiet place to park a failure. See LEDGER below.
//
// ── THREE OUTCOMES, SAME REASONING AS EVERYWHERE ELSE HERE ───────────────────
//
//   HELD         the attack ran and the system refused / degraded safely
//   BREACHED     the attack ran and succeeded — this is a finding
//   NOT_CHECKED  the probe could not run (endpoint unreachable, no credential,
//                module would not compile). NOT a pass and NOT a failure.
//
// The third is the one that earns its keep. Most of this repo's live surfaces
// are proxy-denied from an agent session (CLAUDE.md § Network), so a naive
// two-outcome runner in a sandbox reports "no breaches found" over zero
// executed attacks — which is the single defect CLAUDE.md names as the
// recurring one, arriving through the door marked security.
//
// A probe that cannot run MUST say so and MUST say what would let it run. That
// is why `NOT_CHECKED` carries a required `howToRun` string.
//
// ── THE LEDGER, AND WHY A KNOWN FINDING EXPIRES ──────────────────────────────
//
// `scripts/redteam/ledger.json` records every BREACHED probe that has been
// triaged: who owns it, why it is still open, and — required — a `reviewBy`
// date. The runner's verdict is then:
//
//   BREACHED + not in ledger        → FAILED (exit 1). A new hole.
//   BREACHED + in ledger, in date   → KNOWN_OPEN. Printed loudly, exit unaffected.
//   BREACHED + in ledger, EXPIRED   → FAILED (exit 1). The debt came due.
//   HELD     + in ledger            → FAILED (exit 1). Stale ledger entry —
//                                     the finding is fixed and the record lies.
//
// That last rule is the one that keeps the ledger honest in the other
// direction. PRIOR-WORK-INDEX.md exists because an out-of-date record of what
// is true costs a sprint; a security ledger claiming a hole that is closed is
// the same defect, and it also hides the regression if the hole ever REOPENS
// (it would read as the known-open case forever). "A caveat is a debt" —
// `reviewBy` is the due date, and this runner is the collector.
//
// ── EVIDENCE IS MANDATORY ────────────────────────────────────────────────────
//
// The skill's first principle is "never claim a successful attack without
// captured evidence". That is enforced here, not requested: a probe returning
// BREACHED without a non-empty `evidence` is itself an error, because an
// unevidenced finding is indistinguishable from a hallucinated one and this
// codebase has already had to retract four published numbers.

/** @typedef {'HELD'|'BREACHED'|'NOT_CHECKED'} Outcome */

export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low', 'Informational'];

/**
 * Build a probe result. Use these rather than object literals — they enforce
 * the evidence rule at the point the claim is made.
 */
export const held = (detail, evidence) => ({ outcome: 'HELD', detail, evidence: evidence ?? null });

export const breached = (detail, evidence) => {
  if (evidence === undefined || evidence === null || evidence === '') {
    throw new Error(
      `probe reported BREACHED with no evidence: ${detail}\n` +
      '    A finding without captured evidence may not be published. Return the ' +
      'exact input, the exact output, and where it came from.'
    );
  }
  return { outcome: 'BREACHED', detail, evidence };
};

/**
 * @param detail  why it could not run
 * @param howToRun  the exact command / condition that WOULD run it. Required:
 *   a NOT_CHECKED with no route to CHECKED is indistinguishable from a probe
 *   that has quietly stopped working.
 */
export const notChecked = (detail, howToRun) => {
  if (!howToRun) {
    throw new Error(
      `probe reported NOT_CHECKED without a howToRun: ${detail}\n` +
      '    Say what would make this runnable, or the gap is invisible.'
    );
  }
  return { outcome: 'NOT_CHECKED', detail, evidence: null, howToRun };
};

/** Validate a probe module's shape at load time, so a typo is loud. */
export function validateProbe(probe, source) {
  const need = ['id', 'title', 'component', 'severity', 'threat', 'run'];
  for (const field of need) {
    if (!probe?.[field]) throw new Error(`${source}: probe is missing \`${field}\``);
  }
  if (!SEVERITIES.includes(probe.severity)) {
    throw new Error(`${source}: severity ${JSON.stringify(probe.severity)} is not one of ${SEVERITIES.join('/')}`);
  }
  if (typeof probe.run !== 'function') throw new Error(`${source}: \`run\` must be a function`);
  return probe;
}

/**
 * Decide the verdict for one probe against the ledger.
 *
 * Pure, and exported so `check:redteam`'s own self-test can drive every branch
 * without needing a probe that actually breaches something.
 *
 * @param {Outcome} outcome
 * @param {{owner?: string, reason?: string, reviewBy?: string}|undefined} entry
 * @param {Date} now
 */
export function verdictFor(outcome, entry, now) {
  if (outcome === 'NOT_CHECKED') {
    return { verdict: 'NOT_CHECKED', fails: false, note: 'probe could not run' };
  }
  if (outcome === 'HELD') {
    if (entry) {
      return {
        verdict: 'LEDGER_STALE',
        fails: true,
        note: `the attack no longer succeeds, but ledger.json still lists it as open (owner: ${entry.owner}). ` +
              'Remove the entry — a security record that claims a closed hole hides the regression if it reopens.',
      };
    }
    return { verdict: 'HELD', fails: false, note: 'the system refused' };
  }
  // BREACHED
  if (!entry) {
    return { verdict: 'NEW_FINDING', fails: true, note: 'not in ledger.json — this is a new hole' };
  }
  const due = new Date(`${entry.reviewBy}T00:00:00Z`);
  if (Number.isNaN(due.getTime())) {
    return { verdict: 'LEDGER_INVALID', fails: true, note: `reviewBy ${JSON.stringify(entry.reviewBy)} is not a date` };
  }
  if (now > due) {
    return {
      verdict: 'EXPIRED',
      fails: true,
      note: `accepted until ${entry.reviewBy}, which has passed. Owner: ${entry.owner}. ` +
            'Fix it, or re-date it with a reason — but not silently.',
    };
  }
  return { verdict: 'KNOWN_OPEN', fails: false, note: `accepted until ${entry.reviewBy}, owner: ${entry.owner}` };
}
