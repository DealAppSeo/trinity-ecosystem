#!/usr/bin/env node
// scripts/check-dormancy.mjs — a module nobody can import is not shipped.
//
// WHY THIS EXISTS. `spine-reachable-test.mjs` asks the reachability question for
// eleven named identity modules, and asking it found ten inert ones. This asks
// the same question for EVERY module under `lib/trustshell`, because the gap it
// found was never specific to the spine.
//
// Measured 2026-08-16 on a clean tree: **19 of 68 modules** are exported from
// no barrel and imported by nothing in `lib/` or `app/`. Among them is
// `harness/router`, the router measured at 98.16% of its omniscient bound —
// closed, correct, mutation-tested, and reachable by no consumer. That is the
// shape this repo keeps rediscovering: correct and inert reads exactly like
// correct and shipped from inside a green suite, because a test imports by path,
// which is the one access a real consumer does not have.
//
// WHAT THIS GATE DOES NOT DO. It does not demand that everything be wired.
// Several modules are dormant ON PURPOSE — `memory-authz` is deliberately not
// attached to a live memory path, because adding enforcement to a surface that
// has none breaks every caller at once. Refusing dormancy outright would push
// someone to wire a gate carelessly just to make a build green, which is worse
// than the dormancy.
//
// So dormancy is allowed and must be DECLARED, with a reason, below. The gate
// fails on:
//
//   * an UNDECLARED dormant module — something went inert and nobody said so;
//   * a STALE declaration — a module listed here that is now reachable. A
//     caveat is a debt, and a list that describes the past is how the next
//     reader is misled.
//
// THREE OUTCOMES. VERIFIED / NOT CHECKED / FAILED. A tree it cannot read is
// NOT CHECKED, never a pass.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative, resolve, sep } from 'node:path';

import { runtimeSpecifiers } from './lib/import-specifiers.mjs';

const ROOT = 'lib/trustshell';

/**
 * Dormant on purpose. Each entry says WHY, and what would end it.
 *
 * Keep this list append-ordered; it is a shared surface like the mutation
 * manifest, and reordering it turns a one-line merge into a manual one.
 */
const DECLARED = new Map([
  [
    'harness/aggregate',
    'reliability module. The agent loop executor is its intended consumer and is at Stage A — docs/AGENT-LOOP-SCOPE.md measured 47 harness settings with zero production consumers, and names the executor as the wiring that ends this.',
  ],
  ['harness/agreement', 'same as harness/aggregate — awaiting the loop executor.'],
  ['harness/circuit-breaker', 'same as harness/aggregate — awaiting the loop executor.'],
  ['harness/escalate', 'same as harness/aggregate. Also confirmed caller-less in Sprint Z: the module default is marginFloor 0, and the 1000 lives in the simulator.'],
  ['harness/queue', 'same as harness/aggregate — awaiting the loop executor.'],
  [
    'harness/capacity',
    'the capacity governor. Every reference to it in the tree is a TYPE-ONLY import in harness/router.ts, which is itself dormant — nothing constructs it. Surfaced 2026-08-17 when type-only imports stopped counting as reachability (#73); it was never shipped, only counted as though it were.',
  ],
  [
    'harness/leaky-bucket',
    'the rate limiter. Same shape as harness/capacity: one type-only import from the dormant router, no constructor call anywhere. Surfaced by the #73 fix.',
  ],
  [
    'harness/reputation',
    'ReputationLedger. Type-imported by the two persistence modules and constructed by neither. Surfaced by the #73 fix — the persistence layer names its types, which is not the same as running it.',
  ],
  ['harness/quorum', 'same as harness/aggregate — awaiting the loop executor.'],
  ['harness/replay', 'same as harness/aggregate — awaiting the loop executor.'],
  [
    'harness/router',
    'the router itself. CLOSED at 98.16% of the omniscient bound over 24 paired seeds, 1.84pp remaining — correct, mutation-tested, and reachable by nobody. Wiring it is the loop executor, NOT another routing sprint.',
  ],
  [
    'harness/retry',
    'the retry_on predicate. Same dependency as the rest of the kernel — awaiting the loop executor. Note it is the reason `harness/timeout` left this list: retry.ts imports AttemptTimeoutError as a VALUE for its instanceof check, which is genuine reachability by this gate\'s definition, though transitively both are still shipped by nobody.',
  ],
  ['harness/transform', 'same as harness/aggregate — awaiting the loop executor.'],
  [
    'repid-floor-decay',
    "DESIGN, deliberately unwired: decay-unless-re-earned for the ratchet floor. Nothing calls it, no trigger changes, it writes nothing. The invariants are decidable and gated by check:repid-floor-decay; the RATE is not — the ratchet binds exactly one real agent (trinity-gcm, 35 points), and the other 20 floor-sitters are mock/test_only/HUMAN rows. Wiring it needs an operator-chosen window, not more code. See docs/REPID-RATCHET-DECAY-DESIGN-2026-08-17.md.",
  ],
  [
    'identity/proof-provider',
    'the IProofProvider port, and dormant in the same way as identity/contracted-evaluator-port below: three identity modules import its TYPES and none import it at runtime, which is what a port correctly looks like rather than a gap. Surfaced by the #73 fix.',
  ],
  [
    'identity/contracted-evaluator-port',
    'a compile-time port assertion. It exists to be type-checked, not imported — `check:types` is its consumer, and a runtime importer would be the mistake.',
  ],
  [
    'identity/loop-authorizer',
    'authorization for the loop kernel; same dependency as the harness modules above.',
  ],
  [
    'identity/memory-authz',
    'DELIBERATE, and documented in NEXT.md 4c: memory has no access control today, so attaching enforcement breaks every existing caller at once. Wiring it is a decided change and should go through a shadow step, like the vault gate.',
  ],
  [
    'identity/repid-predicate',
    'binds EarnedMetrics into a ZK predicate. Blocked upstream on Poseidon2 parameters from the repid-engine lane — see docs/POSEIDON2-PARAMETER-REQUEST.md.',
  ],
  [
    'persistence/supabase-reputation-store',
    'the durable adapter behind the reputation history. The JOINT now exists — persistence/durable-ledger.ts binds a ReputationLedger to any ReputationStore and refuses to save one that never loaded — and it takes the INTERFACE, so this implementation still has no importer. What remains is a caller choosing it, which is the product surface Stage B Half A needs and the fleet being off makes worthless. See docs/STAGE-B-SCOPE-2026-08-17.md.',
  ],
  [
    'receipt/store-sqlite',
    'a local store used by the receipt suite. A server surface would use the Supabase adapter, so a product importer here would be the wrong direction.',
  ],
  [
    'schema/decoys',
    'the decoy-table matcher. Its consumer is `check:schema-names`, which is a gate rather than a runtime path — the analysis is the product.',
  ],
  [
    'throughput/ledger',
    'the producer-liveness ledger. Its consumer is the runtime lane (T12), which observes rather than imports; a product importer is not the goal.',
  ],
]);

const results = [];
const record = (state, control, detail) => results.push({ state, control, detail });

/** Every .ts module under lib/trustshell, excluding barrels, types and fixtures. */
function modules(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!/^(fixtures|__tests__)$/.test(e.name)) modules(p, out);
    } else if (e.name.endsWith('.ts') && e.name !== 'index.ts' && e.name !== 'types.ts') {
      out.push(p);
    }
  }
  return out;
}

/** Every source file that could plausibly import one. */
function sources(dirs, out = []) {
  for (const dir of dirs) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (!/^(node_modules|\.next)$/.test(e.name)) sources([p], out);
      } else if (/\.(ts|tsx)$/.test(e.name)) {
        out.push(p);
      }
    }
  }
  return out;
}

let mods, srcs, barrel;
try {
  mods = modules(ROOT);
  srcs = sources(['lib', 'app']);
  barrel = readFileSync(join(ROOT, 'index.ts'), 'utf8');
} catch (err) {
  record('NOT CHECKED', 'read the tree', err.message);
  report();
}

const bodies = new Map(srcs.map((f) => [f, readFileSync(f, 'utf8')]));

/**
 * Every module specifier a file imports, RESOLVED to a repo-relative path.
 *
 * The first version matched the BASENAME as a substring — `/router'` — which is
 * correct only while no two modules anywhere share a name. Measured 2026-08-16:
 * zero collisions, so it gave the right answer, by luck rather than by
 * construction. The moment anyone adds a second `router.ts` outside this tree,
 * a basename match marks `harness/router` reachable and the dormancy count
 * quietly drops. That is under-reporting — the direction that HIDES the defect
 * this gate exists to surface, which is the worse of the two ways to be wrong.
 *
 * Resolving properly also fixes a real case the substring form handled only by
 * accident: a sibling importing `./router` from inside the same directory.
 */
/**
 * Every module specifier a file imports, RESOLVED to a repo-relative path.
 *
 * The first version matched the BASENAME as a substring — `/router'` — which is
 * correct only while no two modules anywhere share a name. Measured 2026-08-16:
 * zero collisions, so it gave the right answer, by luck rather than by
 * construction. The moment anyone adds a second `router.ts` outside this tree,
 * a basename match marks `harness/router` reachable and the dormancy count
 * quietly drops. That is under-reporting — the direction that HIDES the defect
 * this gate exists to surface, which is the worse of the two ways to be wrong.
 *
 * Resolving properly also fixes a real case the substring form handled only by
 * accident: a sibling importing `./router` from inside the same directory.
 *
 * WHICH SPECIFIERS COUNT is `./lib/import-specifiers.mjs`, and it is the same
 * under-reporting argument one level down: a type-only import is erased by the
 * compiler and a specifier in a comment is prose, and counting either marked a
 * module reachable that nothing imports (issue #73, fixed 2026-08-17). That
 * module has its own self-test because a scanner with nothing to find and a
 * scanner that never fires print the same line.
 */
function importedStems() {
  const stems = new Set();
  for (const [file, body] of bodies) {
    for (const spec of runtimeSpecifiers(body)) {
      let abs;
      if (spec.startsWith('@/')) abs = resolve(spec.slice(2));
      else if (spec.startsWith('.')) abs = resolve(dirname(file), spec);
      else continue; // a bare package name is never one of ours
      const rel = relative(resolve(ROOT), abs).split(sep).join('/');
      // `..` means it resolved outside lib/trustshell.
      if (rel && !rel.startsWith('..')) stems.add(rel.replace(/\.tsx?$/, ''));
    }
  }
  return stems;
}

const imported = importedStems();

const dormant = [];
for (const file of mods) {
  const stem = relative(ROOT, file).split(sep).join('/').replace(/\.ts$/, '');
  // Reachable if the barrel re-exports it, or any source resolves an import to
  // it. A module importing itself cannot make itself reachable, and an index
  // re-export inside a subdirectory counts — that is a real consumer path.
  if (barrel.includes(`'./${stem}'`)) continue;
  if (imported.has(stem)) continue;
  dormant.push(stem);
}

const dormantSet = new Set(dormant);

// -------------------------------------------------------------- control 1
const undeclared = dormant.filter((m) => !DECLARED.has(m));
if (undeclared.length) {
  record(
    'FAILED',
    'every dormant module is declared',
    `${undeclared.length} undeclared: ${undeclared.join(', ')}\n` +
      `    A module exported from no barrel and imported by nothing is not shipped, however\n` +
      `    green its own suite is. Wire it, or declare it here with the reason it waits.`
  );
} else {
  record(
    'VERIFIED',
    'every dormant module is declared',
    `${dormant.length} dormant of ${mods.length} scanned, all declared with a reason`
  );
}

// -------------------------------------------------------------- control 2
const stale = [...DECLARED.keys()].filter((m) => !dormantSet.has(m));
if (stale.length) {
  record(
    'FAILED',
    'no stale declaration',
    `${stale.length} now reachable but still listed as dormant: ${stale.join(', ')}\n` +
      `    Delete the entry. A list that describes the past misleads the next reader,\n` +
      `    and this repo has already published two figures whose own caveats had gone stale.`
  );
} else {
  record('VERIFIED', 'no stale declaration', `${DECLARED.size} declarations, all still accurate`);
}

function report() {
  const width = Math.max(...results.map((r) => r.control.length));
  console.log('\nDormancy — a module nobody can import is not shipped\n');
  for (const r of results) {
    const mark = r.state === 'VERIFIED' ? '✓' : r.state === 'FAILED' ? '✗' : '·';
    console.log(`  ${mark} ${r.control.padEnd(width)}  ${r.state}`);
    console.log(`    ${r.detail}`);
  }
  const failed = results.filter((r) => r.state === 'FAILED').length;
  const unchecked = results.filter((r) => r.state === 'NOT CHECKED').length;
  const verified = results.filter((r) => r.state === 'VERIFIED').length;
  console.log(
    `\ncheck:dormancy — ${verified} VERIFIED, ${unchecked} NOT CHECKED, ${failed} FAILED.`
  );
  process.exit(failed > 0 ? 1 : 0);
}

report();
