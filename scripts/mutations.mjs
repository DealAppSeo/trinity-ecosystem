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
      '52 VERIFIED — LESSONS A21. The fast suite pins the regex so the next break surfaces ' +
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
    id: 'hal-break-after-cutover-ignored',
    suite: 'check:hal-chain',
    file: 'lib/trustshell/hal-chain.ts',
    protects:
      'a null link AFTER the cutover is a BREAK, not adoption. Without the boundary the ' +
      'verifier cannot tell 44,769 legitimate pre-chaining rows from a live chain losing a ' +
      'link — and a check that reports 44,769 defects is a check that gets switched off',
    find: '      if (!Number.isNaN(at) && at >= cutover) {',
    replace: '      if (false) {',
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
      'collide and one audit hash cannot come to cover two different kinds of event',
    find: '    JSON.stringify(PAYMENT_AUDIT_DOMAIN),',
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
    file: 'lib/trustshell/index.ts',
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
    find: '      return null;\n    }\n    score = o.score;',
    replace: '      score = Math.min(1, Math.max(0, Number(o.score) || 0));\n    }\n    score = score ?? o.score;',
  },
];

export const SUITES = [...new Set(MUTATIONS.map((m) => m.suite))].sort();
