// scripts/check-package-boundary.mjs
//
// Can `lib/trustshell` be shipped as an npm package — and how far is it from
// being one?
//
// MVP DoD item 1 is "a portable npm TrustShell". `package.json` is
// `"private": true`, named `trustrails`, with no `main` and no `exports`, so the
// honest status of that item is **NOT CHECKED** — nothing has ever been
// published and nothing has ever measured whether it could be.
//
// ── THE CEILING, MEASURED FIRST ─────────────────────────────────────────────
//
// The standing rule is to compute the bound before optimising toward it. Two
// sprints were once spent on a component already at 97.9% of its bound. So
// before writing a single line of packaging, this asks how many modules could
// actually leave:
//
//   A. reaches OUTSIDE the package via `@/`            9   the real cost
//   B. `@/` but only self-references                    0   DONE 2026-08-19
//   C+D. npm deps only, or pure                        88  portable
//                                                     ───
//                                                      97
//
// **88 of 97 are portable, and group B is now empty.** The 14 self-aliased
// modules were rewritten to relative paths — 19 specifiers across 15 files —
// once `check:portable-surface` proved the rewrite was REQUIRED rather than
// cosmetic: `@/lib/trustshell/harness/types` does not resolve without the alias,
// so the entry point could not compile outside this repo. The whole cost of
// DoD 1 is the 8 in group A, and 7 of those reach one thing: `@/lib/supabase-admin`.
//
// Those are the stateful adapters a portable package should take by injection
// anyway, so the packaging work and the dependency-inversion work are the same
// work. That is the finding; it is much cheaper than "the package is private,
// therefore this is far away" suggested.
//
// Group A grows only on purpose. It held at 8 of 77 and then 8 of 93 across a
// 16-module merge, and went to 9 when `RewardLedger.ts` was added — a change the
// gate FAILED on before that commit landed, which is exactly the intended
// behaviour. That is why the assertion below NAMES the members rather than
// counting them: a count would have absorbed the new adapter silently, and would
// also let a real violation in whenever an old one left.
//
// ── WHY THE MATCHER IS TESTED BEFORE THE CODE IS ────────────────────────────
//
// This measurement was wrong TWICE before it was right, both times in the way
// LESSONS names — an assumption about the shape of the input:
//
//   1. `/from\s+['"]…/` over the raw source matched PROSE. Four modules were
//      reported as carrying npm dependencies because their comments contain the
//      words "authorized everything ... from". Comments must be stripped.
//   2. Anchoring to `^\s*(import|export)…from` on one line then MISSED every
//      multi-line `import {\n … \n} from 'x'` — it filed `SolanaExecutor.ts`,
//      which imports two Solana packages, as PURE. The specifier is what to
//      match, not the statement.
//   3. Even then, two template literals containing the word `from` inside an
//      error message survived as phantom dependencies.
//
// So the first assertions below drive the extractor over a fixture containing
// exactly those three shapes. A boundary check whose parser is wrong reports a
// clean boundary, which is the same class of failure as a green tick describing
// another job.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
// The extractor lives in its own module so the mutation manifest can break it
// and watch this suite go red. A parser that under-reports produces a clean
// boundary report — the same failure class as a green tick describing another job.
import { specifiersOf } from './lib/module-specifiers.mjs';

const ROOT = 'lib/trustshell';

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (p.endsWith('.ts') && !p.endsWith('.d.ts')) acc.push(p);
  }
  return acc;
}

// ── THE DECLARED BOUNDARY ───────────────────────────────────────────────────
//
// Named files, not a count. A count would let a new violation in as long as an
// old one left, which is how a budget becomes a ratchet in the wrong direction.

/**
 * Modules permitted to reach outside `lib/trustshell` via `@/`.
 *
 * Grew from 8 to 9 on 2026-08-19 — DELIBERATELY, and the gate caught it before
 * the commit. `RewardLedger.ts` is the ninth stateful adapter: it exists to run
 * one conditional UPDATE against `kya_compliance_receipts`, which is the whole
 * point of it, and the decisions it classifies live in `reward-idempotency.ts`
 * with zero imports so they stay gateable. Adding an adapter here is a cost paid
 * knowingly; the list is what makes the cost visible.
 */
const HOST_COUPLED = new Set([
  'lib/trustshell/BFTAuthorizer.ts',
  'lib/trustshell/ComplianceReceipt.ts',
  'lib/trustshell/EarnedMetricsRepo.ts',
  'lib/trustshell/KYAValidator.ts',
  'lib/trustshell/RepIDConfig.ts',
  'lib/trustshell/VaultPermission.ts',
  'lib/trustshell/ZKPAttestation.ts',
  'lib/trustshell/persistence/supabase-reputation-store.ts',
  'lib/trustshell/RewardLedger.ts',
]);

/** The only host modules they may reach. Both are ports, not logic. */
const ALLOWED_HOST_PORTS = new Set(['@/lib/supabase-admin', '@/lib/trust/BFTEngine']);

/** npm packages the surface may depend on. `node:`/`crypto` are runtime, not deps. */
const ALLOWED_NPM = new Set(['@solana/web3.js', '@solana/spl-token', 'bs58', 'crypto']);

let pass = 0;
const failures = [];
function check(name, fn) {
  try {
    const r = fn();
    if (r === true) { pass++; return; }
    failures.push(`${name}: ${r}`);
  } catch (e) {
    failures.push(`${name}: threw ${e.message}`);
  }
}

// ── 1. The extractor, against the three shapes that fooled it ───────────────

const FIXTURE = [
  "// a comment mentioning `from 'prose-package'` — pass 1 matched this",
  '/*',
  " * a block comment: import { x } from 'block-package'",
  ' */',
  "import { A } from './relative';",
  'import {',
  '  Connection, Keypair,',
  "} from '@solana/web3.js';",
  "export type { T } from '@/lib/trustshell/harness/types';",
  'function f(a) {',
  "  throw new Error(`retargets audience from '${a.audience}' to nothing`);",
  '}',
].join('\n');

check('the extractor ignores specifiers that appear in prose', () =>
  !specifiersOf(FIXTURE).includes('prose-package') && !specifiersOf(FIXTURE).includes('block-package')
    ? true
    : `matched a comment: ${specifiersOf(FIXTURE).join(', ')}`);

check('the extractor sees MULTI-LINE imports', () =>
  specifiersOf(FIXTURE).includes('@solana/web3.js')
    ? true
    : 'missed a multi-line import — this is how SolanaExecutor was filed as pure');

check('the extractor sees multi-line `export … from`', () =>
  specifiersOf(FIXTURE).includes('@/lib/trustshell/harness/types')
    ? true
    : 'missed a re-export');

check('the extractor drops template-literal interpolations', () => {
  const s = specifiersOf(FIXTURE);
  return s.every((x) => !x.includes('${'))
    ? true
    : `phantom dependency from a template literal: ${s.join(', ')}`;
});

check('the extractor finds the relative import it should', () =>
  specifiersOf(FIXTURE).includes('./relative') ? true : 'missed a relative import');

// ── 2. The boundary itself ──────────────────────────────────────────────────

const files = walk(ROOT);
const outside = new Map();   // file -> host specifiers
const npm = new Map();       // file -> npm specifiers
const selfAlias = [];
const pure = [];

for (const f of files) {
  const specs = specifiersOf(readFileSync(f, 'utf8'));
  const host = specs.filter((s) => s.startsWith('@/') && !s.startsWith('@/lib/trustshell'));
  const own = specs.filter((s) => s.startsWith('@/lib/trustshell'));
  const pkgs = specs.filter((s) => !s.startsWith('.') && !s.startsWith('@/') && !s.startsWith('node:'));
  if (host.length) outside.set(f, host);
  if (pkgs.length) npm.set(f, pkgs);
  if (!host.length && own.length) selfAlias.push(f);
  if (!host.length && !own.length && !pkgs.length) pure.push(f);
}

check('no NEW module reaches outside the package', () => {
  const added = [...outside.keys()].filter((f) => !HOST_COUPLED.has(f));
  return added.length === 0
    ? true
    : `${added.length} undeclared host-coupled module(s): ${added.join(', ')} — ` +
      'each one is a module that cannot ship in the package';
});

check('the declared host-coupled list has no stale entries', () => {
  const gone = [...HOST_COUPLED].filter((f) => !outside.has(f));
  return gone.length === 0
    ? true
    : `${gone.length} declared but now clean: ${gone.join(', ')} — remove from HOST_COUPLED so the count means something`;
});

check('every outward reach is to a declared PORT, not to logic', () => {
  const bad = [];
  for (const [f, specs] of outside) {
    for (const s of specs) if (!ALLOWED_HOST_PORTS.has(s)) bad.push(`${f} -> ${s}`);
  }
  return bad.length === 0 ? true : `undeclared host dependency: ${bad.join('; ')}`;
});

check('no undeclared npm dependency', () => {
  const bad = [];
  for (const [f, specs] of npm) {
    for (const s of specs) if (!ALLOWED_NPM.has(s)) bad.push(`${f} -> ${s}`);
  }
  return bad.length === 0 ? true : `undeclared npm dependency: ${bad.join('; ')}`;
});

check('the portable majority has not shrunk', () => {
  // B + C + D: everything that ships today or after a mechanical path rewrite.
  const portable = files.length - outside.size;
  return portable >= 88
    ? true
    : `portable modules fell to ${portable} of ${files.length} ` +
      '(88 of 97 on 2026-08-19 after the self-alias rewrite; 87 of 96 before it; 69 of 77 before the main merge)';
});

// ── 3. DoD 1 is NOT CHECKED, and must say so ────────────────────────────────
//
// The point of this suite is not to claim the package works. It is to keep the
// distance honest while it does not exist.

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

check('DoD 1 is not silently claimed — the package is still private', () => {
  if (pkg.private !== true) {
    // Not a failure of principle: if someone made it publishable, they must
    // also have given it an entry point, or `npm publish` ships an empty shell.
    return pkg.main || pkg.exports
      ? true
      : 'package.json is no longer private but declares neither `main` nor `exports` — ' +
        'publishing this would ship a package with no importable entry point';
  }
  return true;
});

// A second assertion here read `private && !exports ? true : exports ? true : …`
// — true down every branch, so it asserted nothing while adding one to the
// count. Deleted rather than repaired: the check above already governs the only
// incoherent state (publishable with no entry point), and a tautology in a
// suite whose entire subject is unearned green is the wrong thing to keep.

// ── report ──────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} of ${pass + failures.length} assertions`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`VERIFIED: ${pass} assertions — package boundary holds`);
console.log(
  `  ${files.length} modules: ${outside.size} host-coupled, ` +
    `${selfAlias.length} self-aliased, ${pure.length} pure — ` +
    `${files.length - outside.size} portable`
);
console.log(
  '  DoD 1 (portable npm TrustShell): NOT CHECKED — package.json is ' +
    `private:${pkg.private === true}, main:${pkg.main ?? 'none'}, exports:${pkg.exports ? 'present' : 'none'}`
);
