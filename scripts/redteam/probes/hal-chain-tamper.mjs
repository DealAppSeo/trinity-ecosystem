// HAL-001 — can a tampered or truncated HAL chain be made to report VERIFIED?
//
// THREAT. The HAL chain is the audit trail for hallucination classifications:
// 102,934+ links, each committing to its predecessor. Its value is entirely in
// what a VERIFIED verdict means. An attacker who can write to
// `hal_classifications` wants one of three things:
//
//   1. edit a classification and keep the chain reporting VERIFIED
//   2. DELETE the inconvenient stretch and have the remainder verify clean
//   3. reorder, so a later entry appears to precede the one it contradicts
//
// (2) is worth the most and is the one most verifiers miss, because after a
// truncation everything that remains is internally consistent. A verifier that
// walks the links it was handed and finds them all sound will report VERIFIED
// over a window whose first link points at something nobody showed it. That is
// the difference between "these links are sound" and "this is the chain".
//
// ── THE ASSERTION THAT CARRIES THIS PROBE ───────────────────────────────────
//
// Not any single attack, but a REACHABILITY question about the verdict itself:
//
//     is there ANY input for which outcome === 'VERIFIED'
//     while windowStartUnverifiable === false?
//
// That is the ceiling-before-optimising discipline applied to a security
// verdict, and it is cheap: the first entry either carries a predecessor link
// (so the window start cannot be anchored) or does not (so a link goes
// unchecked and the verdict degrades). If both branches lead away from a fully
// anchored VERIFIED, then **every VERIFIED this function can ever emit is over
// a window whose beginning is unverifiable** — and a caller gating on `outcome`
// alone, which is the shape every sibling module here uses, accepts a chain
// whose head may have been deleted.
//
// The probe therefore searches for a counterexample rather than assuming one
// way or the other, and reports what it finds.
//
// Every entry below is SYNTHETIC. Preflight fences forbid production rows as
// git fixtures, and this probe needs no live data to be decisive.

import { createHash } from 'node:crypto';
import { compileAndImport } from '../compile.mjs';
import { held, breached, notChecked } from '../harness.mjs';

/**
 * A stand-in producer formula. Its CONTENT does not matter — what matters is
 * that the probe and the fixture agree, so a link mismatch means tampering
 * rather than a wrong guess about the real producer's formula, which this
 * repository does not hold.
 */
const oracle = (e) =>
  createHash('sha256')
    .update(`${e.id}|${e.prompt_hash}|${e.category}|${e.created_at}|${e.previous_entry_hash ?? ''}`)
    .digest('hex');

/**
 * Build a chain of `n` entries linked under the oracle.
 *
 * @param genesis  true  → entry 0 has no predecessor (the real chain's start)
 *                 false → entry 0 links to an entry outside the window (a page
 *                         of a longer chain, which is what a query returns)
 */
function buildChain(n, { genesis, startIso = '2026-07-01T00:00:00.000Z' } = {}) {
  const startMs = Date.parse(startIso);
  const entries = [];
  let prevHash = genesis ? null : 'a'.repeat(64);
  for (let i = 0; i < n; i += 1) {
    const e = {
      id: 1000 + i,
      prompt_hash: `p${i}`,
      category: 'factual',
      confidence: 'high',
      latency_ms: 100,
      provider: 'synthetic',
      model: 'synthetic',
      created_at: new Date(startMs + i * 60_000).toISOString(),
      previous_entry_hash: prevHash,
    };
    entries.push(e);
    prevHash = oracle(e);
  }
  return entries;
}

export default {
  id: 'HAL-001',
  title: 'HAL chain: VERIFIED is only reachable on a window that cannot be anchored',
  component: 'HAL / audit chain',
  severity: 'Medium',
  threat: 'A caller gating on `outcome` accepts a chain whose head was deleted, because the truncation is reported in a separate field the verdict string never mentions.',

  async run() {
    const c = await compileAndImport(['lib/trustshell/hal-chain.ts']);
    if (!c.ok) return notChecked(c.reason, c.howToRun);

    const { verifyHalChain } = c.modules[0];
    if (!verifyHalChain) {
      c.cleanup();
      return notChecked('hal-chain.ts no longer exports verifyHalChain', 're-point this probe');
    }

    const transcript = [];
    const breaches = [];

    const record = (label, entries, opts) => {
      const r = verifyHalChain(entries, opts);
      transcript.push(
        `${label.padEnd(50)} -> ${r.outcome.padEnd(11)} verified=${r.linksVerified} notChecked=${r.linksNotChecked} ` +
        `windowStartUnverifiable=${r.windowStartUnverifiable} defects=${r.defects.map((d) => d.kind).join('/') || 'none'}`
      );
      return r;
    };

    // ── the tampering battery ───────────────────────────────────────────────
    // A genesis chain is the honest baseline for these: its first entry has no
    // predecessor by design (adoption, not a break), so any defect reported is
    // the tampering and nothing else.
    const genesis = buildChain(6, { genesis: true, startIso: '2026-06-01T00:00:00.000Z' });

    const battery = [
      {
        label: 'untampered genesis chain, correct hasher',
        entries: genesis,
        opts: { hasher: oracle },
        // NOT VERIFIED, and correctly so: entry 0's absent link is one link
        // that could not be recomputed, and a partially verified chain is not a
        // verified one. The anchor is that it reports NO DEFECTS.
        require: (r) => r.defects.length === 0,
        requireDesc: 'a clean chain must report zero defects',
      },
      {
        label: 'untampered chain, NO hasher supplied',
        entries: genesis,
        opts: {},
        require: (r) => r.outcome !== 'VERIFIED',
        requireDesc: 'with no formula, not one link can be recomputed — VERIFIED would be unearned',
      },
      {
        label: 'entry 3 category edited in place',
        entries: genesis.map((e, i) => (i === 3 ? { ...e, category: 'not-a-hallucination' } : e)),
        opts: { hasher: oracle },
        require: (r) => r.outcome === 'FAILED',
        requireDesc: 'in-place tampering must FAIL, not merely degrade',
      },
      {
        label: 'entries 2 and 3 swapped (time runs backwards)',
        entries: (() => { const s = [...genesis]; [s[2], s[3]] = [s[3], s[2]]; return s; })(),
        opts: { hasher: oracle },
        require: (r) => r.outcome === 'FAILED',
        requireDesc: 'reordering must FAIL',
      },
      {
        label: 'entry 4 predecessor nulled (post-cutover)',
        entries: buildChain(6, { genesis: true }).map((e, i) => (i === 4 ? { ...e, previous_entry_hash: null } : e)),
        opts: { hasher: oracle },
        require: (r) => r.outcome === 'FAILED',
        requireDesc: 'a severed mid-chain link after the cutover is a break, not adoption',
      },
      {
        label: 'two entries claiming the same predecessor',
        entries: (() => { const s = buildChain(6, { genesis: true }); s[4] = { ...s[4], previous_entry_hash: s[3].previous_entry_hash }; return s; })(),
        opts: { hasher: oracle },
        require: (r) => r.outcome === 'FAILED',
        requireDesc: 'two entries cannot follow one — a fork must FAIL',
      },
      {
        label: 'empty window',
        entries: [],
        opts: { hasher: oracle },
        require: (r) => r.outcome === 'NOT_CHECKED',
        requireDesc: '"we queried and found nothing" must never read as "nothing is wrong"',
      },
    ];

    for (const t of battery) {
      const r = record(t.label, t.entries, t.opts);
      if (!t.require(r)) breaches.push(`${t.label}: ${t.requireDesc} — got ${r.outcome} (${r.defects.length} defects)`);
    }

    // ── the truncation attack, and the reachability question behind it ──────
    transcript.push('');
    const full = buildChain(9, { genesis: true });
    const truncated = full.slice(4);           // head deleted; the rest is self-consistent
    const rTrunc = record('HEAD DELETED, tail presented as the chain', truncated, { hasher: oracle });

    if (rTrunc.outcome === 'VERIFIED') {
      // The verifier DOES set windowStartUnverifiable — the question is whether
      // a caller reading the verdict would ever learn that.
      const detailMentions = /window|unverifiable|anchor|start|truncat|begin/i.test(rTrunc.detail);
      breaches.push(
        'a truncated window returns outcome=VERIFIED. The truncation is signalled only in the ' +
        `separate boolean \`windowStartUnverifiable\`, and the human-readable \`detail\` ` +
        `${detailMentions ? 'does mention it' : 'DOES NOT MENTION IT'}: "${rTrunc.detail}"`
      );
    }

    // Is a fully-anchored VERIFIED reachable at all? Search rather than assume.
    transcript.push('');
    transcript.push('searching for any input with outcome=VERIFIED and windowStartUnverifiable=false:');
    let anchoredVerified = null;
    // Both eras are searched. A post-cutover genesis chain FAILS (an absent
    // link after the cutover is a break); a pre-cutover one is legitimate
    // adoption and degrades to NOT_CHECKED. Neither reaches an anchored
    // VERIFIED, and searching only one era would leave that looking like an
    // artefact of the fixture's date rather than a property of the verdict.
    for (const n of [1, 2, 3, 6, 12]) {
      for (const gen of [true, false]) {
        for (const [era, startIso] of [['pre-cutover', '2026-06-01T00:00:00.000Z'], ['post-cutover', '2026-07-01T00:00:00.000Z']]) {
          const entries = buildChain(n, { genesis: gen, startIso });
          const r = verifyHalChain(entries, { hasher: oracle });
          transcript.push(
            `    n=${String(n).padStart(2)} genesis=${String(gen).padEnd(5)} ${era.padEnd(12)} -> ${r.outcome.padEnd(11)} windowStartUnverifiable=${r.windowStartUnverifiable}`
          );
          if (r.outcome === 'VERIFIED' && r.windowStartUnverifiable === false) anchoredVerified = { n, gen, era };
        }
      }
    }

    if (anchoredVerified) {
      transcript.push(`    FOUND: n=${anchoredVerified.n} genesis=${anchoredVerified.gen} — a fully anchored VERIFIED exists`);
    } else {
      transcript.push('    none found across the search space');
      breaches.push(
        'no input produces outcome=VERIFIED with windowStartUnverifiable=false: a chain including its ' +
        'genesis has one unrecomputable link and degrades to NOT_CHECKED, while any window that avoids ' +
        'that cannot anchor its own start. So EVERY VERIFIED this verifier can emit is over a window ' +
        'whose beginning is unexaminable — and `outcome` alone cannot distinguish a sound chain from a truncated one.'
      );
    }

    c.cleanup();

    if (breaches.length > 0) {
      return breached(
        `${breaches.length} finding(s) in the chain verdict`,
        [...breaches.map((b) => `  BREACH  ${b}`), '', 'full transcript (synthetic entries only):', ...transcript.map((t) => `    ${t}`)].join('\n')
      );
    }

    return held(
      'tampering, reordering, forks and severed links all FAIL; truncation is distinguishable from `outcome` alone',
      transcript.join('\n')
    );
  },
};
