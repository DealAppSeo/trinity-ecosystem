#!/usr/bin/env node
//
// check-probes.mjs — you may not say what an external artifact DOES until you
// have run it.
//
//   npm run check:probes
//   npm run check:probes -- --stale 180   also report probes older than N days
//
// ============================================================================
// THE FAILURE THIS CLOSES
// ============================================================================
//
// Three TrustShell milestones in a row were specified against packages that do
// something else entirely. Each cost a rebuild. Each was ONE `npm install` away
// from being known:
//
//   §8   "@hyperdag/proof-verifier@0.2.0 verifies a receipt offline from
//         transcript_sha256 + audit_hash + signature"
//        -> it is a Plonky3 STARK verifier over {agent_id, repid_score,
//           threshold, tier}. Handed a receipt it returns `deser: io error`.
//
//   §9   "@hyperdag/trustshell@1.3.0 — core: parse, check, hash, sign"
//        "@hyperdag/trustshell-mcp@1.0.0 — the vehicle already exists"
//        -> both are the HAL/RepID SDK against a live backend. Zero occurrences
//           of `transcript`, `audit_hash` or `session_receipt` in dist/. Worse,
//           `trustshell verify` already ships meaning something incompatible, so
//           the CLI the spec proposed would have COLLIDED.
//
// Nobody was careless. The spec was written before the packages were, the world
// moved, and prose has no mechanism for going stale loudly.
//
// ============================================================================
// THE RULE, AND WHY ITS BOUNDARY IS WHERE IT IS
// ============================================================================
//
// A versioned reference — `pkg@1.2.3` — is a claim about a specific artifact.
// But two kinds of claim wear that shape, and only one is dangerous:
//
//   A DECLARED DEPENDENCY. `typescript@5.6.3` is in package.json. Its version is
//   checkable from the lockfile, it is installed in this tree, and anything said
//   about it is said about code sitting in node_modules. **Exempt.**
//
//   EVERYTHING ELSE. A versioned package this repo does NOT install is an
//   external artifact somebody described from memory or from a README. That is
//   precisely the population that burned us three times. **Requires a probe.**
//
// That boundary is mechanical, needs no natural-language guessing, and on this
// repo's corpus it flags exactly the references that were wrong and none of the
// ones that were fine.
//
// One consequence, found by this gate firing on the row that documents it: a
// METASYNTACTIC example is a versioned reference too. `pkg@1.2.3` in a sentence
// explaining the rule reads identically to a real claim, and no mechanical test
// can tell them apart without guessing. Write placeholders without a real-looking
// version — `pkg@<version>` — rather than teaching the scanner to be clever.
//
// A probe is: `[PROBED YYYY-MM-DD: what you observed]` on a line naming the
// package, in the same file. Running it and pasting what came back is the whole
// discipline. The date is there so a reader can weigh it; `--stale` reports old
// ones, but age does NOT fail the build — a document recording a historical
// measurement should not rot just because time passed.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');

// ---------------------------------------------------------------------------
// What counts as a versioned package reference
// ---------------------------------------------------------------------------

/**
 * `@scope/name@1.2.3` or `name@1.2.3`.
 *
 * The bare form requires 3+ chars and a preceding boundary that is not `/` or
 * `@`, so it does not fire inside a scoped name or a path. Prerelease and build
 * metadata are matched so `pkg@1.0.0-rc.1` is not silently exempt.
 */
const PKG_REF =
  /(?<![\w/@-])(@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z][a-z0-9._-]{2,})@(\d+\.\d+\.\d+[a-z0-9.+-]*)/gi;

const PROBE = /\[PROBED\s+(\d{4}-\d{2}-\d{2})\s*:/i;

/** Declared dependencies are exempt — see the header. */
function declaredDependencies(root) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  return new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ]);
}

/**
 * Files that legitimately name an unprobed package.
 *
 * Allowlisted BY PATH and each with a reason, following the precedent in
 * check-prior-work.mjs: deleting a historical record to satisfy a gate would
 * hide the correction, which is worse than the original error.
 */
const ALLOW = new Map([
  [
    'docs/SHIP-CHECKLIST.md',
    'release ordering names artifacts that do not exist yet by design',
  ],
]);

function markdownFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === '.next') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) markdownFiles(full, out);
    else if (entry.endsWith('.md')) out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------------------

/**
 * The whole check, as a pure-ish function of a directory.
 *
 * Parameterised by `root` for one reason: so the self-test can run the REAL
 * scanner over synthetic fixtures in a temp dir, instead of writing throwaway
 * markdown into this repo and racing whatever else is reading it. A gate whose
 * own behaviour is only ever demonstrated in somebody's shell history is the
 * failure `mutate.mjs` was written to close.
 *
 * @param {string} root         directory to scan; must contain a package.json
 * @param {number|null} staleDays  report probes older than N days (never fatal)
 */
export function scan(root, staleDays = null) {
const deps = declaredDependencies(root);
const files = markdownFiles(root).sort();

let scanned = 0;
let exempted = 0;
const violations = [];
const stale = [];
const probes = [];

for (const full of files) {
  const rel = relative(root, full);
  if (ALLOW.has(rel)) continue;

  const text = readFileSync(full, 'utf8');
  const lines = text.split('\n');

  // Collect every probe line in the file, with the package names it mentions.
  const fileProbes = [];
  for (const [i, line] of lines.entries()) {
    const m = PROBE.exec(line);
    if (m) fileProbes.push({ line: i + 1, date: m[1], text: line });
  }
  probes.push(...fileProbes.map((p) => ({ ...p, file: rel })));

  // Dedupe by PACKAGE, not by reference string. Two reasons:
  //
  //   - `@hyperdag/trustshell@1.3.0` and a bare `trustshell@1.3.0` elsewhere in
  //     the same file are one package and want one probe, not two violations.
  //     The bare form is skipped when a scoped name already seen ends with it.
  //   - `pkg@1.0.0` and `pkg@1.0.1` in one doc are the same artifact for this
  //     purpose. Demanding a re-probe per patch bump is how a gate gets routed
  //     around.
  const seen = new Set();
  for (const m of text.matchAll(PKG_REF)) {
    const [ref, name] = m;
    if (seen.has(name)) continue;
    if (!name.includes('/') && [...seen].some((s) => s.endsWith(`/${name}`))) continue;
    seen.add(name);
    scanned += 1;

    if (deps.has(name)) {
      exempted += 1;
      continue;
    }

    // A probe counts if it names this package. Matching on the bare name (not
    // the version) is deliberate: a probe of 1.3.0 still tells you what the
    // package IS when the doc later mentions 1.3.1, and demanding a re-probe per
    // patch bump is how a gate becomes something people route around.
    const bare = name.includes('/') ? name.split('/').pop() : name;
    const covered = fileProbes.find((p) => p.text.includes(name) || p.text.includes(bare));

    if (!covered) {
      const at = lines.findIndex((l) => l.includes(ref)) + 1;
      violations.push({ file: rel, line: at, ref, name });
    } else if (staleDays !== null) {
      const age = Math.floor((Date.now() - Date.parse(covered.date)) / 86_400_000);
      if (age > staleDays) stale.push({ file: rel, ref, date: covered.date, age });
    }
  }
}

  return { files, scanned, exempted, violations, stale, probes };
}

// ---------------------------------------------------------------------------
// CLI. Importing this module must not scan or exit — the self-test imports it.
// ---------------------------------------------------------------------------

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
const argv = process.argv.slice(2);
const staleDays = argv.includes('--stale') ? Number(argv[argv.indexOf('--stale') + 1]) : null;
const { files, scanned, exempted, violations, stale, probes } = scan(ROOT, staleDays);

console.log(
  `check:probes — ${files.length} markdown file(s); ${scanned} versioned package ` +
    `reference(s), ${exempted} exempt as declared dependencies; ${probes.length} probe(s) recorded.`
);

if (stale.length > 0) {
  console.log(`\n${stale.length} probe(s) older than ${staleDays} days (reported, not fatal):`);
  for (const s of stale) console.log(`  ${s.age}d  ${s.ref}  ${s.file}  (probed ${s.date})`);
}

if (violations.length > 0) {
  console.error(`\nFAILED — ${violations.length} unprobed external package reference(s):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.ref}`);
  }
  console.error(
    '\nEach of these names a versioned package this repo does NOT install, so the\n' +
      'claim around it rests on somebody\'s memory of what that package does.\n' +
      'Three TrustShell milestones were specified that way and all three were wrong.\n' +
      '\n' +
      'Install it, run it, and paste what came back:\n' +
      '\n' +
      '  [PROBED 2026-08-15: @scope/pkg@1.2.3 — <what it actually is>; <what you ran>]\n' +
      '\n' +
      'on a line naming the package, in the same file. If the reference is\n' +
      'historical and cannot be probed, allowlist the file in ALLOW with a reason.'
  );
  process.exit(1);
}

console.log('check:probes — VERIFIED. Every external package reference carries a probe.');
}
