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
import { join, basename, relative } from 'node:path';

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
    'the durable adapter behind the reputation history. Nothing writes that history from a product surface yet; wiring the producer is the decided change, not this adapter.',
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

const dormant = [];
for (const file of mods) {
  const stem = relative(ROOT, file).replace(/\.ts$/, '').split('\\').join('/');
  const base = basename(stem);
  // Reachable if the barrel re-exports it, or any OTHER source imports it by
  // specifier. Matching on the quoted specifier tail avoids counting a mention
  // in prose or a same-named symbol.
  if (barrel.includes(`'./${stem}'`)) continue;
  let imported = false;
  for (const [g, body] of bodies) {
    if (g === file) continue;
    if (body.includes(`/${base}'`) || body.includes(`./${base}'`)) {
      imported = true;
      break;
    }
  }
  if (!imported) dormant.push(stem);
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
