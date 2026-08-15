#!/usr/bin/env node
//
// check-probes-selftest.mjs — does the probe gate actually fail on the thing it
// claims to catch?
//
//   npm run check:probes        runs this first, then the real scan
//   node scripts/check-probes-selftest.mjs
//
// ============================================================================
// WHY A GATE NEEDS ITS OWN GATE
// ============================================================================
//
// This repo's defining failure is a system reporting success it has not earned.
// A checker is the easiest place in a codebase for that to happen, because a
// checker that never fires and a checker that has nothing to find print the same
// line. `check:probes` printing VERIFIED is evidence only if VERIFIED is a thing
// it is capable of NOT printing.
//
// The mutation gate makes that argument for the suites it covers. It cannot
// cover this one: mutating check-probes.mjs and re-running check:probes over a
// corpus that happens to be fully probed would go green for the honest reason,
// which is exactly the vacuous-assertion trap mutate.mjs documents.
//
// So the scanner is run here against synthetic corpora with known answers. It
// runs in a temp dir rather than writing throwaway markdown into this repo,
// because a check that mutates the tree it is checking is its own kind of lie.
//
// The cases below are the ones that were wrong, nearly wrong, or deliberately
// chosen during the build — each is a decision, not a coverage exercise.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { scan } from './check-probes.mjs';

let failures = 0;
let ran = 0;

/**
 * Build a corpus, scan it, hand the result to `assert`.
 *
 * @param {string} name
 * @param {Record<string,string>} corpus  relative path -> file contents
 * @param {(r: ReturnType<typeof scan>) => string|null} assert  null = pass
 * @param {number|null} staleDays
 */
function withCorpus(name, corpus, assert, staleDays = null) {
  ran += 1;
  const root = mkdtempSync(join(tmpdir(), 'probe-selftest-'));
  try {
    // typescript is here so the declared-dependency exemption has something real
    // to exempt; the scanner reads dependencies from this file, not from ours.
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'fixture', devDependencies: { typescript: '5.6.3' } })
    );
    for (const [rel, body] of Object.entries(corpus)) {
      const full = join(root, rel);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, body);
    }
    const problem = assert(scan(root, staleDays));
    if (problem) {
      failures += 1;
      console.error(`  ✗ ${name}\n      ${problem}`);
    } else {
      console.log(`  ✓ ${name}`);
    }
  } catch (err) {
    failures += 1;
    console.error(`  ✗ ${name}\n      threw: ${err?.stack ?? err}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const names = (r) => r.violations.map((v) => v.name).sort();
const eq = (got, want) =>
  JSON.stringify(got) === JSON.stringify(want) ? null : `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`;

console.log('check:probes self-test — can the gate fail?\n');

// --- the core claim: it fires, and it stops firing for the right reason ------

withCorpus(
  'an unprobed non-dependency is a violation',
  { 'a.md': 'We use `@acme/widget@2.1.0` for the thing.\n' },
  (r) => eq(names(r), ['@acme/widget'])
);

withCorpus(
  'the same reference with a probe is not',
  {
    'a.md':
      'We use `@acme/widget@2.1.0` for the thing.\n\n' +
      '[PROBED 2026-08-15: `@acme/widget@2.1.0` — installed; it is a colour picker.]\n',
  },
  (r) => eq(names(r), [])
);

withCorpus(
  'a declared dependency needs no probe',
  { 'a.md': 'Pinned at `typescript@5.6.3`.\n' },
  (r) => (r.exempted !== 1 ? `exempted ${r.exempted}, want 1` : eq(names(r), []))
);

// --- the ways a probe could be accepted when it should not be ---------------

withCorpus(
  'a probe of a DIFFERENT package does not cover it',
  {
    'a.md':
      'We use `@acme/widget@2.1.0`.\n\n[PROBED 2026-08-15: `@acme/other@1.0.0` — ran it.]\n',
  },
  (r) => eq(names(r), ['@acme/widget'])
);

withCorpus(
  'a probe in a DIFFERENT file does not cover it — probes are file-scoped',
  {
    'a.md': 'We use `@acme/widget@2.1.0`.\n',
    'b.md': '[PROBED 2026-08-15: `@acme/widget@2.1.0` — ran it.]\n',
  },
  (r) => eq(names(r), ['@acme/widget'])
);

// The bracket here is load-bearing. The first version of this case read
// `PROBED it, honest.` with no `[`, which never reached the date check at all —
// it was really a second copy of the unprobed case wearing a different name.
// The mutation that drops the date from PROBE was caught by the staleness case
// instead, which is how the vacuity showed up.
withCorpus(
  'a bracketed PROBED with no date is not a probe',
  { 'a.md': 'We use `@acme/widget@2.1.0`. [PROBED it, honest — I ran it.]\n' },
  (r) => eq(names(r), ['@acme/widget'])
);

withCorpus(
  'a bracketed PROBED with a date but no colon is not a probe',
  { 'a.md': 'We use `@acme/widget@2.1.0`. [PROBED 2026-08-15 trust me]\n' },
  (r) => eq(names(r), ['@acme/widget'])
);

// --- the deliberate leniencies. Each is a decision that could be wrong, so
//     each is pinned: if someone tightens one, they do it on purpose. --------

withCorpus(
  'a probe of 1.3.0 covers a later mention of 1.3.1 — probes describe packages, not patches',
  {
    'a.md':
      'Was `@acme/widget@1.3.0`, now `@acme/widget@1.3.1`.\n\n' +
      '[PROBED 2026-08-15: `@acme/widget@1.3.0` — installed; it is a colour picker.]\n',
  },
  (r) => eq(names(r), [])
);

withCorpus(
  'two unprobed versions of one package are ONE violation, not two',
  { 'a.md': 'Was `@acme/widget@1.3.0`, now `@acme/widget@2.0.0`.\n' },
  (r) => (r.violations.length !== 1 ? `${r.violations.length} violations, want 1` : null)
);

withCorpus(
  'a bare name that is the tail of a scoped name already seen is the same package',
  { 'a.md': 'The SDK `@hyperdag/trustshell@1.3.0`, or just `trustshell@1.3.0`.\n' },
  (r) => (r.violations.length !== 1 ? `${r.violations.length} violations, want 1` : null)
);

withCorpus(
  'a prerelease version is not silently exempt',
  { 'a.md': 'Try `@acme/widget@1.0.0-rc.1`.\n' },
  (r) => eq(names(r), ['@acme/widget'])
);

// --- allowlist and staleness ------------------------------------------------

withCorpus(
  'an allowlisted file is skipped entirely',
  { 'docs/SHIP-CHECKLIST.md': 'Will publish `@acme/unbuilt@0.1.0`.\n' },
  (r) => eq(names(r), [])
);

withCorpus(
  'an old probe is reported stale but does NOT fail — a past measurement does not rot',
  {
    'a.md':
      'We use `@acme/widget@2.1.0`.\n\n[PROBED 2020-01-01: `@acme/widget@2.1.0` — ran it.]\n',
  },
  (r) =>
    r.stale.length !== 1
      ? `stale ${r.stale.length}, want 1`
      : eq(names(r), []),
  30
);

// --- known limit, pinned so it is a decision and not a surprise -------------
//
// A CDN URL is a versioned claim too, but the lookbehind that stops `PKG_REF`
// firing inside a scoped name also stops it after a `/`. Nothing in this repo's
// corpus needed it, and widening the pattern to catch URLs would have to
// distinguish a real reference from a path fragment. Pinned as-is: if someone
// widens it, this case turns red and they choose deliberately rather than
// discovering it in a diff.

// Found by the gate failing on the PRIOR-WORK-INDEX row that documents the gate.
// A placeholder and a claim are the same string; the fix is to write placeholders
// as `pkg@<version>`, not to teach the scanner to recognise metasyntax.
withCorpus(
  'KNOWN LIMIT: a metasyntactic `pkg@1.2.3` is scanned like a real reference',
  { 'a.md': 'Write it as `pkg@1.2.3` in your docs.\n' },
  (r) => eq(names(r), ['pkg'])
);

withCorpus(
  'KNOWN LIMIT: a version inside a URL path is not scanned',
  { 'a.md': 'Loaded from `https://esm.sh/lodash@4.17.21`.\n' },
  (r) => (r.scanned !== 0 ? `scanned ${r.scanned}, want 0 — pattern widened; update this case` : null)
);

// ---------------------------------------------------------------------------

console.log(`\n${ran - failures}/${ran} self-test case(s) passed.`);

if (failures > 0) {
  console.error(
    `\nFAILED — the probe gate does not behave as documented (${failures} case(s)).\n` +
      'Do not trust a VERIFIED from check:probes until this is green: a scanner\n' +
      'that cannot fail and a scanner with nothing to find print the same line.'
  );
  process.exit(1);
}

console.log('check:probes self-test — VERIFIED. The gate fails when it should.');
