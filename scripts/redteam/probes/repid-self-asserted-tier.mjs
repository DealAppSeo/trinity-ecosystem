// REPID-001 — how much spending authority does an agent get for ASSERTING it?
//
// THREAT. RepID's proposition is that authority is earned: a tier, and the
// spending limit attached to it, should be downstream of observed behaviour. So
// the sharpest question a red team can ask is not "can I forge a score" but the
// cheaper one: **which inputs to that score does the subject control?**
//
// Of the five components, four are measured from recorded outcomes. One —
// `humanCustody` — is a boolean read out of the KYA registry. An agent that is
// registered with that flag set contributes its full weight without any
// behaviour having been observed at all. Everything else can be zero.
//
// So the attack is: an agent with NO measured history, NO BFT record, NO
// settlement history and NO latency data, holding exactly one self-asserted
// flag. What tier does it land in, and what daily limit comes with it?
//
// WHAT THIS PROBE DELIBERATELY DOES NOT ASSERT. It does not claim the flag is
// forgeable — writing to `agent_kya_registry` is a separate question with its
// own answer. It claims something narrower and harder to argue with: **the
// score curve pays for the one input that is not a measurement**, so the size
// of the prize is whatever that registry write is worth. This probe measures
// the prize. It is executed against the production scoring module, not
// described.

import { compileAndImport } from '../compile.mjs';
import { held, breached, notChecked } from '../harness.mjs';

export default {
  id: 'REPID-001',
  title: 'Spending authority reachable from self-asserted inputs alone',
  component: 'RepID / tier ladder',
  severity: 'High',
  threat: 'An agent with zero measured behaviour reaches a funded tier on one registry boolean.',

  async run() {
    const c = await compileAndImport(['lib/trustshell/repid-scoring.ts']);
    if (!c.ok) return notChecked(c.reason, c.howToRun);

    const m = c.modules[0];
    const need = ['normalizeMetrics', 'contributionsOf', 'sumContributions', 'scoreFromWeightedSum',
                  'tierForScore', 'TIER_LIMITS', 'DEFAULT_WEIGHTS', 'reachableCeiling'];
    const missing = need.filter((k) => m[k] === undefined);
    if (missing.length) {
      c.cleanup();
      return notChecked(
        `repid-scoring.ts no longer exports ${missing.join(', ')}`,
        're-point this probe at the current scoring exports'
      );
    }

    const score = (raw) =>
      m.scoreFromWeightedSum(m.sumContributions(m.contributionsOf(m.normalizeMetrics(raw), m.DEFAULT_WEIGHTS)));

    // The whole population an attacker can choose between, from cheapest to
    // most expensive. `nothing` is the floor an unregistered agent gets; the
    // rest add exactly one self-asserted bit.
    const ZERO = { bftAccuracy: 0, veritasCatchRate: 0, x402SuccessRate: 0, latencyMs: 99_999, humanCustody: false };
    const cases = [
      { label: 'nothing measured, no custody flag', raw: ZERO },
      { label: 'nothing measured, humanCustody ASSERTED', raw: { ...ZERO, humanCustody: true } },
      // Latency is measured, but note what an absent measurement is worth: if a
      // caller ever passes 0 for "unknown" rather than a large sentinel, the
      // curve reads it as a perfect 0 ms response. Included so the report can
      // tell a hardened path from a lucky one.
      { label: 'nothing measured, latencyMs passed as 0 ("unknown")', raw: { ...ZERO, latencyMs: 0 } },
      { label: 'both of the above together', raw: { ...ZERO, latencyMs: 0, humanCustody: true } },
    ];

    const transcript = [];
    const findings = [];

    for (const { label, raw } of cases) {
      const s = score(raw);
      const tier = m.tierForScore(s);
      const limits = m.TIER_LIMITS[tier];
      transcript.push(
        `${label.padEnd(52)} score=${String(Math.round(s)).padStart(5)}  tier=${tier.padEnd(8)}  ` +
        `daily=${limits.daily}  perTx=${limits.perTx}`
      );
      // Bronze is the least-privileged tier and is the correct landing place
      // for an agent that has demonstrated nothing. Anything above it means
      // authority was granted for an assertion.
      if (raw !== ZERO && tier !== 'Bronze') {
        findings.push(
          `${label} -> ${tier} (score ${Math.round(s)}), daily limit ${limits.daily} USDC / per-tx ${limits.perTx} USDC, ` +
          'on zero measured behaviour'
        );
      }
    }

    // Context the report needs to size the finding: what fraction of the
    // reachable range is a tier actually asking for?
    //
    // `reachableCeiling()` IS DRIVEN AGAINST THE SCORING PATH, not taken on the
    // strength of its name. This repo has already spent two sprints optimising
    // toward a bound nobody had computed, and the published ceiling figure has
    // since moved — so a probe that sizes a finding as a percentage of the
    // ceiling must first prove the ceiling is what the curve actually produces.
    const ceiling = m.reachableCeiling();
    const flawless = score({ bftAccuracy: 100, veritasCatchRate: 100, x402SuccessRate: 100, latencyMs: 0, humanCustody: true });
    if (Math.abs(flawless - ceiling) > 1) {
      findings.push(
        `reachableCeiling() reports ${Math.round(ceiling)} but a flawless agent driven through ` +
        `normalizeMetrics -> contributionsOf -> scoreFromWeightedSum scores ${Math.round(flawless)}. ` +
        'Every tier floor expressed as a percentage of the ceiling is therefore wrong, in whichever ' +
        'direction the two disagree.'
      );
    }
    transcript.push('');
    transcript.push(`flawless agent, driven through the real scoring path = ${Math.round(flawless)}`);
    const floors = m.TIER_FLOORS ?? [];
    transcript.push('');
    transcript.push(`reachableCeiling() = ${Math.round(ceiling)} (a flawless agent's score)`);
    for (const { tier, floor } of floors) {
      const pct = ceiling > 0 ? ((floor / ceiling) * 100).toFixed(2) : 'n/a';
      transcript.push(`  ${tier.padEnd(9)} floor ${String(floor).padStart(5)} = ${pct}% of what a flawless agent scores`);
    }
    transcript.push(`humanCustody weight = ${m.DEFAULT_WEIGHTS.humanCustodyScore} of a weighted sum whose max is 1.0`);

    c.cleanup();

    if (findings.length > 0) {
      return breached(
        `${findings.length} self-asserted-only configuration(s) reach a tier above Bronze`,
        [...findings.map((f) => `  BREACH  ${f}`), '', 'executed against lib/trustshell/repid-scoring.ts:', ...transcript.map((t) => `    ${t}`)].join('\n')
      );
    }

    return held(
      'no self-asserted-only input reaches a tier above Bronze',
      transcript.join('\n')
    );
  },
};
