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
];

export const SUITES = [...new Set(MUTATIONS.map((m) => m.suite))].sort();
