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
      '52 VERIFIED — LESSONS A25. The fast suite pins the regex so the next break surfaces ' +
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
];

export const SUITES = [...new Set(MUTATIONS.map((m) => m.suite))].sort();
