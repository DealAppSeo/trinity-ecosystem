// scripts/mutations.mjs — the mutation manifest.
//
// Each entry names ONE invariant, the edit that breaks it, and the suite that
// must go red when it does. `npm run mutate` applies each in turn and fails the
// build if any SURVIVES.
//
// ============================================================================
// WHY A CURATED MANIFEST RATHER THAN GENERATED MUTANTS
// ============================================================================
//
// Tools like Stryker generate thousands of mutants mechanically — flip every
// `<` to `<=`, delete every statement — and report a percentage. That answers
// "how much of this file is exercised", which coverage already approximates,
// and it buries the interesting question in noise.
//
// The question worth asking here is narrower: **for each property we claim to
// protect, is there an assertion that actually fails when the property breaks?**
// That needs a human to name the property. So every entry below carries a
// `protects` line, and adding one is how a lane records "this invariant is now
// load-bearing".
//
// Every mutation here was performed by hand during the M2–M6 build on
// 2026-08-15. Twenty of the twenty-one were caught immediately. The one that
// SURVIVED — `t1-emits-backed` — revealed an invariant asserted over a branch no
// fixture reached: 32 assertions passing over a situation that could not occur.
// Coverage would have shown that line executing happily. Only mutation found it.
// That is the entry that justifies the whole file.

/**
 * @typedef {object} Mutation
 * @property {string} id          stable slug, used to select and to report
 * @property {string} suite       npm script that must turn red, e.g. 'check:claims'
 * @property {string} file        path relative to repo root
 * @property {string} protects    the invariant, in one sentence
 * @property {string} find        exact substring to replace — must occur EXACTLY once
 * @property {string} replace     what to put there
 */

/** @type {Mutation[]} */
export const MUTATIONS = [
  // -------------------------------------------------------------------------
  // lib/dual-view — the contract four lanes build against
  // -------------------------------------------------------------------------
  {
    id: 'fixtures-all-green',
    suite: 'check:dual-view',
    file: 'lib/dual-view/fixtures.ts',
    protects:
      'the swarm fixture holds the fleet\'s MEASURED distribution (3 running, 9 stale) — ' +
      'drifting to all-green would let the UI render 9 probe-only agents as working, ' +
      'undoing trinity_changelog #134 in the one surface built to be screenshotted',
    find: "status: live ? 'running' : 'stale',",
    replace: "status: 'running',",
  },
  {
    id: 'contract-reason-optional',
    suite: 'check:dual-view',
    file: 'lib/dual-view/contract.ts',
    protects:
      'every node carries a non-empty `reason` — a node rendering green without ' +
      'carrying what made it green is this repo\'s house defect in UI form',
    find: '  requireNonEmptyString(node.reason, `${path}.reason`, out);',
    replace: '  // mutated: reason no longer required',
  },
  {
    id: 'node-remove-keeps-edges',
    suite: 'check:dual-view',
    file: 'lib/dual-view/contract.ts',
    protects:
      'removing a node removes its edges — a dangling edge makes a graph library ' +
      'either throw or silently drop a node at render time',
    find: '      const edges = prev.edges.filter((e) => e.from !== event.id && e.to !== event.id);',
    replace: '      const edges = prev.edges;',
  },

  // -------------------------------------------------------------------------
  // lib/trustshell/receipt — M2
  // -------------------------------------------------------------------------
  {
    id: 'marker-no-tier-guard',
    suite: 'check:receipt',
    file: 'lib/trustshell/receipt/build.ts',
    protects:
      'THE confabulation guard. With no claim tier enabled the marker is NOT_CHECKED ' +
      'unconditionally. Without it an M2 receipt prints "VERIFIED  0 claims - 0 backed" — ' +
      'the fourth instance of this repo\'s defining failure, inside the product built to catch it',
    find:
      "  const anyClaimTier = core.ruleset.claimsT0 || core.ruleset.claimsT1 || core.ruleset.claimsT2;\n" +
      "  if (!anyClaimTier) return 'NOT_CHECKED';",
    replace: '  // mutated: confabulation guard removed',
  },
  {
    id: 'canonical-unsorted-keys',
    suite: 'check:receipt',
    file: 'lib/trustshell/receipt/canonical.ts',
    protects:
      'canonical JSON sorts keys — without it two structurally identical receipts ' +
      'hash differently and audit_hash stops being stable across re-runs',
    find: '  const keys = Object.keys(obj).sort();',
    replace: '  const keys = Object.keys(obj);',
  },
  {
    id: 'signature-skips-core-hash',
    suite: 'check:receipt',
    file: 'lib/trustshell/receipt/sign.ts',
    protects:
      'a good signature over a MODIFIED core must fail — the signature covers ' +
      'auditHash, so verification has to re-derive auditHash from the core first',
    find: '  const recomputed = await recomputeReceipt(receipt);\n  if (!recomputed.auditHashMatches) {',
    replace: '  const recomputed = await recomputeReceipt(receipt);\n  if (false) {',
  },
  {
    id: 'check-receipt-takes-ceiling',
    suite: 'check:receipt',
    file: 'lib/trustshell/receipt/sign.ts',
    protects:
      'checkReceipt takes the FLOOR of its parts — a perfect signature over data ' +
      'nobody checked is still NOT CHECKED, never VERIFIED',
    find: "  } else if (signature.outcome === 'NOT_CHECKED' || markerFromData === 'NOT_CHECKED') {",
    replace: "  } else if (false) {",
  },

  // -------------------------------------------------------------------------
  // scripts/trustshell-verify-receipt.mjs — M3, the INDEPENDENT verifier
  //
  // These matter more than most: the verifier's whole value is being a second
  // implementation. A verifier that quietly agrees by taking shortcuts is worth
  // nothing, and nothing else in the suite would notice.
  // -------------------------------------------------------------------------
  {
    id: 'verifier-unsorted-keys',
    suite: 'check:receipt-verifier',
    file: 'scripts/trustshell-verify-receipt.mjs',
    protects:
      'the independent verifier canonicalises the same way the builder does — ' +
      'a divergence here rejects valid receipts in production',
    find: '  return `{${Object.keys(value)\n    .sort()',
    replace: '  return `{${Object.keys(value)',
  },
  {
    id: 'verifier-trusts-stored-marker',
    suite: 'check:receipt-verifier',
    file: 'scripts/trustshell-verify-receipt.mjs',
    protects:
      'the verifier RECOMPUTES the marker rather than reading it. The stored marker ' +
      'sits outside auditHash, so a verifier that reads it can be lied to by editing ' +
      'one string. This is the mutation that proves the tamper test is not vacuous',
    find: '  const expected = markerFor(receipt.core);',
    replace: '  const expected = receipt.marker;',
  },
  {
    id: 'verifier-skips-transcript-binding',
    suite: 'check:receipt-verifier',
    file: 'scripts/trustshell-verify-receipt.mjs',
    protects:
      'the receipt is checked against the transcript actually supplied — otherwise ' +
      'it verifies cleanly against a file it does not describe',
    find: "      actual === claimed ? 'VERIFIED' : 'FAILED',",
    replace: "      'VERIFIED',",
  },
  {
    id: 'verifier-drops-domain-tag',
    suite: 'check:receipt-verifier',
    file: 'scripts/trustshell-verify-receipt.mjs',
    protects:
      'the domain tag is part of the hashed preimage — dropping it lets a receipt ' +
      'hash collide with any other signed payload in this codebase',
    find: 'await sha256Hex(`${AUDIT_DOMAIN}|${canonical(receipt.core)}`)',
    replace: 'await sha256Hex(canonical(receipt.core))',
  },

  // -------------------------------------------------------------------------
  // lib/trustshell/receipt/claims.ts — M4
  // -------------------------------------------------------------------------
  {
    id: 'claims-keeps-code-fences',
    suite: 'check:claims',
    file: 'lib/trustshell/receipt/claims.ts',
    protects:
      'fenced code is stripped before extraction — an agent SHOWING a tool in a ' +
      'usage example is not claiming to have run it. This was the largest ' +
      'false-positive source in the first draft',
    find: "  return text\n    .replace(/```[\\s\\S]*?(?:```|$)/g, ' ')",
    replace: "  return text\n    .replace(/(?!)/g, ' ')",
  },
  {
    id: 'claims-no-failure-standdown',
    suite: 'check:claims',
    file: 'lib/trustshell/receipt/claims.ts',
    protects:
      'a span that ACKNOWLEDGES the failure it sits next to is honest reporting, ' +
      'not a false claim — "exit 1, as expected" must not be scored as a contradiction',
    find: '    if (ACKNOWLEDGES_FAILURE.test(body)) {',
    replace: '    if (false) {',
  },
  {
    id: 'claims-links-whole-window',
    suite: 'check:claims',
    file: 'lib/trustshell/receipt/claims.ts',
    protects:
      'T1 links to the IMMEDIATELY preceding call, not any failure in the window. ' +
      'Window-wide linking was the structural cause of both measured false positives',
    find:
      '    const last = linked.length > 0 ? linked[linked.length - 1] : null;\n' +
      "    const bad = last && (last.outcome === 'error' || last.outcome === 'denied') ? [last] : [];",
    replace: "    const bad = linked.filter((t) => t.outcome === 'error' || t.outcome === 'denied');",
  },
  {
    id: 't1-emits-backed',
    suite: 'check:claims',
    file: 'lib/trustshell/receipt/claims.ts',
    protects:
      'T1 can refute but never confirm. Absence of a contradiction is not evidence ' +
      'of support, and scoring it as support would let a receipt reach VERIFIED on ' +
      'adjacency alone. THIS IS THE MUTATION THAT SURVIVED on 2026-08-15: the ' +
      'invariant existed but its fixture never reached the branch. Adding a fixture ' +
      'that does is what made the assertion real',
    find:
      "      findings.push({\n        tier: 'T1',\n        claimSpan: excerpt(body),\n" +
      "        evidenceRef: span.recordUuid,\n        verdict: 'unchecked',\n      });\n" +
      '      continue;\n    }\n\n    // The span concedes',
    replace:
      "      findings.push({\n        tier: 'T1',\n        claimSpan: excerpt(body),\n" +
      "        evidenceRef: span.recordUuid,\n        verdict: linked.length > 0 ? 'backed' : 'unchecked',\n      });\n" +
      '      continue;\n    }\n\n    // The span concedes',
  },
  {
    id: 'claims-present-tense-completive',
    suite: 'check:claims',
    file: 'lib/trustshell/receipt/claims.ts',
    protects:
      '"I am running X" and "I will call X" are not assertions that it happened — ' +
      'only past-tense completives count as a claim of having used a tool',
    // The replacement must match what the FIXTURES say — "I will call X" and
    // "I am running X". An earlier version added `call` and `using` to the
    // alternation, which breaks neither, so the suite stayed green and the gate
    // reported SURVIVED. That was a defect in this manifest, not in the code:
    // the invariant was protected all along. A mutation that does not actually
    // violate the rule it names is worth exactly nothing.
    find: '(?:ran|called|used|invoked|executed|queried|fetched|installed|checked)\\b|^\\s*',
    replace:
      '(?:ran|called|used|invoked|executed|queried|fetched|installed|checked' +
      '|will\\s+call|am\\s+running)\\b|^\\s*',
  },

  // -------------------------------------------------------------------------
  // scripts/trustshell-init.mjs — M5. Every one of these is destructive if it
  // regresses: this file edits a config a running agent reads.
  // -------------------------------------------------------------------------
  {
    id: 'init-hook-does-not-swallow',
    suite: 'check:init',
    file: 'scripts/trustshell-init.mjs',
    protects:
      'TRUSTSHELL-V1 §7.3 — the installed Stop hook swallows a non-zero exit. ' +
      'An observer that can fail the session it observes is not in shadow mode',
    find: ' ; } || true`;',
    replace: '; }`;',
  },
  {
    id: 'init-appends-duplicate-hook',
    suite: 'check:init',
    file: 'scripts/trustshell-init.mjs',
    protects:
      'install is idempotent — two installs leave ONE hook, not two racing to ' +
      'write the same receipt',
    find:
      "      hooks: (group.hooks ?? []).filter((h) => !String(h.command ?? '').includes(MARKER)),\n" +
      '    }))\n    .filter((group) => (group.hooks ?? []).length > 0);\n\n  cleaned.push(',
    replace:
      '      hooks: group.hooks ?? [],\n' +
      '    }))\n    .filter((group) => (group.hooks ?? []).length > 0);\n\n  cleaned.push(',
  },
  {
    id: 'init-uninstall-drops-foreign',
    suite: 'check:init',
    file: 'scripts/trustshell-init.mjs',
    protects:
      'uninstall removes ONLY our hook and leaves everyone else\'s intact',
    find:
      "  next.hooks.Stop = next.hooks.Stop\n    .map((group) => ({\n      ...group,\n" +
      "      hooks: (group.hooks ?? []).filter((h) => !String(h.command ?? '').includes(MARKER)),\n" +
      '    }))\n    .filter((group) => (group.hooks ?? []).length > 0);',
    replace: '  next.hooks.Stop = [];',
  },
  {
    id: 'init-overwrites-malformed',
    suite: 'check:init',
    file: 'scripts/trustshell-init.mjs',
    protects:
      'a settings.json we cannot parse is never overwritten — it is someone\'s ' +
      'work in progress, and replacing it would destroy whatever they were editing',
    find: '    return { settings: null, existed: true, error: err.message };',
    replace: '    return { settings: {}, existed: true, error: null };',
  },
  {
    id: 'init-dry-run-writes',
    suite: 'check:init',
    file: 'scripts/trustshell-init.mjs',
    protects:
      'dry run is the DEFAULT and writes nothing — this tool edits a config a ' +
      'running agent reads, so the safe path has to be the one you get by accident',
    find: "  if (!flag('--apply')) {",
    replace: '  if (false) {',
  },

  // -------------------------------------------------------------------------
  // scripts/check-probes.mjs — the gate that needs a gate
  //
  // A checker is the easiest place for this repo's defining failure to hide,
  // because a checker that never fires and a checker with nothing to find print
  // the same line. check-probes-selftest.mjs runs the real scanner over
  // synthetic corpora with known answers; these mutations are what make that
  // self-test's green mean something.
  // -------------------------------------------------------------------------
  {
    id: 'probes-dep-exemption-swallows-everything',
    suite: 'check:probes',
    file: 'scripts/check-probes.mjs',
    protects:
      'only DECLARED dependencies are exempt — the exemption is the whole boundary ' +
      'of this gate, and one widened to everything would report VERIFIED over a ' +
      'corpus it never looked at',
    find: '    if (deps.has(name)) {',
    replace: '    if (true) {',
  },
  {
    id: 'probes-any-probe-covers-any-package',
    suite: 'check:probes',
    file: 'scripts/check-probes.mjs',
    protects:
      'a probe only covers the package it NAMES — otherwise one probe line ' +
      'anywhere in a file launders every unprobed reference in it, which is the ' +
      'exact shape of the three specs this gate exists to have caught',
    find: 'const covered = fileProbes.find((p) => p.text.includes(name) || p.text.includes(bare));',
    replace: 'const covered = fileProbes[0];',
  },
  {
    id: 'probes-undated-probe-accepted',
    suite: 'check:probes',
    file: 'scripts/check-probes.mjs',
    protects:
      'a probe carries a date — the word PROBED alone is an assertion, and this ' +
      'gate exists precisely because assertions about external artifacts go stale ' +
      'silently',
    find: "const PROBE = /\\[PROBED\\s+(\\d{4}-\\d{2}-\\d{2})\\s*:/i;",
    replace: "const PROBE = /\\[PROBED()/i;",
  },
  {
    id: 'probes-allowlist-ignored',
    suite: 'check:probes',
    file: 'scripts/check-probes.mjs',
    protects:
      'the ALLOW map actually skips the file it names — an allowlist that silently ' +
      'stopped applying would turn a documented exception into a mystery failure',
    find: '  if (ALLOW.has(rel)) continue;',
    replace: '  if (false) continue;',
  },
  {
    id: 'probes-stale-becomes-fatal',
    suite: 'check:probes',
    file: 'scripts/check-probes.mjs',
    protects:
      'age alone never fails the build — a document recording a historical ' +
      'measurement must not rot just because time passed, or every old doc becomes ' +
      'a build break and the gate gets routed around',
    find: '      if (age > staleDays) stale.push({ file: rel, ref, date: covered.date, age });',
    replace:
      '      if (age > staleDays) violations.push({ file: rel, line: 0, ref, name });',
  },

  // -------------------------------------------------------------------------
  // lib/trustshell/hal-receipt.ts — the newest writer into the table whose
  // every existing row had to be retracted for overclaiming.
  // -------------------------------------------------------------------------
  {
    id: 'hal-receipt-bft-false-not-null',
    suite: 'check:hal-receipt',
    file: 'lib/trustshell/hal-receipt.ts',
    protects:
      'bft_passed is NULL on a HAL receipt, not false — the panel did not vote, and ' +
      'false asserts a failed vote as confidently as true asserts a passed one. This ' +
      'is the exact field that got all 12 pre-existing rows retracted',
    find: '    bft_passed:   null,',
    replace: '    bft_passed:   false,',
  },
  {
    id: 'hal-receipt-claims-a-chain',
    suite: 'check:hal-receipt',
    file: 'lib/trustshell/hal-receipt.ts',
    protects:
      'a HAL receipt names no chain — the column defaults to base-sepolia, so ' +
      'accepting the default writes a network a classification never touched',
    find: '    on_chain_network: null,',
    replace: "    on_chain_network: 'base-sepolia',",
  },
  {
    id: 'hal-receipt-borrows-payment-status',
    suite: 'check:hal-receipt',
    file: 'lib/trustshell/hal-receipt.ts',
    protects:
      'tx_verification_status is not_applicable, so HAL receipts stay visible in a ' +
      'group-by instead of silently joining the payment population',
    find: "    tx_verification_status: 'not_applicable',",
    replace: "    tx_verification_status: 'pending',",
  },
  {
    id: 'hal-receipt-preimage-drops-a-field',
    suite: 'check:hal-receipt',
    file: 'lib/trustshell/hal-receipt.ts',
    protects:
      'every field is bound by the audit hash — a field dropped from the preimage ' +
      'during a refactor leaves the receipt verifying happily while no longer ' +
      'protecting what it appears to',
    find: '    JSON.stringify(c.previous_entry_hash),',
    replace: '',
  },
  {
    id: 'hal-receipt-preimage-ambiguous-again',
    suite: 'check:hal-receipt',
    file: 'lib/trustshell/hal-receipt.ts',
    protects:
      'the preimage is unambiguous — raw interpolation makes an absent field ' +
      'collide with the string "null", and a colon inside a value shift every ' +
      'later field boundary. Both were real, and both were caught by this suite ' +
      'on its first run',
    find: '    JSON.stringify(c.category),',
    replace: "    (c.category ?? 'null'),",
  },

  // -------------------------------------------------------------------------
  // lib/trustshell/throughput/ledger.ts — the instrument that has to fire on an
  // outage three dashboards missed for 29 days.
  // -------------------------------------------------------------------------
  {
    id: 'throughput-canary-counts-as-output',
    suite: 'check:throughput',
    file: 'lib/trustshell/throughput/ledger.ts',
    protects:
      'a synthetic probe NEVER counts as production. This is the exact bug that hid ' +
      'the 2026-07-17 outage for four weeks: one identical prompt per day kept every ' +
      'liveness check answering "yes, something happened recently"',
    find: '  const producing = o.rows > 0;',
    replace: '  const producing = o.rows + o.syntheticRows > 0;',
  },
  {
    id: 'throughput-degradation-never-fires',
    suite: 'check:throughput',
    file: 'lib/trustshell/throughput/ledger.ts',
    protects:
      'a running producer well below its own baseline is loud. Silence-only alerting ' +
      'fires on 07-18; the degradation rule fires on 07-16, two days earlier, while ' +
      'the fleet was still alive and the cause was still recoverable',
    find: '  const degradedBelow = d.degradedBelow ?? 0.5;',
    replace: '  const degradedBelow = d.degradedBelow ?? 0;',
  },
  {
    id: 'throughput-thin-baseline-passes',
    suite: 'check:throughput',
    file: 'lib/trustshell/throughput/ledger.ts',
    protects:
      'too little history is NOT_CHECKED, never OK — two outcomes would collapse ' +
      '"we could not judge" into "it passed", which is this repo\'s defining defect',
    find: '  if (o.baselineDays < minDays || o.baseline <= 0) {',
    replace: '  if (false) {',
  },
  {
    id: 'throughput-off-but-spending-goes-quiet',
    suite: 'check:throughput',
    file: 'lib/trustshell/throughput/ledger.ts',
    protects:
      'a producer declared off but still writing rows is LOUD — it is spend nobody ' +
      'budgeted, and it is the case least likely to be noticed because nobody ' +
      'inspects things they believe are switched off',
    find: '    if (producing) {\n      return out(\n        \'UNDECLARED_ACTIVITY\',',
    replace: '    if (false) {\n      return out(\n        \'UNDECLARED_ACTIVITY\',',
  },
  {
    id: 'throughput-expired-pause-stays-quiet',
    suite: 'check:throughput',
    file: 'lib/trustshell/throughput/ledger.ts',
    protects:
      'a cost pause past its review date is LOUD — without an expiry, "off for a week ' +
      'to save money" silently becomes a year, which is the drift this ledger exists ' +
      'to make impossible',
    find: "      if (Date.parse(d.reviewBy) < Date.parse(now)) {",
    replace: '      if (false) {',
  },
  // -------------------------------------------------------------------------
  // lib/trustshell/repid-scoring.ts — the gate that could not open
  //
  // These three modules had ad-hoc mutation runs during the 2026-08-16 build
  // and were then NOT registered here, so `npm run mutate` was green over a set
  // that excluded every line of them. That is this repo's defining defect
  // wearing the mutation gate's own clothes: a green badge for work it never
  // examined. Registering them is what makes those runs repeatable rather than
  // shell history — the same reason mutate.mjs itself exists.
  //
  // Each entry below restores an ACTUAL defect that shipped, one at a time.
  // -------------------------------------------------------------------------
  {
    id: 'repid-tier-ladder-exclusive',
    suite: 'check:repid-scoring',
    file: 'lib/trustshell/repid-scoring.ts',
    protects:
      'ONE tier ladder, with inclusive floors. KYAValidator used `>` and RepIDConfig used ' +
      '`>=` over the same thresholds, so at exactly 2500/5000/7500 the two disagreed about ' +
      'the tier — and the tier decides the spending limits',
    find: '    if (score >= floor) return tier;',
    replace: '    if (score > floor) return tier;',
  },
  {
    id: 'floor-decay-skips-the-demonstrated-level',
    suite: 'check:repid-floor-decay',
    file: 'lib/trustshell/repid-floor-decay.ts',
    protects:
      'INVARIANT 3 — a decayed floor never falls below the level the agent is CURRENTLY ' +
      'demonstrating. Decay removes a claim the agent has stopped supporting; it must not ' +
      'contradict one it is supporting right now. Without the stop, a multi-step evaluation ' +
      'walks an active agent all the way to PROBATIONARY',
    find: '    if (next <= dbTierFloorFor(state.currentRepid)) {',
    replace: '    if (next < 0) {',
  },
  {
    id: 'floor-decay-expires-an-active-agent',
    suite: 'check:repid-floor-decay',
    file: 'lib/trustshell/repid-floor-decay.ts',
    protects:
      'the demonstrated-level check is asked BEFORE the clock. An agent scoring at or above ' +
      'its floor is demonstrating that level NOW, whatever a timestamp says — ask the clock ' +
      'first and a live, active agent is decayed for having a stale column',
    find: '  if (state.currentRepid >= state.floor) {',
    replace: '  if (state.currentRepid > state.peakRepid) {',
  },
  {
    id: 'floor-decay-unknown-age-reads-as-sound',
    suite: 'check:repid-floor-decay',
    file: 'lib/trustshell/repid-floor-decay.ts',
    protects:
      'an absent last-demonstration is NOT_CHECKED, not holds. It is the most likely input in ' +
      'production — most rows carry no such timestamp — and reporting holds says a floor was ' +
      'examined and found sound when it was never examined at all. The two-outcome mistake in ' +
      'the reassuring direction, on the mechanism that governs standing',
    find: "      kind: 'not_checked',",
    replace: "      kind: 'holds',",
  },
  {
    id: 'floor-decay-steps-by-a-point-not-a-tier',
    suite: 'check:repid-floor-decay',
    file: 'lib/trustshell/repid-floor-decay.ts',
    protects:
      'INVARIANT 2 — decay steps by TIER, never continuously. A floor at 7,999 is not a fact ' +
      'anyone can act on, and a continuously drifting floor is unobservable between reads. ' +
      'One tier boundary at a time is the granularity the ladder already uses',
    find: '  return below.length === 0 ? 0 : Math.max(...below.map((t) => t.floor));',
    replace: '  return Math.max(0, floor - 100);',
  },
  {
    id: 'ceiling-rewritten-by-reputation-update',
    suite: 'check:ceiling-source',
    file: 'lib/trustshell/KYAValidator.ts',
    protects:
      'TRUST THE ROW — a reputation update writes the SCORE and never the ceiling. Restoring ' +
      'the ladder-derived write is the measured x50: one compliant payment moved TORCH from ' +
      '10,000 to 500,000 USDC daily, and because the delta is signed a PENALTY did the same, ' +
      'with 5,100 points of headroom before the limit fell',
    find: '        repid_score:           newScore,',
    replace: '        repid_score:           newScore,\n        spending_limit_daily:  500000,',
  },
  {
    id: 'ceiling-read-derived-not-stored',
    suite: 'check:ceiling-source',
    file: 'lib/trustshell/KYAValidator.ts',
    protects:
      'the ENFORCED per-tx ceiling is read from the stored row. Trust-the-row has two halves ' +
      'and this is the one a careless fix drops: stop writing the column but also stop reading ' +
      'it, and nothing enforces anything. Reading the daily column here still type-checks and ' +
      'still looks like a limit',
    find: '      spendingLimitPerTx:   data.spending_limit_per_tx,',
    replace: '      spendingLimitPerTx:   data.spending_limit_daily,',
  },
  {
    id: 'dashboard-derives-tier-from-score',
    suite: 'check:ceiling-source',
    file: 'app/api/trustrails/system-trust/route.ts',
    protects:
      'the published tier distribution is the STORED tier, which labels the enforced ceiling. ' +
      'Deriving it from the score publishes a tier the enforcer does not use — the ' +
      'reviewer-vs-enforcer split closed on the payment path, reopened on a dashboard, and it ' +
      'disagrees on 9 of the 12 live rows',
    find: '  agents.forEach(a => { tiers[a.repid_tier as keyof typeof tiers]++; });',
    replace:
      '  agents.forEach(a => { tiers[tierForScore(a.repid_score) as keyof typeof tiers]++; });',
  },
  {
    id: 'pay-brief-ceiling-optional',
    suite: 'check:pay-brief',
    file: 'lib/trustshell/types.ts',
    protects:
      'enforcedPerTxLimit stays REQUIRED on KYAComplianceResult. Required is what makes tsc — ' +
      'not a grep — guarantee every return path in validate() sets it; make it optional and a ' +
      'future branch omits it silently, which is exactly how `withinDailyLimit: true` came to be ' +
      'asserted on a path that never read the spend history',
    find: '  enforcedPerTxLimit: number | null;',
    replace: '  enforcedPerTxLimit?: number | null;',
  },
  {
    id: 'pay-brief-exports-the-wrong-limit',
    suite: 'check:pay-brief',
    file: 'lib/trustshell/KYAValidator.ts',
    protects:
      'the exported ceiling is the field checkPerTxLimit actually measured against. Exporting ' +
      'spendingLimitDaily instead still type-checks and still looks like a limit — it briefs the ' +
      'authorization panel with a number 20x the enforced one for the live rows, which is the ' +
      'wrong-brief defect this whole change removes, reintroduced one identifier over',
    find: '      withinTxLimit:     true,\n      enforcedPerTxLimit: profile.spendingLimitPerTx,',
    replace: '      withinTxLimit:     true,\n      enforcedPerTxLimit: profile.spendingLimitDaily,',
  },
  {
    id: 'pay-brief-unevaluated-ceiling-approves',
    suite: 'check:pay-brief',
    file: 'app/api/trustrails/pay/route.ts',
    protects:
      'a per-tx ceiling that was never evaluated DENIES. A guard that reports authorized:true ' +
      'on an unevaluated limit is the two-outcome fail-open this repo keeps removing — "we did ' +
      'not look" scored as "it passed", on the payment path',
    find: '        authorized: false,',
    replace: '        authorized: true,',
  },

  // -------------------------------------------------------------------------
  // app/api/trustrails/pay/route.ts — ControlProof shadows the payment gate,
  // NEXT.md Tier 1 §1 / SPRINT-DECISIONS-2026-08-17.md P2
  // -------------------------------------------------------------------------
  {
    id: 'pay-shadow-drops-controlproof',
    suite: 'check:pay-custody-shadow',
    file: 'app/api/trustrails/pay/route.ts',
    protects:
      'controlProof is actually accepted on the request. Silently dropping it from the ' +
      'destructure would make every caller-supplied proof vanish before it ever reaches the ' +
      'shadow comparison, and the route would still 200 — the exact "looks wired, isn\'t reachable" ' +
      'shape this repo keeps finding in its own barrel exports, one layer down',
    // Re-pointed 2026-08-19. Request signing needs the RAW bytes — `req.json()`
    // consumes the stream, and a signature over a re-serialised object verifies a
    // different string than the caller signed. The route reads `req.text()` once
    // and parses it, so this find string stopped matching. CI reported DRIFT,
    // which is the outcome working: the code moved and the manifest did not.
    find:
      '  const { agentName, amountUSDC, recipientAddress, purpose, signatures, controlProof } =\n' +
      '    JSON.parse(rawBody);',
    replace:
      '  const { agentName, amountUSDC, recipientAddress, purpose, signatures } =\n' +
      '    JSON.parse(rawBody);',
  },
  {
    id: 'pay-shadow-wrong-audience',
    suite: 'check:pay-custody-shadow',
    file: 'app/api/trustrails/pay/route.ts',
    protects:
      'the payment shadow is built with PAY_AUDIENCE, not VAULT_AUDIENCE. A copy-paste from ' +
      'VaultPermission.ts that kept the vault constant would silently reject every real payment ' +
      'ControlProof (minted for trinity:pay) as wrong-audience, making every observation read ' +
      'shadow_stricter regardless of what the proof actually authorized — a permanent false ' +
      'signal that adoption has begun disagreeing when it has not begun being measured at all',
    find: 'new CustodyShadow(() => getSupabaseAdmin(), undefined, PAY_AUDIENCE, PAY_CAPABILITY, PAY_ACTION);',
    replace: 'new CustodyShadow(() => getSupabaseAdmin(), undefined, VAULT_AUDIENCE, PAY_CAPABILITY, PAY_ACTION);',
  },
  {
    id: 'pay-shadow-becomes-the-gate',
    suite: 'check:pay-custody-shadow',
    file: 'app/api/trustrails/pay/route.ts',
    protects:
      'THE LOAD-BEARING ONE. The observation is never captured into a variable, so nothing ' +
      'downstream can branch on it — capturing it is the first step toward "the shadow decides", ' +
      'which is the exact failure CustodyShadow.ts\'s own docstring exists to prevent: switching a ' +
      'live gate on the strength of a finding is how you lock five agents out of their vaults at ' +
      '3am, and this mutation is what that looks like one line before it ships',
    find: '    await custodyShadow.observe({',
    replace: '    const shadowResult = await custodyShadow.observe({',
  },
  {
    id: 'custody-shadow-default-audience-drifts',
    suite: 'check:custody-shadow',
    file: 'lib/trustshell/CustodyShadow.ts',
    protects:
      'the generalised constructor still defaults `audience` to VAULT_AUDIENCE. Generalising a ' +
      'single-purpose class into a parameterised one (2026-08-17, for the payment shadow) is ' +
      'exactly the change that can silently move every pre-existing call site\'s behaviour — ' +
      'VaultPermission.ts and 13 assertions in this suite construct CustodyShadow with NO audience ' +
      'argument and rely entirely on the default staying VAULT_AUDIENCE',
    find: 'private readonly audience: string = VAULT_AUDIENCE,',
    replace: 'private readonly audience: string = PAY_AUDIENCE,',
  },
  {
    id: 'repid-drift-headroom-from-stored-tier',
    suite: 'check:repid-registry-drift',
    file: 'lib/trustshell/repid-scoring.ts',
    protects:
      'penaltyHeadroom is measured from the LOWEST floor that still sustains the stored ' +
      'limit, not from the stored tier\'s own floor. Anchoring on the wrong floor understates ' +
      'the headroom by a whole tier — TORCH\'s real 5,100 reported as 2,600, which is the ' +
      'error the first SQL pass at this actually made',
    find: '  const sustaining = ascending.find((t) => TIER_LIMITS[t.tier].daily >= storedDaily);',
    replace: '  const sustaining = ascending.find((t) => TIER_LIMITS[t.tier].daily > storedDaily);',
  },
  {
    id: 'repid-drift-unreadable-score-agrees',
    suite: 'check:repid-registry-drift',
    file: 'lib/trustshell/repid-scoring.ts',
    protects:
      'an unreadable score is NOT_CHECKED. `tierForScore` answers Bronze for a non-finite ' +
      'score — correct for a gate — so without this guard a garbage score silently AGREES ' +
      'with any row storing Bronze, and the drift report asserts a comparison it never made',
    find: "  if (typeof storedScore !== 'number' || !Number.isFinite(storedScore)) {",
    replace: "  if (typeof storedScore !== 'number') {",
  },
  {
    id: 'repid-drift-limit-mismatch-ignored',
    suite: 'check:repid-registry-drift',
    file: 'lib/trustshell/repid-scoring.ts',
    protects:
      'the stored TIER and the stored LIMIT are separate columns and either can drift. ' +
      '`validate()` enforces the NUMBER, so a row carrying the right word and the wrong ' +
      'number is the dangerous half — dropping this check passes it as agreement',
    find: '  const limitAgrees = storedDaily === ladderDaily;',
    replace: '  const limitAgrees = true;',
  },
  {
    id: 'repid-coherence-never-fails',
    suite: 'check:repid-scoring',
    file: 'lib/trustshell/repid-scoring.ts',
    protects:
      'a gate above the reachable ceiling is FAILED. This is the one arithmetic call that ' +
      'would have caught the original finding on day one — a score whose maximum was 4008 ' +
      'against a payment threshold of 5000, so the payment path was dead for everyone, ' +
      'permanently, while the code was correct and the numbers looked plausible',
    find: '    .filter((g) => g.floor > ceiling)',
    replace: '    .filter(() => false)',
  },
  {
    id: 'repid-negative-weight-allowed',
    suite: 'check:repid-scoring',
    file: 'lib/trustshell/repid-scoring.ts',
    protects:
      'a negative weight is refused. It still lets the set sum to 1.0, so the sum check ' +
      'alone passes it, while the metric it weights now RAISES the score by getting worse',
    find: "    if (value < 0) return `weight '${key}' is negative",
    replace: "    if (false) return `weight '${key}' is negative",
  },
  {
    id: 'repid-weight-sum-unchecked',
    suite: 'check:repid-scoring',
    file: 'lib/trustshell/repid-scoring.ts',
    protects:
      "weights are validated ON READ, not only on write. The score's whole range depends on " +
      'them summing to 1; weights summing to 5 make the weighted sum reach 5.0, which is ' +
      'the one way an agent clears a tier the honest maximum cannot',
    find: '  if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {',
    replace: '  if (false) {',
  },
  {
    id: 'repid-normalize-unbounded-above',
    suite: 'check:repid-scoring',
    file: 'lib/trustshell/repid-scoring.ts',
    protects:
      'normalization clamps at BOTH ends. The original clamped at 0 only, so an accuracy ' +
      'recorded as 150% — or a negative latency — pushed a component past 1 and the ' +
      'weighted sum past its own supposed maximum',
    find: '  return Math.min(1, Math.max(0, value));',
    replace: '  return Math.max(0, value);',
  },
  {
    id: 'repid-unreadable-spend-passes',
    suite: 'check:repid-scoring',
    file: 'lib/trustshell/repid-scoring.ts',
    protects:
      'an UNREADABLE spend history is NOT_CHECKED, never within-limit. getDailySpend ' +
      'discarded the query error and returned 0 — indistinguishable from "has spent ' +
      'nothing" — so the daily-limit check PASSED and a database outage granted the full ' +
      'daily allowance. Absent is not zero, in the place where it costs money',
    find:
      "      outcome: 'NOT_CHECKED',\n      withinLimit: null,\n      detail:\n" +
      "        'the daily spend history could not be read",
    replace:
      "      outcome: 'VERIFIED',\n      withinLimit: true,\n      detail:\n" +
      "        'the daily spend history could not be read",
  },
  {
    id: 'repid-pertx-limit-exclusive',
    suite: 'check:repid-scoring',
    file: 'lib/trustshell/repid-scoring.ts',
    protects:
      'the per-tx limit is INCLUSIVE — an amount exactly equal to the limit is within it. ' +
      'A limit is the most you may spend, not the least you may not. A `<` vs `<=` boundary ' +
      'has been the defect four separate times in this branch alone',
    find: '  if (amountUSDC > limit) {',
    replace: '  if (amountUSDC >= limit) {',
  },
  {
    id: 'repid-denial-wording-drifts',
    suite: 'check:repid-scoring',
    file: 'lib/trustshell/repid-scoring.ts',
    protects:
      'the denial reason is an OBSERVABLE CONTRACT, not prose. It lands in a compliance ' +
      "receipt's `denialReason`, and run-e2e.mjs matches /exceeds per-tx limit/i against it " +
      'over HTTP. Rewording it to read better turned CI red while `npm run check` reported ' +
      '52 VERIFIED — LESSONS A24. The fast suite pins the regex so the next break surfaces ' +
      'in seconds instead of in a server boot',
    find: '      detail: `Amount ${amountUSDC} USDC exceeds per-tx limit ${limit}`,',
    replace: '      detail: `Amount ${amountUSDC} USDC exceeds the per-transaction limit of ${limit}`,',
  },
  {
    id: 'repid-placeholder-proof-accepted',
    suite: 'check:repid-scoring',
    file: 'lib/trustshell/repid-scoring.ts',
    protects:
      'a manufactured proof id is recognised as absent. `ZKP_STUB_<agent>_VERIFIED` is ' +
      'non-empty, truthy, and contains the word VERIFIED, so every consumer testing for ' +
      'presence saw a proof that does not exist. A placeholder that reads as its own ' +
      'success is worse than no placeholder',
    find: '  return /^ZKP_STUB_/.test(cid.trim());',
    replace: '  return false;',
  },
  {
    id: 'repid-stored-zero-becomes-default',
    suite: 'check:repid-scoring',
    file: 'lib/trustshell/repid-scoring.ts',
    protects:
      'a stored threshold of ZERO is a configured policy — "no RepID minimum" — not an ' +
      'absent value. `|| 5000` rewrote it to the second-strictest gate in the ladder, and ' +
      'because coherence() used `??` while calculate() used `||`, the check written to ' +
      'catch a gate that never opens was reporting on a number the gate did not use',
    find: '  if (stored === undefined || stored === null) {',
    replace: '  if (!stored) {',
  },
  {
    id: 'repid-unreadable-threshold-defaults',
    suite: 'check:repid-scoring',
    file: 'lib/trustshell/repid-scoring.ts',
    protects:
      'an UNREADABLE institution config is NOT_CHECKED. Substituting the default re-rates ' +
      'every agent against a number nobody configured, and for an institution that stored ' +
      'a stricter threshold it LOWERS the bar — a fail-open on the payment gate reached by ' +
      'an outage rather than by any input',
    find: '  if (!readable) {',
    replace: '  if (!readable && false) {',
  },
  {
    id: 'repid-malformed-threshold-passes',
    suite: 'check:repid-scoring',
    file: 'lib/trustshell/repid-scoring.ts',
    protects:
      'a NON-FINITE stored threshold is refused rather than passed through. NaN compares ' +
      'false against everything, so it neither meets nor fails a gate — it just silently ' +
      'denies, and nothing says why',
    find: "  if (typeof stored !== 'number' || !Number.isFinite(stored) || stored < 0) {",
    replace: "  if (typeof stored !== 'number') {",
  },
  {
    id: 'repid-coherence-accepts-nonfinite',
    suite: 'check:repid-scoring',
    file: 'lib/trustshell/repid-scoring.ts',
    protects:
      'describeCoherence REFUSES a threshold it cannot compare. The unreachability test is ' +
      '`floor > ceiling` and every comparison against NaN is false, so a garbage threshold ' +
      'was never reported unreachable and fell through to "every gate is reachable" — a ' +
      'coherence check that cannot tell "I compared them" from "I could not"',
    find: '  if (typeof paymentThreshold !== \'number\' || !Number.isFinite(paymentThreshold)) {',
    replace: '  if (false) {',
  },

  // -------------------------------------------------------------------------
  // lib/trustshell/hal-chain.ts — 102,934 links, not one ever verified
  // -------------------------------------------------------------------------
  {
    id: 'hal-partial-chain-reads-verified',
    suite: 'check:hal-chain',
    file: 'lib/trustshell/hal-chain.ts',
    protects:
      'a PARTIALLY verified chain is not a verified one. Some links recomputed and the rest ' +
      'unchecked is NOT_CHECKED — collapsing it to VERIFIED is the two-outcome defect this ' +
      'file exists to close',
    find: "    outcome: linksNotChecked > 0 ? 'NOT_CHECKED' : 'VERIFIED',",
    replace: "    outcome: 'VERIFIED',",
  },
  {
    id: 'hal-verified-unreachable',
    suite: 'check:hal-chain',
    file: 'lib/trustshell/hal-chain.ts',
    protects:
      "VERIFIED is REACHABLE. The window's first entry points at a predecessor outside the " +
      'window — a boundary, not a gap. Counting it as unchecked made VERIFIED impossible, ' +
      'since every window has exactly one: the same never-opening-gate defect found in the ' +
      'RepID curve three hours earlier, reappearing inside the verifier written to catch it',
    find: '      windowStartUnverifiable = true;\n      continue;',
    replace: '      windowStartUnverifiable = true;\n      linksNotChecked += 1;\n      continue;',
  },
  {
    id: 'hal-proven-genesis-counted-as-gap',
    suite: 'check:hal-chain',
    file: 'lib/trustshell/hal-chain.ts',
    protects:
      'a proven pre-cutover genesis (null link, dated before chaining began) is NOT a gap. ' +
      'There is no predecessor to recompute — the row\'s own timestamp is the proof — so ' +
      'counting it as unchecked caps EVERY genesis-anchored chain at NOT_CHECKED regardless ' +
      'of how many real links past it match, which was the other half of HAL-001: not just ' +
      'that an unanchored VERIFIED was reachable, but that an anchored one was NOT.',
    find: '      // how many real links past it all matched — the defect HAL-001 closes.\n      continue;',
    replace: '      // how many real links past it all matched — the defect HAL-001 closes.\n      linksNotChecked += 1;\n      continue;',
  },
  {
    id: 'hal-unanchored-window-reads-verified',
    suite: 'check:hal-chain',
    file: 'lib/trustshell/hal-chain.ts',
    protects:
      'HAL-001. A window whose first entry points at a predecessor OUTSIDE it must not read ' +
      'VERIFIED, however cleanly every link inside it matches — that shape is indistinguishable ' +
      'from a truncation attack (delete the head, the tail is still internally consistent). ' +
      'An exhaustive search on 2026-08-16 found this was the ONLY shape of input that could ' +
      'ever reach VERIFIED, meaning every VERIFIED the function emitted was over an unanchorable ' +
      'window. Removing this gate reintroduces exactly that, on real production rows: ' +
      'LIVE_RUN_2026_08_17 shows the identical chained-tail input flip back to VERIFIED.',
    find: '  if (windowStartUnverifiable) {',
    replace: '  if (false && windowStartUnverifiable) {',
  },
  {
    id: 'hal-break-after-cutover-ignored',
    suite: 'check:hal-chain',
    file: 'lib/trustshell/hal-chain.ts',
    protects:
      'a null link AFTER the cutover is a BREAK, not adoption. Without the boundary the ' +
      'verifier cannot tell 44,769 legitimate pre-chaining rows from a live chain losing a ' +
      'link — and a check that reports 44,769 defects is a check that gets switched off. ' +
      'Re-pointed 2026-08-17 (HAL-001): the null-link branch now also distinguishes an ' +
      'unparseable created_at from a proven pre-cutover one, which split this single ' +
      'condition into an if/else — the invariant this mutation protects did not change.',
    find: '      } else if (at >= cutover) {',
    replace: '      } else if (false) {',
  },
  {
    id: 'hal-fork-ignored',
    suite: 'check:hal-chain',
    file: 'lib/trustshell/hal-chain.ts',
    protects:
      'two entries claiming the same predecessor is a FORK. All 102,934 live links were ' +
      'measured distinct; the assertion that says so has to be able to fail',
    find: '    if (firstSeenAt !== undefined) {',
    replace: '    if (false) {',
  },
  {
    id: 'hal-throwing-hasher-counts-as-match',
    suite: 'check:hal-chain',
    file: 'lib/trustshell/hal-chain.ts',
    protects:
      'a hasher that THREW has not told us the link is right. Scoring an exception as a ' +
      'verified link is the credential-check-green-with-no-credential shape, one layer down',
    find:
      '    } catch {\n      // A hasher that threw has not told us the link is wrong.\n' +
      '      linksNotChecked += 1;\n      continue;\n    }',
    replace: '    } catch {\n      linksVerified += 1;\n      continue;\n    }',
  },

  // -------------------------------------------------------------------------
  // lib/trustshell/receipt-audit.ts — the audit hash anyone could forge
  // -------------------------------------------------------------------------
  {
    id: 'receipt-secret-falls-back',
    suite: 'check:receipt-audit',
    file: 'lib/trustshell/receipt-audit.ts',
    protects:
      'a MISSING HMAC secret refuses to mint. The old code fell back to a constant printed ' +
      'in the source with TRUSTRAILS_HMAC_SECRET unset, so every audit hash was forgeable ' +
      'by anyone holding the repo — tamper-evident to nobody, and indistinguishable from ' +
      'success at every layer above',
    find: '  const secret = env.TRUSTRAILS_HMAC_SECRET;',
    replace: "  const secret = env.TRUSTRAILS_HMAC_SECRET || 'a-quietly-reintroduced-fallback';",
  },
  {
    id: 'receipt-abandoned-default-accepted',
    suite: 'check:receipt-audit',
    file: 'lib/trustshell/receipt-audit.ts',
    protects:
      'the abandoned default is refused BY NAME. It is 26 characters, so it clears the ' +
      'length rule, and the most likely way this weakness returns is somebody "fixing" the ' +
      'missing variable by pasting the constant the old fallback used',
    find: '  if (isAbandonedDefaultSecret(secret)) {',
    replace: '  if (false) {',
  },
  {
    id: 'receipt-short-secret-accepted',
    suite: 'check:receipt-audit',
    file: 'lib/trustshell/receipt-audit.ts',
    protects:
      'a SHORT secret is refused. A one-character key yields a perfectly valid-looking ' +
      'HMAC, so length is the only thing standing between "configured" and "configured ' +
      'badly", and neither is visible in the output',
    // NOT `if (false)`. That made the block unreachable, and TypeScript stops
    // applying control-flow narrowing inside unreachable code — so `secret`
    // reverted to `string | undefined` and the mutant failed to COMPILE. An
    // uncompilable mutant is not evidence (PRIOR-WORK-INDEX rule 4); the runner
    // scored it INVALID rather than CAUGHT, which is the whole reason that
    // fourth outcome exists. Weakening the bound keeps a valid program.
    find: '  if (secret.trim().length < MIN_AUDIT_SECRET_LENGTH) {',
    replace: '  if (secret.trim().length < 0) {',
  },
  {
    id: 'receipt-secret-silently-trimmed',
    suite: 'check:receipt-audit',
    file: 'lib/trustshell/receipt-audit.ts',
    protects:
      'the secret is returned VERBATIM. Trimming for the length check is not the same as ' +
      'trimming the key — silently altering a secret produces audit hashes nobody else can ' +
      'reproduce, which reads downstream as tampering',
    find: '  return secret;\n}',
    replace: '  return secret.trim();\n}',
  },
  {
    id: 'receipt-txhash-sentinel-returns',
    suite: 'check:receipt-audit',
    file: 'lib/trustshell/receipt-audit.ts',
    protects:
      'an ABSENT tx hash is not the string "no_tx". The old sentinel encoding gave a payment ' +
      'that was never broadcast and one whose tx hash IS "no_tx" byte-identical preimages — ' +
      'one audit hash over two materially different receipts. An audit hash that is not ' +
      'injective over its inputs does not bind them',
    find: '    JSON.stringify(input.solanaTxHash),',
    replace: "    input.solanaTxHash ?? 'no_tx',",
  },
  {
    id: 'receipt-domain-tag-dropped',
    suite: 'check:receipt-audit',
    file: 'lib/trustshell/receipt-audit.ts',
    protects:
      'the domain tag leads the preimage, so the payment and HAL preimage spaces cannot ' +
      'collide and one audit hash cannot come to cover two different kinds of event. ' +
      'RE-POINTED 2026-08-29: the field list moved into the shared `paymentPreimage` ' +
      'helper when the commitment preimage stopped being a second copy of it, so the tag ' +
      'is now a parameter. The invariant is unchanged and this mutation now covers BOTH ' +
      'the audit and the commitment preimage, which is stronger than what it replaced',
    find: '    JSON.stringify(domain),',
    replace: "    '',",
  },

  // -------------------------------------------------------------------------
  // lib/trustshell/schema/decoys.ts — from #53 on main. 623 tables, 501 empty,
  // and seven empties named almost exactly like the table that matters.
  // -------------------------------------------------------------------------
  {
    id: 'decoy-matcher-never-fires',
    suite: 'check:schema-names',
    file: 'lib/trustshell/schema/decoys.ts',
    protects:
      'a real query against an empty decoy table is caught. A query against an empty ' +
      'table returns [] with no error, so it reads as "the data does not exist" rather ' +
      'than "I asked the wrong table" — the exact confusion recorded in LESSONS.md',
    find: '  return tableUsagePatterns(table).some((re) => re.test(line));',
    replace: '  return false;',
  },
  {
    id: 'decoy-matcher-flags-prose',
    suite: 'check:schema-names',
    file: 'lib/trustshell/schema/decoys.ts',
    protects:
      'prose is NOT flagged, only queries. Every current mention of a decoy in this repo ' +
      'is documentation ABOUT the problem; failing those would force someone to delete ' +
      'the record of a correction in order to get a green build',
    find: '  return tableUsagePatterns(table).some((re) => re.test(line));',
    replace: '  return line.includes(table);',
  },

  // -------------------------------------------------------------------------
  // From #52 on main. The spine reachability pair and the silent-empty guard.
  // -------------------------------------------------------------------------
  {
    id: 'spine-unreachable-from-barrel',
    suite: 'check:spine-reachable',
    // Re-pointed 2026-08-19: the barrel split in two, and the spine exports moved
    // to `portable.ts` (they carry no host dependency). CI reported this as DRIFT
    // — find string occurs 0 times — which is the outcome doing exactly its job:
    // the code moved and the manifest did not. The invariant is unchanged.
    file: 'lib/trustshell/portable.ts',
    protects:
      'the spine stays REACHABLE. Every module below was correct, mutation-tested and ' +
      'green while being importable by nobody — measured 2026-08-16, 0 of 10 exported ' +
      'from the barrel. No unit suite can see this, because a test imports by path, ' +
      'which is exactly the access a real consumer does not have',
    find:
      "export { analyseReadOnly, delegateAuditorGrant } from './identity/auditor-grant';\n" +
      'export type {\n' +
      '  ToolCapabilityMap,\n' +
      '  ToolEffect as GrantToolEffect,\n' +
      '  ToolEffectMap,\n' +
      '  WriteReach,\n' +
      '  ReadOnlyAnalysis,\n' +
      '  AuditorGrantInput,\n' +
      '  AuditorGrant,\n' +
      "} from './identity/auditor-grant';",
    replace: '// MUTANT: auditor-grant dropped from the barrel',
  },
  {
    id: 'spine-substitutes-a-checker-it-can-sign-as',
    suite: 'check:spine-reachable',
    file: 'lib/trustshell/identity/spine.ts',
    protects:
      'a drawn checker this harness cannot act as is REFUSED, never substituted. The ' +
      'tempting repair — fall back to a key we do hold — is checker-shopping arriving ' +
      'as error handling, and this mutant signs the verdict with the DOER\'s own key, ' +
      'which every signature check downstream would still call valid',
    find: 'const checkerKey = checkerKeyFor(assigned.unsigned.checkerDid);',
    replace: 'const checkerKey = checkerKeyFor(assigned.unsigned.checkerDid) ?? doerKey;',
  },
  {
    id: 'promotion-counts-a-run-against-another-artifact',
    suite: 'check:promotion-evidence',
    file: 'lib/trustshell/promotion.ts',
    protects:
      'A18, mechanised. A real gate, a real pass, the wrong subject — three commits once sat ' +
      'with `npm run check` never having run against them, behind a green tick belonging to ' +
      "Vercel's preview-comments check. The mutant counts any green run, so a stale one " +
      'promotes a surface to live. The filter on `ranAgainst` is the only thing standing ' +
      'between a status table and that tick',
    find: '  return claim.runs.filter((r) => r.gate.length > 0 && r.ranAgainst === claim.artifact);',
    replace: '  return claim.runs.filter((r) => r.gate.length > 0);',
  },
  {
    id: 'promotion-turns-absence-into-a-posture',
    suite: 'check:promotion-evidence',
    file: 'lib/trustshell/promotion.ts',
    protects:
      'an unmeasured surface returns NULL, rendered as NOT CHECKED — it does not get the ' +
      'lowest good-looking row. `observe` is a deliberate posture (it ran, it does not gate); ' +
      'silently assigning it to a surface nobody measured is the table-shaped version of the ' +
      'two-outcome collapse',
    find: '  if (runs.length === 0) return null;',
    replace: "  if (runs.length === 0) return 'observe';",
  },
  {
    id: 'bft-outage-claims-the-vote-happened',
    suite: 'check:payment-fail-posture',
    file: 'lib/trustshell/BFTAuthorizer.ts',
    protects:
      'a provider outage is recorded as NOT EVALUATED, never as an evaluated verdict. The ' +
      'payment proceeds either way — that is the deliberate fail-open — so `evaluated` is the ' +
      'ONLY thing distinguishing "three providers authorised this" from "nobody voted". ' +
      'Flipping it makes an unchecked payment indistinguishable from a consensus-authorised one',
    find: `        votedAt: new Date().toISOString(),
        evaluated: false,
        notEvaluatedReason: \`BFT engine unavailable: \${message}\`,`,
    replace: `        votedAt: new Date().toISOString(),
        evaluated: true,
        notEvaluatedReason: \`BFT engine unavailable: \${message}\`,`,
  },
  {
    id: 'bft-observe-invents-a-consensus-weight',
    suite: 'check:payment-fail-posture',
    file: 'lib/trustshell/BFTAuthorizer.ts',
    protects:
      'observe mode reports NO consensus weight, because it held no vote. This is the exact ' +
      'defect BFTAuthorizer replaced — a placeholder returning passed:true with a weight of ' +
      '1.0, which is why all 12 rows in kya_compliance_receipts claim BFT consensus. A number ' +
      'here is worse than a null: it is auditable-looking',
    find: `        consensusWeight: null,
        threshold: 0.618033988749895,
        passed: true, // not blocked`,
    replace: `        consensusWeight: 1.0,
        threshold: 0.618033988749895,
        passed: true, // not blocked`,
  },
  {
    id: 'bft-enforcement-default-flips',
    suite: 'check:payment-fail-posture',
    file: 'lib/trustshell/BFTAuthorizer.ts',
    protects:
      'enforcement is OFF unless the exact word `enforce` is set. The default decides whether ' +
      'every transfer waits on three third-party models, and the Comma veto fires on unanimous ' +
      'high confidence — so a routine payment may be escalated at a rate nobody has measured ' +
      'yet. Flipping the default chooses a refusal rate blind',
    find: "  return process.env.BFT_ENFORCEMENT_MODE === 'enforce' ? 'enforce' : 'observe';",
    replace: "  return process.env.BFT_ENFORCEMENT_MODE === 'observe' ? 'observe' : 'enforce';",
  },
  {
    id: 'sign-out-claims-success-it-did-not-earn',
    suite: 'check:auth-session',
    file: 'lib/auth-session.ts',
    protects:
      'a FAILED sign-out keeps you signed IN. This is the defect the module was extracted ' +
      'for: the component discarded the result and cleared the UI unconditionally, so the ' +
      'reassuring reading was the false one. Someone on a shared machine who reads ' +
      '"signed out" and walks away is the case it protects',
    find: `    return {
      ...current,
      error: \`Sign-out failed, you are still signed in: \${result.error.message}\`,
    };`,
    replace: '    return { ...SIGNED_OUT, error: result.error.message };',
  },
  {
    id: 'session-probe-hides-a-broken-deployment',
    suite: 'check:auth-session',
    file: 'lib/auth-session.ts',
    protects:
      'a THROWN session probe is not a signed-out user. A missing or misconfigured Supabase ' +
      'key throws here, and dropping the error renders a login form that cannot possibly ' +
      'work with nothing said — a broken deployment made to look like an ordinary session end',
    find: `  if (result.error) {
    return { status: 'idle', email: null, error: result.error.message };
  }
  const email = result.data?.session?.user?.email ?? null;`,
    replace: '  const email = result.data?.session?.user?.email ?? null;',
  },
  {
    id: 'safely-signed-out-becomes-the-naive-predicate',
    suite: 'check:auth-session',
    file: 'lib/auth-session.ts',
    protects:
      "`isSafelySignedOut` is not `status !== 'signed-in'`. The two differ exactly where it " +
      'matters — a failed sign-out, and a cleared view still carrying an error — which is ' +
      'why the predicate has a name instead of being inlined at a call site',
    find: "  return view.status === 'idle' && view.email === null && view.error === null;",
    replace: "  return view.status !== 'signed-in';",
  },
  {
    id: 'earned-metrics-shrinks-toward-the-fleet-mean',
    suite: 'check:hal-repid-linkage',
    file: 'lib/trustshell/EarnedMetrics.ts',
    protects:
      'the shrinkage target is ZERO, so absent evidence costs and never pays. Shrinking ' +
      'toward a population mean lets a brand-new agent inherit the fleet\'s earned ' +
      'reputation — the laundering vector the whole design exists to prevent — and this ' +
      'metric decides whether an agent may move money',
    find: 'export const PRIOR_VALUE = 0;',
    replace: 'export const PRIOR_VALUE = 0.5;',
  },
  {
    id: 'earned-metrics-drops-the-shrinkage',
    suite: 'check:hal-repid-linkage',
    file: 'lib/trustshell/EarnedMetrics.ts',
    protects:
      '`value` is the SHRUNK rate and `rawValue` the bare ratio. Without shrinkage a single ' +
      'flawless observation scores 1.0 and a cold-start agent reads as a veteran. The two ' +
      'also behave differently in time — rawValue is invariant, value decays toward the ' +
      'prior — so collapsing them makes a SQL-derived rate look like the production metric ' +
      'when it is not',
    find: '  const value = (successWeight + k * prior) / (weight + k);',
    replace: '  const value = successWeight / weight;',
  },
  {
    id: 'repid-saturation-band-goes-unfound',
    suite: 'check:repid-marginal',
    file: 'lib/trustshell/repid-scoring.ts',
    protects:
      'the scan finds the band where score has ALREADY reached REPID_MAX. With a strict `>` ' +
      'it never fires — the clamp means the score never exceeds the maximum, only equals it — ' +
      'so saturation reports at weightedSum 1 and the dead band measures zero. The defect ' +
      'would then be invisible in the very gate written to measure it',
    find: '    if (scoreFromWeightedSum(ws) >= REPID_MAX) {',
    replace: '    if (scoreFromWeightedSum(ws) > REPID_MAX) {',
  },
  {
    id: 'repid-overshoot-erased',
    suite: 'check:repid-marginal',
    file: 'lib/trustshell/repid-scoring.ts',
    protects:
      'the overshoot is REPORTED, because it is the cause. 57200/0.5 evaluates to 10072.42 at ' +
      'weightedSum 1 against a REPID_MAX of 10000, and those 72 points are what create the ' +
      'dead band. Zeroing it leaves the band visible with no explanation, which sends the ' +
      'next reader to reshape the logarithm — the one change that cannot fix it',
    find: '    overshoot: uncappedAtOne - REPID_MAX,',
    replace: '    overshoot: 0,',
  },
  {
    id: 'repid-marginal-ignores-the-clamp',
    suite: 'check:repid-marginal',
    file: 'lib/trustshell/repid-scoring.ts',
    protects:
      'marginal value is measured through the REAL scoring function, clamp included. The ' +
      'mutant computes the raw curve instead and reports 83.42 at weightedSum 0.99 where the ' +
      'module actually pays 11 — which is precisely the confusion this gate exists to settle: ' +
      'the curve is nearly flat, and the collapse at the top belongs to the clamp',
    find:
      '  const to = scoreFromWeightedSum(Math.min(1, weightedSum + delta));',
    replace:
      '  const to = SCORE_LOG_MULTIPLIER * Math.log10(1 + (weightedSum + delta) * SCORE_LOG_INPUT_SCALE);',
  },
  {
    id: 'zk-build-group-hashes-twice',
    suite: 'check:zk-cost',
    file: 'lib/trustshell/identity/nullifier.ts',
    protects:
      'a Merkle group over N leaves costs exactly N-1 hashes. Redundant hashing is invisible ' +
      'to every functional suite — the root still verifies — but in a circuit the constraint ' +
      'count is dominated by exactly this number, so doubling it doubles the proof',
    find: '      next.push(i + 1 < cur.length ? await scheme.hashPair(cur[i], cur[i + 1]) : cur[i]);',
    replace:
      '      next.push(i + 1 < cur.length ? await scheme.hashPair(await scheme.hashPair(cur[i], cur[i + 1]), cur[i]) : cur[i]);',
  },
  {
    id: 'earned-metrics-reads-observations-by-the-wrong-key',
    suite: 'check:observation-identity',
    file: 'lib/trustshell/EarnedMetricsRepo.ts',
    protects:
      'the identity space of the earned evidence. repid_agents carries `id` (uuid) AND `agent_id` ' +
      '(text), and v_agent_earned_observations joins the FORMER. Measured 2026-08-17 the two spaces ' +
      'are disjoint — agent_id is uuid-shaped on 0 of 176 rows — so the wrong key returns the EMPTY ' +
      'SET rather than raising, and all 152,473 observations vanish while every agent reads as ' +
      'having no track record. The mutant swaps the resolved uuid for the agent name, which is the ' +
      'exact shape of the ad-hoc census that produced two figures retracted the same day',
    find: `      .eq('agent_id', resolved.id)`,
    replace: `      .eq('agent_id', resolved.name)`,
  },
  {
    id: 'floor-decay-demotes-humans',
    suite: 'check:repid-floor-decay',
    file: 'lib/trustshell/repid-floor-decay.ts',
    protects:
      'the human exemption. 4 of the 12 ratcheted rows are human, and compute_tier already exempts ' +
      'is_human from the counterparty gate for the same reason: a human\'s standing is not earned ' +
      'through agent observations. The mutant applies an observation-driven decay to them, which ' +
      'demotes a human for not behaving like a bot',
    find: `  if (state.isHuman) {`,
    replace: `  if (false && state.isHuman) {`,
  },
  {
    id: 'floor-decay-asks-humans-a-question-it-cannot-answer',
    suite: 'check:repid-floor-decay',
    file: 'lib/trustshell/repid-floor-decay.ts',
    protects:
      'ORDER, which is where this rule actually binds. The mutant moves the human exemption BELOW ' +
      'the unknown-age branch. No column feeds `lastReEarnedAt`, so every production row arrives ' +
      'null and every human then returns not_checked forever — and an operator draining a ' +
      'NOT_CHECKED backlog would resolve it by inventing re-attestation timestamps for people. ' +
      'The mutant still decays nobody, so only the ordering assertion catches it',
    find: `  if (state.isHuman) {`,
    replace: `  if (state.isHuman && state.lastReEarnedAt !== null) {`,
  },
  {
    id: 'proof-result-claims-privacy-the-provider-does-not-have',
    suite: 'check:proof-provider-contract',
    file: 'lib/trustshell/identity/proof-provider.ts',
    protects:
      'a result may not claim more privacy than its provider has. The mutant sets witnessHidden ' +
      'true on a provider whose isZeroKnowledge is false — which is exactly the defect this seam ' +
      'was built after: a SHA-256 of a timestamp labelled groth16 and published on-chain. It is ' +
      'a one-word edit and it reads as an improvement',
    find: `      witnessHidden: false,
      predicateHolds,`,
    replace: `      witnessHidden: true,
      predicateHolds,`,
  },
  {
    id: 'issuer-stake-credits-a-lucky-unearned-veto',
    suite: 'check:issuer-stake',
    file: 'lib/trustshell/issuer-stake.ts',
    protects:
      'luck is UNBANKABLE. The mutant lets an unearned veto that happened to be right classify ' +
      'as a true positive, which is the single most tempting "improvement" to this model — it ' +
      'looks like rewarding accuracy. 46.3% of unearned vetoes were correct, so it would let an ' +
      'issuer buy standing with a good draw and the 41-veto behaviour would stay rational',
    find: `  if (!v.providerAttempted) return v.vetoed ? 'unearned_veto' : 'unearned_clean';`,
    replace: `  if (!v.providerAttempted) {
    if (v.vetoed && v.isHallucination) return 'earned_true_positive';
    return v.vetoed ? 'unearned_veto' : 'unearned_clean';
  }`,
  },
  {
    id: 'issuer-stake-makes-skipping-merely-unattractive',
    suite: 'check:issuer-stake',
    file: 'lib/trustshell/issuer-stake.ts',
    protects:
      'verification is STRICTLY DOMINANT, not merely disfavoured. The mutant prices an unearned ' +
      'veto the same as an honest error, which restores the expected-value argument for the ' +
      'cheap path: at 46.3% accuracy an issuer maximising EV would still skip. The penalty has ' +
      'to exceed the cost of verifying AND being wrong, or the incentive does not bind',
    find: `  unearned_veto: -3,`,
    replace: `  unearned_veto: -1,`,
  },
  {
    id: 'issuer-stake-refusal-lets-the-evidence-free-verdict-through',
    suite: 'check:issuer-stake',
    file: 'lib/trustshell/issuer-stake.ts',
    protects:
      'the refusal at SOURCE, which is the half the stake cannot do. A stake makes an unearned ' +
      'verdict expensive after the fact; only this stops it being emitted. The mutant keeps the ' +
      'function and inverts the evidence test, so an issuer that consulted nothing may still ' +
      'emit an actionable FACTUAL_ERROR veto — exactly what produced the 41',
    find: `  return !v.providerAttempted && v.vetoed;`,
    replace: `  return v.providerAttempted && v.vetoed;`,
  },
  {
    id: 'zk-verify-asserts-membership-instead-of-checking-it',
    suite: 'check:zk-cost',
    file: 'lib/trustshell/identity/nullifier.ts',
    protects:
      'verification WALKS the membership path rather than assuming it. The mutant keeps the ' +
      'loop, keeps the comparison, and simply sets the node to the claimed root — so every ' +
      'boolean stays identical and only the hash count betrays it. That is the borrowed-member ' +
      'attack surface: membership asserted rather than checked',
    find: `  for (const step of statement.privateWitness.membership) {
    node = step.left
      ? await scheme.hashPair(step.hash, node)
      : await scheme.hashPair(node, step.hash);
  }`,
    replace: `  for (const step of statement.privateWitness.membership) {
    void step;
  }
  node = statement.publicInputs.groupRoot;`,
  },
  {
    id: 'zk-cost-counter-measures-itself',
    suite: 'check:zk-cost',
    file: 'lib/trustshell/identity/cost.ts',
    protects:
      'the counting wrapper DELEGATES to the scheme under test instead of digesting on its ' +
      'own. A counter that computes its own values keeps reporting cheerfully after the real ' +
      'scheme starts throwing — measuring itself rather than the subject, which is how a ' +
      'benchmark comes to describe nothing',
    find: `      cost.hashPair++;
      return inner.hashPair(left, right);`,
    replace: `      cost.hashPair++;
      return 'h:' + left + right;`,
  },
  {
    id: 'zk-cost-model-stops-being-a-bound',
    suite: 'check:zk-cost',
    file: 'lib/trustshell/identity/cost.ts',
    protects:
      'COST_MODEL states the OPTIMUM, not a recording of current behaviour. The mutant makes ' +
      'the model linear in group size; a model that merely echoed the implementation would ' +
      'ratify exactly that regression the moment somebody re-recorded it',
    find:
      '  membershipPathLength: (n: number): number => Math.ceil(Math.log2(Math.max(1, n))),',
    replace: '  membershipPathLength: (n: number): number => Math.max(0, n - 1),',
  },
  {
    id: 'hal-accuracy-pools-incomparable-modes',
    suite: 'check:hal-accuracy',
    file: 'lib/hal/accuracy.ts',
    protects:
      'the refusal to compute an accuracy figure across hal_modes. hal_score means a ' +
      'different thing in each: mock is a 50-90 scale with zero positives, real a 0.26-0.42 ' +
      'band with zero positives, and every labelled hallucination lives in fact-check-s2 on ' +
      '0-1. Pooled, the corpus reports AUC 0.484 — worse than chance — for a detector that ' +
      'scores 0.958 within its own mode. Without the refusal a naive caller publishes that ' +
      'HAL is broken',
    find: `export function rocAuc(rows: readonly ScoredRow[]): number | null {
  requireSingleMode(rows);`,
    replace: 'export function rocAuc(rows: readonly ScoredRow[]): number | null {',
  },
  {
    id: 'hal-accuracy-undefined-reported-as-chance',
    suite: 'check:hal-accuracy',
    file: 'lib/hal/accuracy.ts',
    protects:
      'AUC is NULL, not 0.5, when a class is absent. mock and real carry no positive labels ' +
      'at all, so AUC is undefined on them. Reporting 0.5 collapses "we could not measure ' +
      'this" into "it scored at chance" — the two-outcome mistake this repo keeps paying for',
    find: '  if (pos.length === 0 || neg.length === 0) return null;',
    replace: '  if (pos.length === 0 || neg.length === 0) return 0.5;',
  },
  {
    id: 'hal-accuracy-ties-get-full-credit',
    suite: 'check:hal-accuracy',
    file: 'lib/hal/accuracy.ts',
    protects:
      'tied scores get HALF credit in the Mann-Whitney statistic. This corpus piles scores ' +
      'on 0.0 and 1.0, so tie handling moves the number materially — a min-rank SQL rank() ' +
      'reported 0.8351 for a corpus whose true AUC is 0.9579. The mutant inflates instead, ' +
      'which is the same class of error in the other direction',
    find: '      else if (p === n) wins += 0.5;',
    replace: '      else if (p === n) wins += 1;',
  },
  {
    id: 'hal-accuracy-charges-hal-for-provider-outages',
    suite: 'check:hal-accuracy',
    file: 'lib/hal/accuracy.ts',
    protects:
      'rows where generation FAILED are excluded from detection metrics. There was no answer ' +
      'to judge, so the detector was never asked a question; counting those 69 rows charges ' +
      "HAL for a provider outage and moves every headline number — the ceiling F1, the AUC " +
      'and the realized confusion all shift',
    find: '  return rows.filter((r) => !r.genFailed);',
    replace: '  return rows.slice();',
  },
  {
    id: 'hal-realized-confusion-uses-the-threshold',
    suite: 'check:hal-accuracy',
    file: 'lib/hal/accuracy.ts',
    protects:
      "realizedConfusion scores HAL's ACTUAL veto decision, not `score >= threshold`. The two " +
      'differ by exactly the 41 sub-threshold vetoes, and those 41 are precisely the verdicts ' +
      'HAL cast having consulted no provider — 46.3% precise against 95.8% where one ran. ' +
      'Model HAL as a pure cut and the entire unearned-veto finding disappears from the ' +
      'numbers, because every unearned veto sits below the line it never reached',
    find: '    if (r.vetoed && r.isHallucination) tp++;\n    else if (r.vetoed) fp++;',
    replace:
      '    if (r.score >= r.threshold && r.isHallucination) tp++;\n' +
      '    else if (r.score >= r.threshold) fp++;',
  },
  {
    id: 'hal-confusion-precision-counts-misses',
    suite: 'check:hal-accuracy',
    file: 'lib/hal/accuracy.ts',
    protects:
      'precision is tp/(tp+fp) — of the verdicts CAST, how many were right. It is the number ' +
      'an issuer-staking design has to price, and the one that separates an unearned veto ' +
      '(0.4634) from an earned one (0.9578). Dividing by the wrong denominator makes a veto ' +
      'that is wrong more often than right look competent',
    find: '  const precision = tp + fp === 0 ? null : tp / (tp + fp);',
    replace: '  const precision = tp + fn === 0 ? null : tp / (tp + fn);',
  },
  {
    id: 'auditor-grant-analysed-against-a-different-map',
    suite: 'check:spine-reachable',
    file: 'lib/trustshell/identity/spine.ts',
    protects:
      "the auditor grant is analysed against the LOOP'S OWN toolEffects, not a map supplied " +
      'beside it. This is the whole reason the grant is minted in the spine rather than at ' +
      'the call site: a grant proven read-only against a different effect map than the loop ' +
      'enforces would verify perfectly and describe a different world. The mutant hardcodes ' +
      'a permissive map, and both refusal cases then mint happily',
    find: '      toolEffects: execution.policy.toolEffects,',
    replace: "      toolEffects: { run_tests: 'read', deploy: 'read' },",
  },
  {
    id: 'auditor-grant-minted-but-not-bound',
    suite: 'check:spine-reachable',
    file: 'lib/trustshell/identity/spine.ts',
    protects:
      'the verdict REFERENCES the authority it was rendered under. A grant that is minted, ' +
      'checked and then not bound into the signed verdict leaves a third party unable to ask ' +
      'what the judge could touch — the grant becomes a thing we did rather than a thing ' +
      'anyone can check, which is the distinction the whole module exists for',
    find: '    controlProofRef: auditorGrant?.proof.delegateSignature,',
    replace: '    controlProofRef: undefined,',
  },
  {
    id: 'spend-limit-reads-zero-when-unreadable',
    suite: 'check:loud-errors',
    file: 'lib/trustshell/KYAValidator.ts',
    protects:
      'a daily spend that could not be READ is never reported as 0 SPENT. This is the ' +
      'payment path: the caller compares the result against spendingLimitDaily, so an ' +
      'RLS denial silently became the single most permissive answer the function can ' +
      'give. `(null || []).reduce(...)` is 0, and nothing downstream could tell that ' +
      'apart from a genuinely quiet day',
    // RETARGETED IN THE #52 MERGE. This mutant originally broke the `throw`
    // that main added. Both lanes fixed this fail-open independently — main by
    // throwing, this branch by returning `number | null` — and the merge kept
    // the nullable return, so the throw the mutant edited no longer exists and
    // the entry would have gone DRIFT. It now restores the same defect against
    // the same fixture: an unreadable ledger reporting a confident 0.
    find: '    if (error || !data) return null;',
    replace: '    if (error || !data) return 0;',
  },
  {
    id: 'spend-total-drops-an-unparseable-row',
    suite: 'check:loud-errors',
    file: 'lib/trustshell/KYAValidator.ts',
    protects:
      'a row whose amount will not parse makes the TOTAL unknown, not SMALLER. The hole ' +
      'capturing the query error does not close: `reduce((s, r) => s + Number(...), 0)` ' +
      'folds one bad row to NaN, and `NaN > limit` is false — so the unparseable row ' +
      'PASSES the limit it broke. Skipping it is the same bug with a tidier total',
    find: '      if (!Number.isFinite(amount)) return null;',
    replace: '      if (!Number.isFinite(amount)) continue;',
  },
  {
    id: 'risk-weights-silently-default-when-unreadable',
    suite: 'check:loud-errors',
    file: 'lib/trustshell/RepIDConfig.ts',
    protects:
      "an institution's chosen risk weights are never silently replaced by OURS. The " +
      'condition must distinguish PGRST116 (no config row — defaulting is correct and ' +
      'is the common case) from any other error (RLS, expired key, transport), which ' +
      'previously also returned the defaults and looked deliberate',
    find: "    if (error && error.code !== 'PGRST116') {",
    replace: "    if (error && error.code === 'PGRST116') {",
  },
  {
    id: 'unreadable-registry-reads-as-unregistered-agent',
    suite: 'check:loud-errors',
    file: 'lib/trustshell/EarnedMetricsRepo.ts',
    protects:
      'THREE OUTCOMES on agent resolution. A failed read must be `unreadable`, never ' +
      '`absent` — otherwise a permissions failure reports the agent as having no track ' +
      'record, which is a plausible wrong answer about reputation. `load()` twelve ' +
      'lines below already refuses exactly this for its own read',
    find:
      '      if (error) {\n' +
      '        return {\n' +
      "          status: 'unreadable',",
    replace:
      "      if (error && error.code === 'NEVER_MATCHES') {\n" +
      '        return {\n' +
      "          status: 'unreadable',",
  },

  // -------------------------------------------------------------------------
  // lib/trustshell/priorwork/open-index.ts — the gate against re-deriving work
  // that is already filed. Earned 2026-08-16, at the cost of most of a session.
  // -------------------------------------------------------------------------
  {
    id: 'openwork-advisory-entries-fire',
    suite: 'check:open-index',
    file: 'lib/trustshell/priorwork/open-index.ts',
    protects:
      'scope is OPT-IN: an entry with no [scope:] marker can NEVER fail a build. If ' +
      'unscoped entries matched, every diff would fire on every open item — and a gate ' +
      'that cries wolf is one people route around, which is exactly how check:prior-work ' +
      'came to enforce only its mechanical half',
    find: '    (e) => e.scope.length > 0 && e.scope.some((t) => scopeMatches(t, change))',
    replace: '    (e) => e.scope.some((t) => scopeMatches(t, change)) || e.scope.length === 0',
  },
  {
    id: 'openwork-token-matches-longer-name',
    suite: 'check:open-index',
    file: 'lib/trustshell/priorwork/open-index.ts',
    protects:
      'a scope token matches a WHOLE word, so `repid_events` does not match ' +
      '`trinity_repid_events` and send somebody to the wrong entry — the same near-name ' +
      'trap check:schema-names exists for, and this repo has already paid for twice',
    find: '  return word.test(change.diffText);',
    replace: '  return change.diffText.includes(token);',
  },
  {
    id: 'openwork-parses-closed-and-retracted',
    suite: 'check:open-index',
    file: 'lib/trustshell/priorwork/open-index.ts',
    protects:
      'ONLY the OPEN section is parsed. CLOSED and RETRACTED share the table shape; ' +
      'closed work is meant to be built on, and retracted figures are check:prior-work\'s ' +
      'job. Pulling them in would make this fire on everything',
    find: '    if (/^##\\s/.test(lines[i])) { end = i; break; }',
    replace: '    if (false) { end = i; break; }',
  },
  {
    id: 'openwork-everything-acknowledged',
    suite: 'check:open-index',
    file: 'lib/trustshell/priorwork/open-index.ts',
    protects:
      'acknowledgement requires naming THIS entry — a blanket pass would be a rubber ' +
      'stamp, which is worse than no gate because it looks like diligence',
    find: '  if (cited) return true;',
    replace: '  if (true) return true;',
  },

  // -------------------------------------------------------------------------
  // lib/trustshell/alerts/digest.ts — 142,560 rows nobody ever read.
  // -------------------------------------------------------------------------
  {
    id: 'digest-repeats-do-not-collapse',
    suite: 'check:alert-digest',
    file: 'lib/trustshell/alerts/digest.ts',
    protects:
      'repeats collapse. Without number-stripping, "Time Down: 42314 minutes" and ' +
      '"42317 minutes" are different alerts and 40,236 rows become 40,236 digests — ' +
      'a consumer that achieves nothing while appearing to work. Measured on live ' +
      'data the real ratio is 188:1',
    find: "    .replace(/\\b\\d[\\d,._]*\\b/g, '<n>')",
    replace: '    .replace(/\\b(?!)\\b/g, "<n>")',
  },
  {
    id: 'digest-backlog-pages-everyone',
    suite: 'check:alert-digest',
    file: 'lib/trustshell/alerts/digest.ts',
    protects:
      'a five-month-old condition never notified does NOT page. Staleness is checked ' +
      'BEFORE first-notice, or the first run floods the channel with a backlog reaching ' +
      'back to January and buries whatever is actually live',
    find: "  if (ageDays > policy.staleAfterDays) return 'SUPPRESS_STALE';",
    replace: '  if (false) return \'SUPPRESS_STALE\';',
  },
  {
    id: 'digest-invents-a-subject',
    suite: 'check:alert-digest',
    file: 'lib/trustshell/alerts/digest.ts',
    protects:
      'a subject is parsed only for the shape actually measured, never guessed. A wrong ' +
      'subject routes a human to the wrong agent — the name-matching failure this repo ' +
      'has already paid for twice. api_auth_attempt carries an EMPTY message, so a ' +
      'guessing parser would silently emit blanks and look like it worked',
    find: '  return null;\n}\n\nexport function digestRows',
    replace: "  return message.split(' ')[0] ?? null;\n}\n\nexport function digestRows",
  },
  {
    id: 'digest-drops-corroboration',
    suite: 'check:alert-digest',
    file: 'lib/trustshell/alerts/digest.ts',
    protects:
      'distinct reporters are retained. Three agents independently reporting one agent ' +
      'DOWN is stronger evidence than one, and collapsing them without the count throws ' +
      'that away',
    find: '    if (r.agent && !d.reporters.includes(r.agent)) d.reporters.push(r.agent);',
    replace: '    // mutated: reporters no longer accumulated',
  },

  // ── check:lesson-ids ──────────────────────────────────────────────────────
  //
  // These four are caught by the SELF-TEST, not by the scan of LESSONS.md, and
  // that is the whole point. The tree currently has no duplicate IDs, so a
  // detector that cannot fire produces the same green line as a clean file. If
  // any of these four survived, `check:lesson-ids` would be decorative.
  {
    id: 'lesson-duplicate-detector-never-fires',
    suite: 'check:lesson-ids',
    file: 'lib/trustshell/lessons/ids.ts',
    protects:
      'the duplicate detector actually fires. On 2026-08-16 LESSONS.md carried two `A19` ' +
      'headings and two `A20` headings on unrelated failures, with three live citations ' +
      'pointing at those tokens — the ID is the entire reference, so following one was a ' +
      'coin flip. Off by one in this comparison and the check passes over the exact ' +
      'defect it was written for',
    find: '    if (sites.length > 1) dupes.push({ id, sites });',
    replace: '    if (sites.length > 2) dupes.push({ id, sites });',
  },
  {
    id: 'lesson-series-letter-dropped-from-id',
    suite: 'check:lesson-ids',
    file: 'lib/trustshell/lessons/ids.ts',
    protects:
      'the series letter is part of the ID. `A19` is an agent error and `S19` would be a ' +
      'security finding; keying on the number alone reports them as the same entry and ' +
      'demands a renumber that would be wrong. This is the same defect as LESSONS A12 — ' +
      'two different things agreeing on a name',
    find: "      defs.push({ id: `${heading[1]}${heading[2]}`, line: i + 1, title: heading[3].trim() });",
    replace: "      defs.push({ id: `${heading[2]}`, line: i + 1, title: heading[3].trim() });",
  },
  {
    id: 'lesson-ambiguous-collapsed-into-nothing',
    suite: 'check:lesson-ids',
    file: 'lib/trustshell/lessons/ids.ts',
    protects:
      'a citation pointing at a duplicated ID is reported. A duplicate heading with no ' +
      'citation is untidy; a duplicate heading WITH citations is a reference that resolves ' +
      'two ways, which is the part that costs time. Returning empty here leaves the ' +
      'duplicate report standing while hiding who is affected by it',
    find: '  return citations.filter((c) => dupeIds.has(c.id));',
    replace: '  return [];',
  },
  {
    id: 'lesson-heading-anchor-dropped',
    suite: 'check:lesson-ids',
    file: 'lib/trustshell/lessons/ids.ts',
    protects:
      'a heading is only a definition at the start of a line. Without the anchor, an ID ' +
      'quoted inside a table cell or a fenced block registers as a second definition of an ' +
      'entry that is in fact defined once — the check then demands a renumber to fix a ' +
      'duplicate that does not exist, which is how a suite loses the reader',
    find: 'const HEADING_DEF = /^#{2,4}\\s+([A-Z])(\\d+)\\s*[—–-]\\s*(.*)$/;',
    replace: 'const HEADING_DEF = /#{2,4}\\s+([A-Z])(\\d+)\\s*[—–-]\\s*(.*)/;',
  },

  // ── check:replay-plan ─────────────────────────────────────────────────────
  //
  // Every one of these lives on the resume path, which a successful first run
  // never touches. The corpus is 147,704 rows behind a partial unique index, so
  // a wrong first pass cannot be re-minted — these are the decisions that have
  // to be right before the run, not after it.
  {
    id: 'replay-fatal-error-read-as-duplicate',
    suite: 'check:replay-plan',
    file: 'lib/trustshell/replay/plan.ts',
    protects:
      'only SQLSTATE 23505 is benign. Treating an unrecognised error as a duplicate turns a ' +
      'permission denial or a constraint violation into a silent skip, and a skip leaves no ' +
      'trace — the corpus goes short and the run still prints a completion line. This is the ' +
      'house defect applied to 147,704 rows',
    find: "  if (error.code === UNIQUE_VIOLATION) return 'duplicate';\n  return 'fatal';",
    replace: "  if (error.code === UNIQUE_VIOLATION) return 'duplicate';\n  return 'duplicate';",
  },
  {
    id: 'replay-cursor-runs-backwards',
    suite: 'check:replay-plan',
    file: 'lib/trustshell/replay/plan.ts',
    protects:
      'the cursor is a high-water mark and only ever rises. Moving it backwards on an ' +
      'out-of-order batch makes a resumed run re-read rows it already attempted, which is ' +
      'harmless only because of the unique index — remove that index and it double-mints',
    find: '  for (const id of attemptedIds) if (id > max) max = id;',
    replace: '  for (const id of attemptedIds) if (id < max) max = id;',
  },
  {
    id: 'replay-interrupted-run-reads-as-verified',
    suite: 'check:replay-plan',
    file: 'lib/trustshell/replay/plan.ts',
    protects:
      'an interrupted run is NOT_CHECKED. Dropping this line collapses three outcomes into ' +
      'two: a run that reached 40,000 of 147,704 rows and stopped reports VERIFIED, which is ' +
      '"we did not look" printed as "it passed" — the exact substitution CLAUDE.md names as ' +
      'the recurring defect in this codebase',
    find: "  if (counts.remaining > 0) return 'NOT_CHECKED';",
    replace: '  // mutated: incompleteness no longer reported',
  },
  {
    id: 'replay-batch-clamps-to-zero',
    suite: 'check:replay-plan',
    file: 'lib/trustshell/replay/plan.ts',
    protects:
      'the batch floor. A batch of 0 makes the reader return no rows, the cursor never ' +
      'advances, and the loop exits immediately with minted 0 — a run that terminates ' +
      'cleanly having done nothing, which reads as an already-complete corpus',
    find: '  if (n < MIN_BATCH) return MIN_BATCH;',
    replace: '  if (n < MIN_BATCH) return n;',
  },

  // ── check:acceptance-loop ─────────────────────────────────────────────────
  {
    id: 'acceptance-exhausted-reads-as-delivered',
    suite: 'check:acceptance-loop',
    file: 'lib/trustshell/identity/acceptance-loop.ts',
    protects:
      'a spent revision budget is NOT a standard met. This is the house defect in one line: ' +
      'EXHAUSTED means the process ran out of road, and shipping on it reports an auditor ' +
      "sign-off that never happened. `isDelivered` exists precisely so callers cannot write " +
      "`status !== 'REVISE'` and treat running out as done",
    find: "export function isDelivered(state: AcceptanceState): boolean {\n  return state.status === 'ACCEPTED';",
    replace:
      "export function isDelivered(state: AcceptanceState): boolean {\n" +
      "  return state.status === 'ACCEPTED' || state.status === 'EXHAUSTED';",
  },
  {
    id: 'acceptance-auditor-substitution-unnoticed',
    suite: 'check:acceptance-loop',
    file: 'lib/trustshell/identity/acceptance-loop.ts',
    protects:
      "the sticky auditor. checker-assignment.ts defeats checker-shopping AT THE DRAW, and " +
      'both of its defences are properties of a SINGLE draw. Re-drawing per revision ' +
      'reintroduces the entire attack — "rejected? resubmit for a new auditor" is the re-roll ' +
      'the deterministic seed exists to prevent, and it arrives disguised as diligence',
    find: '    if (rounds[i].auditorDid !== first) return { stable: false, at: i };',
    replace: '    if (rounds[i].auditorDid === first) return { stable: false, at: i };',
  },
  {
    id: 'acceptance-outage-consumes-revision-budget',
    suite: 'check:acceptance-loop',
    file: 'lib/trustshell/identity/acceptance-loop.ts',
    protects:
      'only REJECTED spends budget. staged-judge.ts already holds that "a provider outage is ' +
      'not a defect report, and must not be able to condemn the work"; one level up, letting ' +
      "NOT_CHECKED decrement the allowance lets a flaky judge exhaust a correct doer and " +
      'produce EXHAUSTED on work nobody ever judged',
    find: "  const rejected = rounds.filter((r) => r.verdict === 'REJECTED');",
    replace: "  const rejected = rounds.filter((r) => r.verdict !== 'ACCEPTED');",
  },
  {
    id: 'acceptance-stall-never-detected',
    suite: 'check:acceptance-loop',
    file: 'lib/trustshell/identity/acceptance-loop.ts',
    protects:
      'resubmitting identical bytes is its own outcome. Without it a doer that changes ' +
      'nothing burns the budget to EXHAUSTED, which reads as "we tried" — STALLED separates ' +
      '"could not fix it" from "did not change it", and only one of those is the doer\'s fault',
    find: '  if (rejected.length >= 2) {',
    replace: '  if (rejected.length >= Number.MAX_SAFE_INTEGER) {',
  },
  {
    id: 'acceptance-later-rejection-unaccepts',
    suite: 'check:acceptance-loop',
    file: 'lib/trustshell/identity/acceptance-loop.ts',
    protects:
      'acceptance is final. Scanning only the last round lets a re-review revoke a delivered ' +
      'result, so a signed-off deliverable could be retroactively withdrawn by running the ' +
      'auditor again — the reputation events and the envelope have already been issued',
    find: '  for (const round of rounds) {\n    if (round.verdict === \'ACCEPTED\') {',
    replace: '  for (const round of rounds.slice(-1)) {\n    if (round.verdict === \'ACCEPTED\') {',
  },
  {
    id: 'acceptance-loop-cannot-terminate-under-an-outage',
    suite: 'check:acceptance-loop',
    file: 'lib/trustshell/identity/acceptance-loop.ts',
    protects:
      'the SECOND bound. maxRejections alone cannot terminate the loop: "NOT_CHECKED never ' +
      'spends the doer\'s budget" is correct, and combined with "run until terminal" it means ' +
      'an unavailable judge yields REVISE forever. Both rules are individually right and ' +
      'jointly non-terminating. This was found by running it — the suite hung for nine ' +
      'minutes before it was killed — not by reading it',
    find: '  if (rounds.length >= maxRounds) {',
    replace: '  if (rounds.length >= Number.MAX_SAFE_INTEGER) {',
  },
  {
    id: 'acceptance-unreadable-verdict-scored-as-a-rejection',
    suite: 'check:acceptance-loop',
    file: 'lib/trustshell/identity/acceptance-loop.ts',
    protects:
      'BOTH readability signals are required. A verdict bound to a different contract is not ' +
      'the auditor faulting the work, and charging it to the revision budget spends the ' +
      "doer's allowance on a harness bug. Dropping either half also re-opens the trap that " +
      'hung this loop once: reading a rejection as unreadable, or an unreadable verdict as a ' +
      'rejection, are the two ways to get this exactly backwards',
    find: "  if (input.signatureValid !== true || input.boundToContract !== true) return 'NOT_CHECKED';",
    replace: "  if (input.signatureValid !== true) return 'NOT_CHECKED';",
  },

  // ── check:review-session ──────────────────────────────────────────────────
  {
    id: 'review-doer-seed-falls-back',
    suite: 'check:review-session',
    file: 'lib/trustshell/review/session.ts',
    protects:
      'missing configuration throws and names the variable. This is the dummy-fallback defect ' +
      'lib/CLAUDE.md removed on purpose, in its worst form: a fallback SEED does not fail ' +
      'visibly like a fallback URL — it produces a perfectly valid Ed25519 signature attesting ' +
      'to an identity nobody holds, and every layer above reads that as a signed contract',
    find: '  const doerSeed = env.TRUSTSHELL_DOER_SEED?.trim();',
    replace: "  const doerSeed = env.TRUSTSHELL_DOER_SEED?.trim() || 'fallback-doer-seed';",
  },
  {
    id: 'review-single-auditor-pool-accepted',
    suite: 'check:review-session',
    file: 'lib/trustshell/review/session.ts',
    protects:
      'a pool of one is not a draw. The same reasoning as MIN_MEANINGFUL_POOL in ' +
      'checker-assignment and MIN_MEANINGFUL_GROUP in nullifier: the mechanism runs, the proof ' +
      'verifies, and it identifies the auditor exactly — "a named checker wearing a ' +
      "lottery's clothes\". The draw would still be recomputable, which is what makes it " +
      'convincing and wrong',
    find: 'export const MIN_AUDITOR_POOL = 2;',
    replace: 'export const MIN_AUDITOR_POOL = 1;',
  },
  {
    id: 'review-exhausted-attempts-resubmit-the-last',
    suite: 'check:review-session',
    file: 'lib/trustshell/review/session.ts',
    protects:
      'running out of submissions returns null rather than repeating. Repeating the last ' +
      'attempt makes the loop judge identical bytes twice and score STALLED — blaming the doer ' +
      'for failing to revise work it has not yet been told about. Sessions are stateless: the ' +
      'revision is in the NEXT request, and the honest answer is a non-terminal REVISE',
    find: '      const submitted = request.attempts[round];',
    replace:
      '      const submitted = request.attempts[Math.min(round, request.attempts.length - 1)];',
  },

  // ── check:judges ──────────────────────────────────────────────────────────
  {
    id: 'mechanical-judge-can-say-verified',
    suite: 'check:judges',
    file: 'lib/trustshell/review/judges.ts',
    protects:
      'THE rule of the mechanical tier: it may never return VERIFIED. It detects the ABSENCE ' +
      'of quality and cannot establish its PRESENCE — a scan finding no TODO has learned that ' +
      'there is no TODO, not that the work is correct. Letting it pass turns the review ' +
      'surface into a rubber stamp that signs off on anything clean-looking, and the stamp ' +
      'arrives wearing a contract-bound verdict',
    find: "      return {\n        outcome: 'NOT_CHECKED',\n        detail:\n          'no mechanically decidable defect;",
    replace: "      return {\n        outcome: 'VERIFIED',\n        score: 1,\n        detail:\n          'no mechanically decidable defect;",
  },
  {
    id: 'judge-outage-condemns-the-work',
    suite: 'check:judges',
    file: 'lib/trustshell/review/judges.ts',
    protects:
      'an unreachable model is NOT_CHECKED, never FAILED. staged-judge escalates NOT_CHECKED ' +
      'and treats FAILED as final, so scoring an outage as FAILED lets an API error fail an ' +
      "agent's work — and under the acceptance loop three of them reach EXHAUSTED on work no " +
      'judge ever read',
    find: "        return {\n          outcome: 'NOT_CHECKED',\n          detail:\n            `${label} judge was unreachable:",
    replace: "        return {\n          outcome: 'FAILED',\n          detail:\n            `${label} judge was unreachable:",
  },
  {
    id: 'judge-verified-without-a-score-accepted',
    suite: 'check:judges',
    file: 'lib/trustshell/review/judges.ts',
    protects:
      "JudgeOpinion.score says it outright — absent is not a pass. A VERIFIED with no score " +
      "cannot be measured against the criterion's floor, so accepting it lets a model pass " +
      'work by asserting success without ever expressing confidence in it',
    find: "  if (outcome === 'VERIFIED' && score === undefined) return null;",
    replace: '  // mutated: an unscored VERIFIED is accepted',
  },
  {
    id: 'judge-out-of-range-score-clamped',
    suite: 'check:judges',
    file: 'lib/trustshell/review/judges.ts',
    protects:
      'an out-of-range score is malformed, not clamped. Clamping 4.7 to 1 invents a confidence ' +
      'the model never expressed and turns a broken response into a maximal pass',
    find:
      '    if (typeof o.score !== \'number\' || !Number.isFinite(o.score) || o.score < 0 || o.score > 1) {\n' +
      '      return null;\n    }\n    score = o.score;',
    replace:
      '    if (typeof o.score !== \'number\' || !Number.isFinite(o.score)) {\n' +
      '      return null;\n    }\n    score = Math.min(1, Math.max(0, o.score));',
  },

  // lib/trustshell/config-readiness.ts — a PUBLIC presence report
  //
  // Registered in the same commit as the code. Leaving new code unmutated is
  // the defect this branch already found in its own gate once.
  // -------------------------------------------------------------------------
  {
    id: 'config-abandoned-default-reads-ok',
    suite: 'check:config-readiness',
    file: 'lib/trustshell/config-readiness.ts',
    protects:
      'the abandoned default is NOT `ok`. It is 26 characters, so it clears the length ' +
      'bound - a length-first classification reports the one KNOWN-FORGEABLE value as fine, ' +
      'and pasting that constant is the likeliest repair for a missing variable',
    find: "  if (rule.rejectValue !== undefined && value.trim() === rule.rejectValue) {",
    replace: "  if (rule.rejectValue !== undefined && value.trim() === '\u0000never-matches') {",
  },
  {
    id: 'config-empty-string-is-not-missing',
    suite: 'check:config-readiness',
    file: 'lib/trustshell/config-readiness.ts',
    protects:
      'an EMPTY or whitespace-only variable is `missing`, not merely short. A platform that ' +
      'stores an empty string for an unset variable would otherwise report `too_short`, ' +
      'sending an operator to lengthen a secret that is not there at all',
    find: "  if (value === undefined || value.trim() === '') return 'missing';",
    replace: "  if (value === undefined) return 'missing';",
  },
  {
    id: 'config-ready-ignores-blocking',
    suite: 'check:config-readiness',
    file: 'lib/trustshell/config-readiness.ts',
    protects:
      '`ready` is true ONLY when every allowlisted secret is ok. A readiness flag that is ' +
      'always true is precisely the unearned green this whole branch exists to remove, in ' +
      'the one report whose job is to be honest about configuration',
    find: '  return { secrets, ready: blocking.length === 0, blocking };',
    replace: '  return { secrets, ready: true, blocking };',
  },
  {
    id: 'config-enumerates-the-environment',
    suite: 'check:config-readiness',
    file: 'lib/trustshell/config-readiness.ts',
    protects:
      'the environment is NEVER enumerated - the allowlist is hardcoded, so adding a variable ' +
      'to a platform cannot make it appear on a PUBLIC endpoint. This is the rule ' +
      'app/api/version/route.ts states about itself, and this mutant breaks it',
    find: '  const secrets: Record<string, ConfigStatus> = {};',
    replace: "  const secrets: Record<string, ConfigStatus> = Object.fromEntries(Object.keys(env).map((k) => [k, 'ok' as ConfigStatus]));",
  },
  {
    id: 'config-length-boundary-off-by-one',
    suite: 'check:config-readiness',
    file: 'lib/trustshell/config-readiness.ts',
    protects:
      'a secret EXACTLY at the minimum length is acceptable. The fifth `<` vs `<=` boundary ' +
      'in this branch, and here it would disagree with requireAuditSecret - the report would ' +
      'call a surface unready that mints perfectly well',
    find: '  if (value.trim().length < rule.minLength) return \'too_short\';',
    replace: '  if (value.trim().length <= rule.minLength) return \'too_short\';',
  },

  // -------------------------------------------------------------------------
  // lib/trustshell/reward.ts — the reputation the payment path is allowed to pay
  // -------------------------------------------------------------------------
  {
    id: 'reward-trusts-observe-mode-passed-true',
    suite: 'check:reward-earned',
    file: 'lib/trustshell/reward.ts',
    protects:
      'observe mode returns `passed: true, evaluated: false` BY DESIGN — not blocked is not ' +
      'a verdict. The mutant reads the flag the panel never set, so the default configuration ' +
      'goes back to paying +10 RepID for a consensus that did not run. That reward is durable: ' +
      'it rewrites repid_tier and both spending limits, raising the ceiling on the next request',
    find: '  if (!evidence.consensusEvaluated) {',
    replace: '  if (!evidence.consensusPassed) {',
  },
  {
    id: 'reward-pays-for-a-simulated-settlement',
    suite: 'check:reward-earned',
    file: 'lib/trustshell/reward.ts',
    protects:
      'a payment that touched no chain earns no reputation. The executor simulates whenever ' +
      'AGENT_SOPHIA_SECRET_BYTES is absent, which is every environment observed here, so the ' +
      'mutant is not an edge case — it restores +10 per call for money that never moved, with ' +
      'no idempotency key and no authentication on the route',
    find: '  if (evidence.settlementSimulated) {',
    replace: '  if (evidence.settlementSimulated && !evidence.consensusPassed) {',
  },
  {
    id: 'reward-collapses-not-checked-into-failed',
    suite: 'check:reward-earned',
    file: 'lib/trustshell/reward.ts',
    protects:
      'three outcomes, never two. A broadcast transaction awaiting confirmation is NOT CHECKED; ' +
      'the mutant charges it as a consensus FAILURE, which is the same defect this module fixes ' +
      'pointed the other way — and it would make a provider outage indistinguishable from a ' +
      'rejected payment in the response the caller reads',
    find: '    outcome: failed ? \'WITHHELD_FAILED\' : \'WITHHELD_NOT_CHECKED\',',
    replace: '    outcome: \'WITHHELD_FAILED\',',
  },

  // -------------------------------------------------------------------------
  // scripts/lib/module-specifiers.mjs — the parser the package boundary rests on
  //
  // All three break the MEASUREMENT rather than the thing measured. A boundary
  // check whose extractor under-reports prints a clean boundary, and the report
  // is what anyone reads. These are the shapes that actually defeated it.
  // -------------------------------------------------------------------------
  {
    id: 'specifiers-reads-prose-as-imports',
    suite: 'check:package-boundary',
    file: 'scripts/lib/module-specifiers.mjs',
    protects:
      'comments are stripped before specifiers are matched. Four modules in lib/trustshell ' +
      'were once reported as carrying npm dependencies because their header prose contains ' +
      "the word \"from\" followed by a quoted phrase — the mutant restores that reading, and " +
      'an inflated dependency list is a boundary nobody can act on',
    find: '      return !t.startsWith(\'//\') && !t.startsWith(\'*\');',
    replace: '      return true;',
  },
  {
    id: 'specifiers-misses-multiline-imports',
    suite: 'check:package-boundary',
    file: 'scripts/lib/module-specifiers.mjs',
    protects:
      'the SPECIFIER is matched, not the statement. Anchoring to `import`/`export` on one line ' +
      'misses every `import {\\n … \\n} from "x"` — it filed SolanaExecutor.ts, which imports ' +
      'two Solana packages, as having no dependencies at all. Under-reporting is the dangerous ' +
      'direction: it prints a portable package that is not one',
    find: '    ...code.matchAll(/\\bfrom\\s*[\'"]([^\'"]+)[\'"]/g),',
    replace: '    ...code.matchAll(/^\\s*(?:import|export)\\b[^;\\n]*?\\bfrom\\s*[\'"]([^\'"]+)[\'"]/gm),',
  },
  {
    id: 'specifiers-admits-template-phantoms',
    suite: 'check:package-boundary',
    file: 'scripts/lib/module-specifiers.mjs',
    protects:
      'a `${…}` interpolation cannot be a module path. `retargets audience from \'${a.audience}\'` ' +
      'is an error message, and counting it invents a dependency on a package that does not exist ' +
      '— the opposite error to the one above, and equally a wrong boundary',
    find: '  return [...new Set(found.filter((s) => !s.includes(\'${\') && !s.includes(\' \')))];',
    replace: '  return [...new Set(found)];',
  },

  // -------------------------------------------------------------------------
  // lib/trustshell/lane-files.ts — the recomputation that grades a lane's file
  // -------------------------------------------------------------------------
  {
    id: 'lane-referral-clamp-ignored',
    suite: 'check:lane-files',
    file: 'lib/trustshell/lane-files.ts',
    protects:
      'the per-rank clamp c(n) is what caps the referral delta, not the curve. At n=1 the raw ' +
      'curve pays 20 against a clamp of 12; the mutant returns the uncapped value, so a policy ' +
      'file publishing delta=20 would be accepted as derivable. The clamp is the anti-whale term',
    find: '  return Math.min(Math.max(Math.round(referralRaw(n)), 0), referralClamp(n));',
    replace: '  return Math.max(Math.round(referralRaw(n)), 0);',
  },
  {
    id: 'lane-bucket-overlap-unnoticed',
    suite: 'check:lane-files',
    file: 'lib/trustshell/lane-files.ts',
    protects:
      'a surface listed in two status buckets is two incompatible claims, not a typo — whichever ' +
      'a reader hits first wins, and `live` next to `blocked` is the worst pair. The mutant stops ' +
      'recording the collision and the policy table silently self-contradicts',
    find: '      if (prior) out.push(`"${item}" is in both ${prior} and ${bucket}`);',
    replace: '      if (prior) seen.set(item, bucket);',
  },
  {
    id: 'lane-live-claims-read-as-evidence',
    suite: 'check:lane-files',
    file: 'lib/trustshell/lane-files.ts',
    protects:
      'a document`s own `status.live` list is an ASSERTED stage — the exact thing promotion.ts ' +
      'refuses. The mutant returns nothing to back, so every self-declared live surface passes ' +
      'unexamined and the policy file grades itself',
    find: '  return [...(status.live ?? [])];',
    replace: '  return [];',
  },

  // -------------------------------------------------------------------------
  // lib/trustshell/reward-idempotency.ts — paid at most once, and fail closed
  // -------------------------------------------------------------------------
  {
    id: 'idempotency-pays-on-an-unreadable-ledger',
    suite: 'check:reward-idempotency',
    file: 'lib/trustshell/reward-idempotency.ts',
    protects:
      'a ledger that cannot be read WITHHOLDS. The mutant pays when the claim could not be ' +
      'recorded, so a database outage becomes an unbounded faucet — and every payment during ' +
      'it is replayable forever, because nothing recorded that the reward was taken',
    find: "    case 'unreadable':\n      return {\n        award: false,",
    replace: "    case 'unreadable':\n      return {\n        award: true,",
  },
  {
    id: 'idempotency-claims-before-checking-earned',
    suite: 'check:reward-idempotency',
    file: 'lib/trustshell/reward-idempotency.ts',
    protects:
      'a zero delta short-circuits BEFORE the ledger. The mutant lets an unearned reward fall ' +
      'through to the ledger states, so the receipt gets claimed for a payment that was never ' +
      'made — and the eventual legitimate reward then reads as a duplicate and is withheld ' +
      'forever. The ordering is the invariant, not the branch',
    find: '  if (earnedDelta === 0) {',
    replace: '  if (earnedDelta < 0) {',
  },
  {
    id: 'idempotency-unknown-error-blamed-on-the-migration',
    suite: 'check:reward-idempotency',
    file: 'lib/trustshell/reward-idempotency.ts',
    protects:
      'only 42703 (undefined_column) means the migration is unapplied. The mutant reports every ' +
      'connection drop and statement timeout as a missing migration, which sends the operator to ' +
      'apply SQL while a live database problem continues — both withhold, so the failure is ' +
      'invisible in the payout and only the DIAGNOSIS is wrong',
    find: "  return 'unreadable';\n}",
    replace: "  return 'store-absent';\n}",
  },
  {
    id: 'idempotency-missing-receipt-read-as-duplicate',
    suite: 'check:reward-idempotency',
    file: 'lib/trustshell/reward-idempotency.ts',
    protects:
      'zero rows updated is ambiguous, and the two readings are not interchangeable. Against a ' +
      'MISSING receipt it is an outage; the mutant calls it a suppressed duplicate, which is the ' +
      'one classification nobody ever investigates — a vanished receipt would be hidden forever',
    find: '  if (!receiptExists) return \'unreadable\';',
    replace: '  if (!receiptExists) return \'already-awarded\';',
  },

  // -------------------------------------------------------------------------
  // The portable entry point — DoD 1's actual question, asked of Node
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // docs/contracts/*.json — GA's contracts, graded against XC'S policy file
  //
  // These mutate the CONTRACT and require the cross-lane comparison to notice.
  // Before 2026-08-19 there was nothing to mutate: check:lane-files had no
  // content assertions for either GA path, so `{}` at both paths produced two
  // SOFT-LIVE rows. Measured by doing it — the reconstructed contracts moved
  // both rows off NOT CHECKED while the assertion count stayed at 19.
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // The publishable package — DoD 1, and the failure only an install can see
  // -------------------------------------------------------------------------
  // NOT REGISTERED — `package-ships-no-dist` and
  // `package-exports-a-path-that-is-not-packed`, both rejected 2026-08-19.
  //
  // The invariants are real and the assertions DO catch them. Verified by hand:
  // setting `files: ["README.md"]` turns check:package-install red at 3 of 12,
  // and pointing `exports` at a path that is never emitted does the same. Both
  // are the failure that only an install can see — the package still builds and
  // still loads from the repo tree in each case.
  //
  // They cannot be SCORED here, for two independent reasons:
  //
  //   1. mutate.mjs marks a run INVALID when the suite's output matches
  //      /Cannot find (module|name)/, on the sound rule that a non-compiling
  //      mutant is not evidence. This suite's subject IS a module that cannot be
  //      found — at the consumer, at require time, which is a different failure
  //      from a broken build and the heuristic cannot tell them apart.
  //   2. The mutation target would be `package.json`, which npm READS during the
  //      run (`npm pack`, `npm install`). Mutating it mid-suite races the very
  //      tool the suite drives, which is the concurrency hazard the mutate lock
  //      exists to prevent — applied to the manifest that configures npm itself.
  //
  // Recorded rather than registered, the same disposition as the non-terminating
  // `i += 2` mutation and `portable-alias-creeps-back`. What is missing is
  // mutation EVIDENCE, not the assertions; saying so beats a green entry that
  // never ran.

  // -------------------------------------------------------------------------
  // verifier-independence.ts — the grader must not be the author
  // -------------------------------------------------------------------------
  {
    id: 'independence-unattributed-counts-as-independent',
    suite: 'check:verifier-independence',
    file: 'lib/trustshell/verifier-independence.ts',
    protects:
      'missing attribution is NOT_CHECKED. The mutant treats it as disjoint — and unattributed ' +
      'is the DEFAULT STATE of every gate in this repo, so this single change would silently ' +
      'promote every claim to fully-independent evidence. "Nobody recorded who checked this" ' +
      'must never read as "someone independent did". Targets the RETURN, not the guard: ' +
      '`if (false)` on the guard defeats TypeScript narrowing and the mutant stops compiling — ' +
      'INVALID, not evidence. Third time that trap has cost a run',
    find: "      independence: 'NOT_CHECKED',\n      sharedProvider,\n      counts: false,",
    replace: "      independence: 'DISJOINT',\n      sharedProvider,\n      counts: true,",
  },
  {
    id: 'independence-same-family-counts',
    suite: 'check:verifier-independence',
    file: 'lib/trustshell/verifier-independence.ts',
    protects:
      'two models from ONE training lineage agreeing is one opinion stated twice. The mutant ' +
      'lets a claude-checks-claude verdict count as a second opinion, which is exactly the ' +
      'self-grading this module was written to refuse',
    find: "      independence: 'SHARED_FAMILY',\n      sharedProvider,\n      counts: false,",
    replace: "      independence: 'DISJOINT',\n      sharedProvider,\n      counts: true,",
  },
  {
    id: 'independence-vendor-mistaken-for-lineage',
    suite: 'check:verifier-independence',
    file: 'lib/trustshell/verifier-independence.ts',
    protects:
      'a SHARED VENDOR does not disqualify disjoint lineages. The mutant rejects the exact pair ' +
      'cross-llm-verifier.ts ships on purpose — llama + gpt behind one groq endpoint, chosen for ' +
      'training-data diversity. Conflating vendor with lineage would reject real independence ' +
      'and, run the other way, accept two same-lineage models bought from different resellers',
    find: '  return {\n    independence: \'DISJOINT\',\n    sharedProvider,\n    counts: true,',
    replace: '  return {\n    independence: sharedProvider ? \'SHARED_FAMILY\' : \'DISJOINT\',\n    sharedProvider,\n    counts: !sharedProvider,',
  },
  {
    id: 'promotion-accepts-self-verified-evidence',
    suite: 'check:promotion-evidence',
    file: 'lib/trustshell/promotion.ts',
    protects:
      'promotion requires a verifier disjoint from the author. The mutant drops the filter, so a ' +
      'claim graded entirely by the lineage that wrote it reaches `live` — the incident this seam ' +
      'was built for, restored',
    find: '    if (!a || !v) return false;',
    replace: '    if (!a || !v) return true;',
  },

  // -------------------------------------------------------------------------
  // collateral.ts / authority-policy.ts — what backs a spending ceiling
  // -------------------------------------------------------------------------
  {
    id: 'collateral-counts-simulated-deposits',
    suite: 'check:authority-runtime',
    file: 'lib/trustshell/collateral.ts',
    protects:
      'stake_deposits is 51 of 52 SIMULATED. The mutant counts them, taking collateral from 50 ' +
      'USDC to 5,722 — a 114x overstatement that lands in 100*sqrt(S_usd) and grants more than ' +
      'TEN TIMES the collateralised authority. This is the sample-shape trap CLAUDE.md names',
    find: '    if (r.is_simulated) {',
    replace: '    if (false) {',
  },
  {
    id: 'collateral-counts-closed-deposits',
    suite: 'check:authority-runtime',
    file: 'lib/trustshell/collateral.ts',
    protects:
      'only `active` deposits collateralise. The mutant counts `completed` ones too, so withdrawn ' +
      'money keeps buying authority — and the two completed rows carry no tx hash, so nothing ' +
      'downstream would look twice at them',
    find: "    if (r.status !== COLLATERALISING_STATUS) {",
    replace: "    if (false) {",
  },
  {
    id: 'collateral-reports-a-partial-sum-as-a-total',
    suite: 'check:authority-runtime',
    file: 'lib/trustshell/collateral.ts',
    protects:
      'an unreadable row makes the TOTAL unknown, not smaller. The mutant returns the sum of the ' +
      'rows it understood as though it were complete — a spending ceiling computed from part of ' +
      'the evidence, presented as the whole of it',
    find: '  if (excluded.wrongAsset > 0 || excluded.unparseable > 0) {',
    replace: '  if (false) {',
  },
  {
    id: 'authority-defaults-a-missing-policy-constant',
    suite: 'check:authority-runtime',
    file: 'lib/trustshell/authority-policy.ts',
    protects:
      'NO constant has a default. The mutant substitutes 500 for a missing builder_floor, which ' +
      'is a SECOND COPY of the policy: the runtime would keep using it after XC retuned the file, ' +
      'while every gate went on grading the file and reporting agreement. RepIDConfig produced ' +
      'exactly this shape once — an unreadable threshold silently became 5000, LOWERING the bar',
    find: "  const builderFloor = d.authority?.builder_floor;",
    replace: "  const builderFloor = d.authority?.builder_floor ?? 500;",
  },
  {
    id: 'authority-unknown-collateral-spends-as-zero-stake',
    suite: 'check:authority-runtime',
    file: 'lib/trustshell/authority-policy.ts',
    protects:
      'unknown collateral is NOT_CHECKED and grants nothing. The mutant reports it as MEASURED, ' +
      'which is a different claim — "we could not read the backing" becomes "there is no ' +
      'backing", and the two must not resolve to one spending decision by accident. Targets the ' +
      'RETURN rather than the guard: `if (false)` on the guard defeats TypeScript narrowing and ' +
      'the mutant stops compiling, which is INVALID and not evidence',
    find: "      detail: 'collateral could not be measured — unknown backing is not zero backing',",
    replace: "      detail: 'collateral measured as zero',",
  },

  // -------------------------------------------------------------------------
  // docs/contracts/events.v1.json — the REAL envelope, not the stand-in
  //
  // REPLACED 2026-08-19. Three earlier entries mutated a CC-authored stand-in's
  // structure (`lands_on_axis`, an iota ladder, a duplicated lambda_sigma). GA's
  // real file landed on main via #105 and is an EVENT ENVELOPE that deliberately
  // does NOT restate the policy's constants — so all three find-strings vanished
  // and the run reported DRIFT, which is that outcome doing its job. Retargeted
  // at the envelope invariants the real file actually holds.
  // -------------------------------------------------------------------------
  {
    id: 'contract-decay-can-add-repid',
    suite: 'check:lane-files',
    file: 'docs/contracts/events.v1.json',
    protects:
      'DORMANCY_DECAY carries `maximum: 0` on delta and repid_delta_applied — decay can only ever ' +
      'be negative. The mutant lifts the cap, so a decay event can carry a POSITIVE delta: a ' +
      'reward wearing a decay label, which no downstream reader would question because the event ' +
      'type says decay',
    find: '"delta": { "type": "integer", "maximum": 0 }',
    replace: '"delta": { "type": "integer", "maximum": 10000 }',
  },
  {
    id: 'contract-x402-loses-the-stake-denial',
    suite: 'check:lane-files',
    file: 'docs/contracts/events.v1.json',
    protects:
      'the x402 gate distinguishes DENIED_NO_STAKE from DENIED_AUTHORITY_EXCEEDED. The mutant ' +
      'collapses them, so an agent denied for having no collateral and one denied for exceeding ' +
      'its ceiling get the same answer — a denial nobody can act on, and the two have opposite ' +
      'remedies',
    find: '"DENIED_NO_STAKE"',
    replace: '"DENIED_AUTHORITY_EXCEEDED"',
  },
  {
    id: 'contract-delta-accepts-float',
    suite: 'check:lane-files',
    file: 'docs/contracts/events.v1.json',
    protects:
      'applied delta and repid_delta_applied are JSON integers. Reverting DORMANCY_DECAY.delta ' +
      'to type number lets a float ledger write pass the envelope — the exact drift the ' +
      'integer-delta rule exists to forbid',
    find: '"delta": { "type": "integer", "maximum": 0 }',
    replace: '"delta": { "type": "number", "maximum": 0 }',
  },

  // NOT REGISTERED — `portable-alias-creeps-back`, rejected 2026-08-19.
  //
  // The invariant is real and load-bearing: no module reachable from
  // `portable.ts` may import through `@/`, because `paths` is compile-time only
  // and the emitted `require("@/lib/...")` is unresolvable by Node. The mutation
  // that breaks it — aliasing a value import in `identity/spine.ts` — is also
  // real: the repo's own `tsc --noEmit` still reports 0 errors with it applied,
  // so it is a mutant that compiles.
  //
  // It cannot be SCORED here. `mutate.mjs` marks a run INVALID when the suite's
  // output matches /error TS\d+/ or /Cannot find (module|name)/, on the sound
  // rule that a mutant which does not compile is not evidence — and
  // `check:portable-surface` is the one suite whose SUBJECT is a compile
  // failure. Its correct red is indistinguishable from a broken build, and
  // rewording tsc's prose until the heuristic stops matching would be evading
  // the detector, not clarifying a message.
  //
  // Recorded rather than registered, the same disposition as the non-terminating
  // `i += 2` mutation on `buildGroup`. The invariant is still protected — by the
  // suite's first assertion, which fails with the full diagnostics naming every
  // import that only resolves because of the alias. What is missing is mutation
  // EVIDENCE for it, and saying so is better than a green entry that never ran.

  {
    id: 'portable-barrel-stops-reexporting',
    suite: 'check:portable-surface',
    file: 'lib/trustshell/index.ts',
    protects:
      'the app barrel re-exports the whole portable surface. The mutant drops the re-export, ' +
      'and every consumer of @/lib/trustshell silently loses ~100 names at once — the split ' +
      'is supposed to be invisible to them, and this is what keeps it so',
    find: "export * from './portable';",
    replace: "// export * from './portable';",
  },

  // -------------------------------------------------------------------------
  // lib/trustshell/pay-auth.ts — shipped in observe mode, and it must stay that way
  // -------------------------------------------------------------------------
  {
    id: 'pay-auth-defaults-to-enforcing',
    suite: 'check:pay-auth',
    file: 'lib/trustshell/pay-auth.ts',
    protects:
      'the mode defaults to OBSERVE. The mutant enforces unless told otherwise, which denies ' +
      'every existing caller of a live payment route the moment it deploys — and nobody can yet ' +
      'say how many that is, which is the entire reason this ships in observe mode',
    find: "  return env.PAY_AUTH_MODE === 'enforce' ? 'enforce' : 'observe';",
    replace: "  return env.PAY_AUTH_MODE === 'observe' ? 'observe' : 'enforce';",
  },
  {
    id: 'pay-auth-observe-allow-looks-like-a-pass',
    suite: 'check:pay-auth',
    file: 'lib/trustshell/pay-auth.ts',
    protects:
      'an observe-mode allow SAYS so. The mutant returns the bare verdict text, so an ' +
      'unauthenticated request that was let through reads identically to one that verified — ' +
      'the same defect as a BFT `passed:true` with `evaluated:false`, in the auth field',
    find: "        ? `${verdict.detail} — ALLOWED because PAY_AUTH_MODE is observe; this would be denied under enforce`",
    replace: '        ? verdict.detail',
  },
  {
    id: 'pay-auth-unconfigured-secret-opens-the-door',
    suite: 'check:pay-auth',
    file: 'lib/trustshell/pay-auth.ts',
    protects:
      'NOT_CHECKED denies under enforcement. The mutant treats "no secret configured" as a pass, ' +
      'so deleting an environment variable disables authentication silently — an open door ' +
      'reached by a missing config, which is the failure this repo names most often',
    find: '  const wouldDeny = verdict.outcome !== \'VERIFIED\';',
    replace: '  const wouldDeny = verdict.outcome === \'FAILED\';',
  },
  {
    id: 'pay-auth-timestamp-not-signed',
    suite: 'check:pay-auth',
    file: 'lib/trustshell/pay-auth.ts',
    protects:
      'the timestamp is bound INTO the signature. The mutant signs the body alone, so a captured ' +
      'signature stays valid forever — resend it with a fresh timestamp and the freshness window ' +
      'becomes decorative',
    find: '  return `${timestamp}.${body}`;',
    replace: '  return body;',
  },
  {
    id: 'pay-auth-digest-compare-leaks-timing',
    suite: 'check:pay-auth',
    file: 'lib/trustshell/pay-auth.ts',
    protects:
      'digest comparison accumulates over every byte. The mutant returns on the first mismatch, ' +
      'so how long the check takes reveals how many leading bytes were right — enough to recover ' +
      'a valid signature one byte at a time',
    find: '  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);',
    replace: '  for (let i = 0; i < a.length; i++) { if (a.charCodeAt(i) !== b.charCodeAt(i)) return false; }',
  },

  // -------------------------------------------------------------------------
  // lib/trustshell/regulatory-claims.ts — the statement with the highest cost
  // of being wrong
  // -------------------------------------------------------------------------
  {
    id: 'regulatory-empty-window-reports-full-compliance',
    suite: 'check:regulatory-claims',
    file: 'lib/trustshell/regulatory-claims.ts',
    protects:
      'a rate over an EMPTY set is undefined — not 100%. The mutant restores the fallback that ' +
      'shipped for this endpoint\'s entire existence: measured 2026-08-19, 0 receipts in 24h and ' +
      '12 all time, every one with bft_passed NULL, so the denominator has never been anything ' +
      'but zero and the route always published perfect compliance from no data',
    find: '  if (total <= 0) {',
    replace: '  if (total < 0) {',
  },
  {
    id: 'regulatory-mica-met-without-a-consensus',
    suite: 'check:regulatory-claims',
    file: 'lib/trustshell/regulatory-claims.ts',
    protects:
      'MiCA Art. 68 is about controls that DEMONSTRABLY prevent unauthorized transactions. The ' +
      'mutant reports it MET when transactions exist but no consensus ever ran — which is the ' +
      'live shape exactly (12 receipts, 12 unevaluated), and is the hardcoded `true` returning ' +
      'through a function call instead of a literal',
    find: '      if (e.evaluatedConsensusCount === 0) {',
    replace: '      if (e.evaluatedConsensusCount < 0) {',
  },
  {
    id: 'regulatory-partial-custody-reads-as-ready',
    suite: 'check:regulatory-claims',
    file: 'lib/trustshell/regulatory-claims.ts',
    protects:
      'GENIUS Act readiness needs custody verified for EVERY transacting agent. The mutant lets ' +
      'one verified agent carry the claim for all of them — "mostly compliant" published as ' +
      'compliant, which is the two-outcome collapse in the field where it costs most',
    find: '      if (e.humanCustodyVerifiedCount < e.agentCount) {',
    replace: '      if (e.humanCustodyVerifiedCount === 0) {',
  },
  {
    id: 'regulatory-all-met-ignores-not-checked',
    suite: 'check:regulatory-claims',
    file: 'lib/trustshell/regulatory-claims.ts',
    protects:
      'allClaimsMet requires every claim to be MET. The mutant counts NOT_CHECKED as good enough, ' +
      'so a system that measured nothing reports full compliance — the exact failure this module ' +
      'replaced, rebuilt out of the three-outcome type that was supposed to prevent it',
    find: "  return claims.length > 0 && claims.every((c) => c.status === 'MET');",
    replace: "  return claims.length > 0 && claims.every((c) => c.status !== 'NOT_MET');",
  },
  // ── check:throughput — quorum diversity ───────────────────────────────────
  {
    id: 'diversity-member-loss-never-detected',
    suite: 'check:throughput',
    file: 'lib/trustshell/throughput/ledger.ts',
    protects:
      'a lost quorum member is reported AT ALL. This is the two days of warning that sat ' +
      'unread in hal_classifications.model: gemini went 2,653 → 0 on 07-14 while total volume ' +
      'did NOT move, because the surviving providers absorbed the load. A row count is blind ' +
      'to it by construction, every liveness check was green, and the earliest volume-based ' +
      'alarm was 07-16 — two days late',
    find: '  if (missing.length > 0) {',
    replace: '  if (missing.length > 99) {',
  },
  {
    id: 'diversity-member-loss-reported-as-quiet',
    suite: 'check:throughput',
    file: 'lib/trustshell/throughput/ledger.ts',
    protects:
      'MEMBER_LOST wakes a human. A capability loss that is detected and then filed quietly is ' +
      'the same outcome as not detecting it — 39,788 SURVIVOR ALERTs sat at status pending ' +
      'because no consumer ever existed',
    find: "  'CANARY_ONLY',\n  'MEMBER_LOST',\n];",
    replace: "  'CANARY_ONLY',\n];",
  },
  {
    id: 'diversity-thin-baseline-judged-anyway',
    suite: 'check:throughput',
    file: 'lib/trustshell/throughput/ledger.ts',
    protects:
      'a short baseline refuses to judge. With three days of history a member that was NEVER ' +
      'seen is indistinguishable from one just lost, and reporting the first as MEMBER_LOST is ' +
      'a false alarm — a gate that cries wolf is one people route around',
    find: '  if (o.baselineDays < minDays) {',
    replace: '  if (o.baselineDays < -1) {',
  },
  {
    id: 'diversity-paused-producer-cries-wolf',
    suite: 'check:throughput',
    file: 'lib/trustshell/throughput/ledger.ts',
    protects:
      'a producer declared OFF is not loud about having no members. A paused producer has no ' +
      'quorum BY DEFINITION, and reporting that as MEMBER_LOST makes the ledger cry wolf about ' +
      'its own pause — which is how the cost-pause states lose their meaning',
    find: "  if (d.state !== 'running') {\n    return out(\n      'EXPECTED_SILENCE',",
    replace: "  if (d.state === 'running') {\n    return out(\n      'EXPECTED_SILENCE',",
  },

  // ---------------------------------------------------------------------------
  // retry.ts — the retry_on predicate. Each of these turns the module into a
  // plausible-looking backoff helper that has quietly stopped making the one
  // distinction it exists to make.
  // ---------------------------------------------------------------------------
  {
    id: 'retry-budget-checked-before-predicate',
    suite: 'check:harness-retry',
    file: 'lib/trustshell/harness/retry.ts',
    protects:
      'the predicate is asked BEFORE the budget. Swapped, a permanent error arriving on ' +
      'the final attempt reports as `exhausted` — which reads as bad luck and sends the ' +
      'reader looking for more budget instead of at a request that can never succeed',
    find: '    if (!this.cfg.retryOn(failure)) {',
    replace: '    if (failure.attempt < this.cfg.maxAttempts && !this.cfg.retryOn(failure)) {',
  },
  {
    id: 'retry-idle-predicate-ignores-timeout-kind',
    suite: 'check:harness-retry',
    file: 'lib/trustshell/harness/retry.ts',
    protects:
      'retryIdleTimeoutsOnly consumes the run/idle attribution. Ignoring the kind retries a ' +
      'run timeout, spending another full budget to arrive at the same wall — and makes the ' +
      'attribution timeout.ts deliberately preserved worthless to its only consumer',
    find: "  failure.error instanceof AttemptTimeoutError && failure.error.expiry.kind === 'idle';",
    replace: '  failure.error instanceof AttemptTimeoutError;',
  },
  {
    id: 'retry-cap-applied-after-jitter',
    suite: 'check:harness-retry',
    file: 'lib/trustshell/harness/retry.ts',
    protects:
      'maxDelayMs bounds the SCHEDULE, not the pre-jitter input to it. Dropping the cap lets a ' +
      'jittered delay sit above a ceiling the caller believes is absolute',
    find: '    const capped = Math.min(raw, this.cfg.maxDelayMs);',
    replace: '    const capped = raw;',
  },
  {
    id: 'retry-trusts-out-of-range-rng',
    suite: 'check:harness-retry',
    file: 'lib/trustshell/harness/retry.ts',
    protects:
      'a misbehaving Rng cannot push the delay outside its band. Trusting next() blindly means ' +
      'the bounded-delay claim silently stops holding for any source not in [0, 1)',
    find: '    const unit = Math.min(1, Math.max(0, this.rng.next()));',
    replace: '    const unit = this.rng.next();',
  },
  {
    id: 'retry-maxattempts-off-by-one',
    suite: 'check:harness-retry',
    file: 'lib/trustshell/harness/retry.ts',
    protects:
      'maxAttempts is a TOTAL including the first try, so maxAttempts:1 never retries. Off by one ' +
      'and every configured budget silently buys one more attempt than it says',
    find: '    if (failure.attempt >= this.cfg.maxAttempts) {',
    replace: '    if (failure.attempt > this.cfg.maxAttempts) {',
  },
  // ---------------------------------------------------------------------------
  // import-specifiers.mjs — what counts as reaching a module. Both mutations
  // restore a form of under-reporting that marked modules shipped when nothing
  // imports them (#73).
  // ---------------------------------------------------------------------------
  {
    id: 'dormancy-counts-type-only-imports',
    suite: 'check:dormancy',
    file: 'scripts/lib/import-specifiers.mjs',
    protects:
      'a type-only import is erased by the compiler and cannot reach anything at runtime. ' +
      'Counting it marks a module reachable that nothing imports — under-reporting dormancy, ' +
      'which hides exactly what the gate exists to surface',
    find: '    if (TYPE_ONLY_CLAUSE.test(m[1])) continue;',
    replace: '    if (false) continue;',
  },
  {
    id: 'dormancy-counts-specifiers-in-comments',
    suite: 'check:dormancy',
    file: 'scripts/lib/import-specifiers.mjs',
    protects:
      'a specifier inside a comment is prose. Counting it is not hypothetical — the router was ' +
      'marked reachable by a comment explaining why it must not be, while building #70',
    find: "  return src.replace(/\\/\\*[\\s\\S]*?\\*\\//g, ' ').replace(/(^|[^:])\\/\\/[^\\n]*/g, '$1');",
    replace: '  return src;',
  },

  // -------------------------------------------------------------------------
  // The gate that protects the gates — .github/workflows/check.yml and the
  // checker_must_not_be_doer enforcement sites.
  // -------------------------------------------------------------------------
  {
    id: 'ci-integrity-mutate-step-removed',
    suite: 'check:ci-integrity',
    file: '.github/workflows/check.yml',
    protects:
      'the mutate job actually invokes npm run mutate. Removing the run step ' +
      '(a step whose name survives while its body is gutted, or renamed to ' +
      'skip a different script) turns 123+ "protects:" claims in this very ' +
      'file into comments nobody runs, with a green CI tick as cover',
    find: '        run: npm run mutate',
    replace: '        run: echo "mutation gate skipped"',
  },
  {
    id: 'ci-integrity-mutate-softened',
    suite: 'check:ci-integrity',
    file: '.github/workflows/check.yml',
    protects:
      'the mutate job is not softened with continue-on-error. This is the exact ' +
      'failure mode named in the job\'s own comment: "No continue-on-error and ' +
      'no || true: this job is allowed to fail the run" — a one-line addition ' +
      'that lets every SURVIVED mutation report green',
    find: '  mutate:\n    runs-on: ubuntu-latest',
    replace: '  mutate:\n    runs-on: ubuntu-latest\n    continue-on-error: true',
  },
  {
    id: 'ci-integrity-restore-check-removed',
    suite: 'check:ci-integrity',
    file: '.github/workflows/check.yml',
    protects:
      'the tree-restore verification step survives beside the mutate step. ' +
      'Without it, a mutation runner that corrupts the working tree on exit ' +
      '(the exact failure this session hit locally when two invocations ' +
      'collided) goes undetected in CI rather than failing the run',
    find: '      - name: sources restored\n        run: git diff --exit-code',
    replace: '',
  },
  {
    id: 'ci-integrity-spine-guard-removed',
    suite: 'check:ci-integrity',
    file: 'lib/trustshell/identity/spine.ts',
    protects:
      'THE ONE THE COMMENT ITSELF WARNS ABOUT. spine.ts\'s checker_must_not_be_doer ' +
      'guard exists BECAUSE "a constitutional invariant should not rest on one ' +
      'call site" — removing this one, leaving the other three (work-contract.ts, ' +
      'checker-assignment.ts, auditor-grant.ts) intact, is precisely the partial ' +
      'regression normal test coverage is worst at catching, since three of four ' +
      'call sites still pass everything',
    find:
      "  if (assigned.unsigned.checkerDid === assignment.doerDid) {\n" +
      "    throw new Error(\n" +
      "      'checker_must_not_be_doer: the drawn checker is the doer. This is ' +\n" +
      "        'constitutional and no setting may relax it.'\n" +
      "    );\n" +
      "  }",
    replace: '  // checker_must_not_be_doer guard removed',
  },
  {
    id: 'ci-integrity-assignment-exclusion-unnamed',
    suite: 'check:ci-integrity',
    file: 'lib/trustshell/identity/checker-assignment.ts',
    protects:
      'the doer-exclusion in eligiblePool stays NAMED as checker_must_not_be_doer, ' +
      'not merely present as an unexplained comparison. A future refactor that ' +
      'keeps the exclusion but drops the name is how this invariant stops being ' +
      'discoverable by anyone grepping for it — including this very gate',
    find: '  /** Excluded unconditionally. `checker_must_not_be_doer`, applied at selection. */',
    replace: '  /** Excluded unconditionally. */',
  },
  {
    id: 'ci-integrity-work-contract-guard-removed',
    suite: 'check:ci-integrity',
    file: 'lib/trustshell/identity/work-contract.ts',
    protects:
      'assertContractSane still refuses a contract whose doer and checker are ' +
      'the same identity. This is the FIRST of the four independent ' +
      'checker_must_not_be_doer sites — a contract that never reaches this ' +
      'check has nothing left upstream of it in the identity spine',
    find:
      "  if (sameDid(c.doerDid, c.checkerDid)) {\n" +
      "    throw new Error(\n" +
      "      `the doer and the checker are the same identity (${c.doerDid}). ` +\n" +
      "        'verification.checker_must_not_be_doer is constitutional — no layer may waive it.'\n" +
      "    );\n" +
      "  }",
    replace: '  // checker_must_not_be_doer guard removed',
  },
  {
    id: 'ci-integrity-auditor-grant-guard-removed',
    suite: 'check:ci-integrity',
    file: 'lib/trustshell/identity/auditor-grant.ts',
    protects:
      'an auditor still cannot hold a grant to audit the very agent it is. ' +
      'This is the fourth checker_must_not_be_doer site — auditor-grant.ts\'s ' +
      'own comment names it as getting the SAME constitutional guarantee "by ' +
      'comparing DIDs instead of trusting a flag", which this mutation removes',
    find:
      "  if (sameDid(input.auditor.did, input.doerDid)) {\n" +
      "    throw new Error(\n" +
      "      `the auditor and the doer are the same identity (${input.auditor.did}). ` +\n" +
      "        'verification.checker_must_not_be_doer is constitutional; an agent may not hold a ' +\n" +
      "        'grant to audit itself.'\n" +
      "    );\n" +
      "  }",
    replace: '  // checker_must_not_be_doer guard removed',
  },
  // lib/trustshell/verdict-provenance.ts — P2, the Gate 2 schema blocker
  // -------------------------------------------------------------------------
  {
    id: 'provenance-null-reads-as-unearned',
    suite: 'check:verdict-provenance',
    file: 'lib/trustshell/verdict-provenance.ts',
    protects:
      'ABSENT provenance is NOT_CHECKED, never a finding of "unearned". Every event on the ' +
      'live scoring path has null provenance today, so reading null as false would ' +
      'manufacture ~70,000 accusations out of a missing column — a fabricated finding at ' +
      'scale, worse than the gap it claims to describe',
    find: '  if (event.providerAttempted === null || event.providerAttempted === undefined) {',
    replace: '  if (event.providerAttempted === undefined) {',
  },
  {
    id: 'provenance-untraceable-counts',
    suite: 'check:verdict-provenance',
    file: 'lib/trustshell/verdict-provenance.ts',
    protects:
      'an event whose provenance cannot be established must NOT move a reputation score. ' +
      'NOT_CHECKED and FAILED are different facts with the same consequence, and letting ' +
      'the first one through is how "we could not tell" becomes "it passed"',
    find: "      outcome: 'NOT_CHECKED',\n      countsTowardScore: false,",
    replace: "      outcome: 'NOT_CHECKED',\n      countsTowardScore: true,",
  },
  // `provenance-abstention-punished` lived here until 2026-08-17. It pointed at
  // `if (event.vetoed && event.providerAttempted === false)`, which the ordering
  // fix dissolved — `vetoed` is now tested first, so that conjunction no longer
  // exists and the runner correctly reported DRIFT rather than a pass.
  //
  // The invariant it protected — "only actionable verdicts stake" — is NOT gone;
  // it moved to the `!event.vetoed` early return, where the two mutants below
  // point at it directly. Deleted rather than re-pointed at a contrived target,
  // because a mutant aimed at a line chosen to make it compile tests the line,
  // not the invariant.
  {
    id: 'provenance-null-checked-before-vetoed',
    suite: 'check:verdict-provenance',
    file: 'lib/trustshell/verdict-provenance.ts',
    protects:
      'ORDER: `vetoed` is tested BEFORE provenance, so a NON-ACTIONABLE event owes no ' +
      'evidence. This mutant reinstates the original bug — demanding provenance from an ' +
      'event that stakes nothing — which drops 82,459 of 152,482 observation rows (54.1%), ' +
      'including 100% of the x402 and latency arms, neither of which has a provider concept ' +
      'to record. It deletes the positive evidence and keeps the accusations, and every ' +
      'assertion that existed before 2026-08-17 stayed green through it',
    find: '  if (!event.vetoed) {',
    replace: '  if (!event.vetoed && event.providerAttempted !== null && event.providerAttempted !== undefined) {',
  },
  {
    id: 'provenance-nonactionable-does-not-count',
    suite: 'check:verdict-provenance',
    file: 'lib/trustshell/verdict-provenance.ts',
    protects:
      'a non-actionable observation MAY move a score. It is the positive evidence — the ' +
      'clean runs, the settled payments, the recorded latencies — and a reputation system ' +
      'that counts only the failures is not a reputation system',
    find: "      outcome: 'VERIFIED',\n      countsTowardScore: true,\n      detail:\n        'a non-actionable verdict; nothing is staked either way",
    replace: "      outcome: 'VERIFIED',\n      countsTowardScore: false,\n      detail:\n        'a non-actionable verdict; nothing is staked either way",
  },
  {
    id: 'provenance-near-miss-column-accepted',
    suite: 'check:verdict-provenance',
    file: 'lib/trustshell/verdict-provenance.ts',
    protects:
      'a column that merely SOUNDS like provenance does not satisfy the gate. Substring ' +
      'matching would let a column named `provider` declare Gate 2 unblocked while carrying ' +
      'nothing about whether one was attempted',
    find: '  const found = PROVENANCE_COLUMN_CANDIDATES.filter((c) => columns.includes(c));',
    replace: '  const found = PROVENANCE_COLUMN_CANDIDATES.filter((c) => columns.some((col) => c.includes(col)));',
  },
  {
    id: 'provenance-parser-moved-callsite-reads-as-blocked',
    suite: 'check:verdict-provenance',
    file: 'scripts/check-verdict-provenance.mjs',
    protects:
      '"could not look" must not collapse into "found nothing". If the scorer query moves or ' +
      'is renamed, the parser returns ok:false and the gate FAILS. Letting it return an empty ' +
      'column list instead would make describeLinkage report NOT_CHECKED — the exact blocker ' +
      'this gate was written to report, reached by not looking, and indistinguishable from ' +
      'the real thing in the output',
    find: "    return { ok: false, columns: [], detail: `no \\`.from('${VIEW}')\\` in ${REPO_SRC}` };",
    replace: "    return { ok: true, columns: [], detail: `no \\`.from('${VIEW}')\\` in ${REPO_SRC}` };",
  },
  {
    id: 'provenance-linkage-always-verified',
    suite: 'check:verdict-provenance',
    file: 'lib/trustshell/verdict-provenance.ts',
    protects:
      'the linkage report is derived from the columns actually present. A gate that reports ' +
      'VERIFIED regardless is the unearned green this whole repository is organised against, ' +
      'in the gate written to report a blocker',
    find: '  if (found.length > 0) {',
    replace: '  if (found.length >= 0) {',
  },

  // -------------------------------------------------------------------------
  // lib/trustshell/EarnedMetricsRepo.ts — the "consume" half of Gate 2:
  // integrityObservations() / annotateProvenance(), wired 2026-08-17 per the
  // operator's review on PR #94.
  // -------------------------------------------------------------------------
  {
    id: 'earned-metrics-repo-clean-rows-demand-provenance',
    suite: 'check:earned-metrics-repo',
    file: 'lib/trustshell/EarnedMetricsRepo.ts',
    protects:
      'only ACTIONABLE catches (success === false) demand provenance. Checking success after ' +
      'provenanceOf is called with the wrong `vetoed` value would exclude clean rows lacking a ' +
      'provider — 55,616 of 149,258 rows in the measured window, the positive evidence rather ' +
      'than the accusations, which is the exact defect this module\'s header retracts',
    find: '    const verdict = provenanceOf({ vetoed: !success, providerAttempted });',
    replace: '    const verdict = provenanceOf({ vetoed: true, providerAttempted });',
  },
  {
    id: 'earned-metrics-repo-excluded-rows-leak-through',
    suite: 'check:earned-metrics-repo',
    file: 'lib/trustshell/EarnedMetricsRepo.ts',
    protects:
      'a row provenanceOf excludes must never reach measureRate. The `continue` is the only ' +
      'thing stopping an untraceable or unearned catch from being pushed into `observations` ' +
      'anyway, silently undoing the entire point of wiring provenanceOf in',
    find: '      if (verdict.outcome === \'NOT_CHECKED\') excludedUntraceable += 1;\n      else excludedUnearned += 1;\n      continue;',
    replace: '      if (verdict.outcome === \'NOT_CHECKED\') excludedUntraceable += 1;\n      else excludedUnearned += 1;',
  },
  {
    id: 'earned-metrics-repo-zero-providers-read-as-attempted',
    suite: 'check:earned-metrics-repo',
    file: 'lib/trustshell/EarnedMetricsRepo.ts',
    protects:
      '`quorum_providers_used = 0` must mean no provider attempted, not "at least one". Using ' +
      '>= 0 instead of > 0 would make every zero-provider catch read as earned — the 2,443-row ' +
      'population `refusesToIssue` exists to gate would silently pass',
    find: '    const providerAttempted = raw === null || raw === undefined ? null : Number(raw) > 0;',
    replace: '    const providerAttempted = raw === null || raw === undefined ? null : Number(raw) >= 0;',
  },
  {
    id: 'earned-metrics-repo-annotate-fires-with-nothing-excluded',
    suite: 'check:earned-metrics-repo',
    file: 'lib/trustshell/EarnedMetricsRepo.ts',
    protects:
      'annotateProvenance must be a no-op when nothing was excluded — appending an empty note ' +
      'to every agent\'s reason string, including the vast majority with zero exclusions, would ' +
      'bury the signal this note exists to surface',
    find: '  if (total === 0) return metric;',
    replace: '  if (total < 0) return metric;',
  },
  {
    id: 'fixture-accepts-a-rejected-run',
    suite: 'check:trust-harness-fixture',
    file: 'scripts/trust-harness-fixture.mjs',
    protects:
      'a doer that reports success and an evaluator that rejects must surface FAILED. ' +
      'Collapsing the reject path into VERIFIED would make the fixture a certificate ' +
      'factory — the exact overclaim the status doc exists to prevent',
    find: "  eq(out.loop.outcome, 'FAILED', 'independent judge overrules the agent');",
    replace: "  eq(out.loop.outcome, 'VERIFIED', 'independent judge overrules the agent');",
  },
  {
    id: 'fixture-allows-self-judge',
    suite: 'check:trust-harness-fixture',
    file: 'scripts/trust-harness-fixture.mjs',
    protects:
      'checker_must_not_be_doer is the product claim. If the false-path attempt is ' +
      'allowed to certify, the fixture would green-light the one constitutional ' +
      'failure the harness is built to make loud',
    find: "  truthy(threw, 'a doer-as-checker pool must refuse, never certify');",
    replace: "  truthy(!threw, 'a doer-as-checker pool must refuse, never certify');",
  },
  {
    id: 'fixture-accepts-an-amended-contract',
    suite: 'check:trust-harness-fixture',
    file: 'scripts/trust-harness-fixture.mjs',
    protects:
      'a verdict bound to contract A must not remain bound after the contract is amended. ' +
      'Treating boundToContract as true here would certify work against a contract nobody signed',
    find: "  eq(v.boundToContract, false, 'amending the contract after work must unbind the verdict');",
    replace: "  eq(v.boundToContract, true, 'amending the contract after work must unbind the verdict');",
  },
  {
    id: 'fixture-outage-certifies',
    suite: 'check:trust-harness-fixture',
    file: 'scripts/trust-harness-fixture.mjs',
    protects:
      'an evaluator outage must not certify. Inverting this assertion would make a throw look like VERIFIED',
    find: "  eq(out.loop.outcome === 'VERIFIED', false, 'an outage is not an accept');",
    replace: "  eq(out.loop.outcome === 'VERIFIED', true, 'an outage is not an accept');",
  },
  {
    id: 'pay-approves-without-contracted-path',
    suite: 'check:live-callers',
    file: 'lib/trustshell/identity/payment-contract.ts',
    protects:
      'a payment must not approve unless the contracted path invoked an independent ' +
      'evaluator. Returning true from mayApproveAfterContract unconditionally is the ' +
      'silent skip the live-caller claim exists to close',
    find: '    d.invoked === true &&\n    d.outcome === \'VERIFIED\' &&\n    d.boundToPayment === true &&\n    d.checkerDid !== d.doerDid',
    replace: '    true',
  },
  {
    id: 'pay-approves-a-failed-evaluation',
    suite: 'check:live-callers',
    file: 'lib/trustshell/identity/payment-contract.ts',
    protects:
      'an evaluator REJECT is not an approval. Collapsing FAILED into VERIFIED would ' +
      'make /pay a certificate factory — the same overclaim the fixture already forbids',
    find: "    result.loop.outcome === 'VERIFIED' && verdict.outcome === 'VERIFIED' ? 'VERIFIED' : 'FAILED';",
    replace: "    'VERIFIED';",
  },
  {
    id: 'pay-route-skips-contracted-gate',
    suite: 'check:live-callers',
    file: 'app/api/trustrails/pay/route.ts',
    protects:
      'L3 wiring: /pay must call evaluateContractedPayment. Deleting the call is the ' +
      'original gap — exists-but-not-on — and must go red',
    find: '    if (!mayApproveAfterContract(contracted)) {',
    replace: '    if (false) {',
  },
  {
    id: 'review-route-skips-session',
    suite: 'check:live-callers',
    file: 'app/api/trustshell/review/route.ts',
    protects:
      '/review is the production Evaluator caller. If POST stops calling runReviewSession ' +
      'the surface is a comment',
    find: '    outcome = await runReviewSession({',
    replace: "    outcome = { status: 'ACCEPTED', awaitingRevision: false, rounds: [] }; void ({",
  },
  {
    id: 'provenance-skips-refuses-to-issue',
    suite: 'check:verdict-provenance',
    file: 'lib/trustshell/verdict-provenance.ts',
    protects:
      'refusesToIssue must be the issuer-stake function, not an inlined lookalike that ' +
      'can drift. Replacing the call with false lets an unearned veto move a score',
    find: '      refusesToIssue({\n        providerAttempted: false,\n        vetoed: event.vetoed,\n      })',
    replace: '      false',
  },

  // -------------------------------------------------------------------------
  // lib/mcp/fleet.ts — the MCP tool server's authority gate (MCP-001).
  //
  // The tool menu a principal is shown (toolsFor) and the tools it can actually
  // run (executeTool's write gate) are computed in two places. MCP-001 pins them
  // equal, so a caller can never run a mutating tool it was never advertised — the
  // AI-Infra-Guard `mcp_tool_rug_pull` / `mcp_excessive_permissions` threat, on an
  // endpoint holding the service key. This mutation removes the write gate: the
  // write tools stay HIDDEN from the user's tools/list but become EXECUTABLE by a
  // user, which is precisely the rug-pull the probe drives handleRpc to catch. It
  // stays a valid, compiling program (a dead branch, not deleted code), so the
  // runner scores it CAUGHT rather than INVALID.
  // -------------------------------------------------------------------------
  {
    id: 'mcp-write-gate-removed',
    suite: 'check:redteam',
    file: 'lib/mcp/fleet.ts',
    protects:
      'a write tool is service-only on BOTH surfaces. Dropping the executeTool authority ' +
      'check leaves register_node / heartbeat_node absent from the user menu yet runnable by ' +
      'a user — a tool the client never approved mutating the fleet registry through the ' +
      'service key. This is the MCP rug-pull MCP-001 exists to make impossible',
    find: "  if (writeNames.has(name) && ctx.principal !== 'service') {",
    replace: '  if (writeNames.has(name) && false) {',
  },

  // -------------------------------------------------------------------------
  // scripts/redteam/probes/zkrepid-anchor-integrity.mjs — ANCHOR-001.
  //
  // The probe judges whether every EAS-attested zk proof resolves to a real
  // anchored batch; it BREACHES today over 100 hollow attestations and that
  // finding is carried in ledger.json (KNOWN_OPEN). This mutation removes the
  // probe's failure detection so it can no longer see ANY hollow attestation.
  // The probe then returns HELD while ledger.json still lists ANCHOR-001 open —
  // which the runner scores LEDGER_STALE and FAILS (a security record that
  // claims a closed hole hides the regression if it reopens). So a probe that
  // stops detecting is caught by the same mechanism that catches a fixed-but-
  // still-ledgered finding: the detection is load-bearing in both directions.
  // -------------------------------------------------------------------------
  {
    id: 'anchor-detection-removed',
    suite: 'check:redteam',
    file: 'scripts/redteam/probes/zkrepid-anchor-integrity.mjs',
    protects:
      'ANCHOR-001 actually detects a hollow on-chain attestation. Neutering its failure filter makes ' +
      'it report HELD over 100 proofs whose attestation UID anchors nothing — and because the finding ' +
      'is ledgered, that HELD is a stale-ledger FAIL, so "every attested proof is anchored" can never ' +
      'quietly come to mean "every attested proof carries a string"',
    find: '].filter(([, n]) => Number(n) > 0);',
    replace: '].filter(() => false);',
  },

  // -------------------------------------------------------------------------
  // scripts/redteam/probes/task-status-integrity.mjs — EVERGREEN-002.
  //
  // The probe BREACHES today over 10 trinity_tasks marked done/verified whose own
  // result self-declares FAILED/PENDING or fabricates the abc123 dummy commit; the
  // finding is carried in ledger.json (KNOWN_OPEN). This mutation neuters the
  // detection threshold so a real contradiction no longer trips it. The probe then
  // returns HELD while ledger.json still lists EVERGREEN-002 open — LEDGER_STALE,
  // which FAILS the suite. So a detector that stops firing is caught by the same
  // rule that catches a fixed-but-still-ledgered finding.
  // -------------------------------------------------------------------------
  {
    id: 'evergreen2-detection-disabled',
    suite: 'check:redteam',
    file: 'scripts/redteam/probes/task-status-integrity.mjs',
    protects:
      'EVERGREEN-002 actually fires on a status/content contradiction. Raising the trip threshold ' +
      'past the real count makes it report HELD over tasks marked done while their own result says ' +
      'FAILED/PENDING — and because the finding is ledgered, that HELD is a stale-ledger FAIL, so ' +
      '"done means done" can never quietly come to mean "done means a row said done"',
    find: 'if (contradicted > 0) {',
    replace: 'if (contradicted > 999) {',
  },

  // -------------------------------------------------------------------------
  // lib/trustshell/kernel — the trust microkernel core (KERNEL-001 / check:kernel-envelope)
  // -------------------------------------------------------------------------
  {
    id: 'kernel-default-deny-removed',
    suite: 'check:kernel-envelope',
    file: 'lib/trustshell/kernel/policy.ts',
    protects:
      'DEFAULT-DENY. An action is ALLOWed only when an explicit grant covers its capability. ' +
      'Neutering the grant check lets any ungranted capability fall through to ALLOW — the ' +
      'classic authorization fail-open (a missing branch defaulting to yes), inside the gate ' +
      'built to make that impossible',
    find: '  if (!granted.includes(envelope.capability)) {',
    replace: '  if (false) {',
  },
  {
    id: 'kernel-gate-runs-on-any-verdict',
    suite: 'check:kernel-envelope',
    file: 'lib/trustshell/kernel/gate.ts',
    protects:
      'THE GATE RUNS THE ACTION ONLY ON ALLOW. Widening the ALLOW branch to also fire on VERIFY ' +
      'means a high-risk action whose evidence has not cleared still runs the side effect — the ' +
      'fail-open the whole "models propose, TrustShell disposes" boundary exists to prevent',
    find: "  if (verdict.decision === 'ALLOW') {",
    replace: "  if (verdict.decision === 'ALLOW' || verdict.decision === 'VERIFY') {",
  },
  {
    id: 'kernel-laws-not-enforced',
    suite: 'check:kernel-envelope',
    file: 'lib/trustshell/kernel/kernel-laws.ts',
    protects:
      'THE IMMUTABLE KERNEL LAWS ACTUALLY FIRE. Making kernelLawViolated always return null ' +
      'lets a granted capability buy past no-secret-exposure / no-privilege-self-escalation / etc — ' +
      'the exact self-escalation and secret-exfiltration a prompt-injected model would attempt, ' +
      'inside the boundary built to make it impossible',
    find: '    if (conditionMatches(law.when, norm)) return law;',
    replace: '    if (conditionMatches(law.when, norm)) return null;',
  },

  // -------------------------------------------------------------------------
  // lib/trustshell/runtime — the vertical slice (SLICE-001 / check:kernel-slice)
  // -------------------------------------------------------------------------
  {
    id: 'slice-idempotency-not-recorded',
    suite: 'check:kernel-slice',
    file: 'lib/trustshell/runtime/execute.ts',
    protects:
      'NO REPLAY / DOUBLE EXECUTION. Not recording a completed request means the next call ' +
      'with the same requestId re-runs the real side effect — the exact double-commit the ' +
      'idempotency ledger exists to prevent',
    find: '  ledger.put(envelope.requestId, receipt);\n  return { receipt, executed, replay: false };',
    replace: '  return { receipt, executed, replay: false };',
  },
  {
    id: 'slice-args-binding-removed',
    suite: 'check:kernel-slice',
    file: 'lib/trustshell/runtime/execute.ts',
    protects:
      'ARGS-BINDING. Skipping the argsHash check lets the executor act on arguments swapped ' +
      'after authorization — the Envelope authorized one thing, a different thing runs',
    find: '  if (hashArgs(input.args) !== envelope.argsHash) {',
    replace: '  if (false) {',
  },
  {
    id: 'slice-path-safety-removed',
    suite: 'check:kernel-slice',
    file: 'lib/trustshell/runtime/file-executor.ts',
    protects:
      'PATH-SAFETY. Making the containment check pass everything lets an authorized fs.write ' +
      'escape via traversal or a symlinked directory — a capability to write becomes a ' +
      'capability to write ANYWHERE (defeats both the lexical and the real-path guard)',
    find: "  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));",
    replace: '  return true;',
  },
];

export const SUITES = [...new Set(MUTATIONS.map((m) => m.suite))].sort();
