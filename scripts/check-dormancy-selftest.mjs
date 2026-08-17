#!/usr/bin/env node
// scripts/check-dormancy-selftest.mjs — does the dormancy gate still discriminate?
//
// WHY A SELF-TEST AND NOT A MUTANT. The defect this guards against is invisible
// on the real tree. `check:dormancy` originally matched importers by BASENAME
// substring — `/router'` — which is correct only while no two modules anywhere
// share a name. Measured 2026-08-16: zero collisions, so it returned the right
// answer, by luck. A mutant that reverts the resolver would therefore be
// SURVIVED on a clean tree, and mutation testing would score the regression as
// harmless.
//
// The distinguishing case has to be constructed. This builds it: a genuinely
// dormant module inside the tree whose basename collides with an unrelated
// module OUTSIDE it that something really imports. The basename matcher calls
// the dormant one reachable; a resolver that follows specifiers does not.
//
// The direction matters. That failure UNDER-reports — it hides a dormant
// module, which is the exact thing the gate exists to surface. A gate that
// over-reports annoys someone; a gate that under-reports is why the gate was
// needed.
//
// THREE OUTCOMES. VERIFIED / NOT CHECKED / FAILED. If the fixture cannot be
// built, that is NOT CHECKED — never a pass.

import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const GATE = 'scripts/check-dormancy.mjs';
let passed = 0;
const failures = [];
const ok = (cond, what) => (cond ? (passed += 1) : failures.push(what));

/**
 * A miniature repo: `lib/trustshell` with a barrel, one dormant module, and a
 * same-named decoy outside the tree that a real file imports.
 */
function fixture({ collide }) {
  const dir = mkdtempSync(join(tmpdir(), 'dormancy-selftest-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'lib/trustshell/probe'), { recursive: true });
  mkdirSync(join(dir, 'app'), { recursive: true });
  cpSync(GATE, join(dir, GATE));

  // Reachable, so the fixture proves the gate can say YES as well as NO.
  writeFileSync(join(dir, 'lib/trustshell/reachable.ts'), 'export const r = 1;\n');
  writeFileSync(
    join(dir, 'lib/trustshell/index.ts'),
    "export { r } from './reachable';\n"
  );
  // Dormant: no barrel entry, no importer anywhere.
  writeFileSync(join(dir, 'lib/trustshell/probe/widget.ts'), 'export const w = 1;\n');

  if (collide) {
    // Same BASENAME, different module, genuinely imported. This is the trap.
    mkdirSync(join(dir, 'lib/decoy'), { recursive: true });
    writeFileSync(join(dir, 'lib/decoy/widget.ts'), 'export const d = 1;\n');
    writeFileSync(
      join(dir, 'lib/decoy/consumer.ts'),
      "import { d } from './widget';\nexport const u = d;\n"
    );
  }
  return dir;
}

const run = (dir) =>
  spawnSync('node', [GATE], { cwd: dir, encoding: 'utf8' });

const dirs = [];
try {
  // ---- 1. Without a collision, the dormant module is reported. Baseline: the
  //         gate can detect dormancy at all, so a failure below means the
  //         COLLISION defeated it rather than the gate being inert.
  const plain = fixture({ collide: false });
  dirs.push(plain);
  const a = run(plain);
  ok(/undeclared: probe\/widget/.test(a.stdout), 'baseline: dormant module is reported without a collision');
  ok(a.status === 1, 'baseline: an undeclared dormancy exits 1');

  // ---- 2. WITH a colliding basename outside the tree, it must STILL be
  //         reported. This is the whole point.
  const trap = fixture({ collide: true });
  dirs.push(trap);
  const b = run(trap);
  ok(
    /undeclared: probe\/widget/.test(b.stdout),
    'a same-named module outside the tree must NOT make a dormant one look reachable'
  );
  ok(b.status === 1, 'the collision case still exits 1');

  // ---- 3. The barrel-exported module is never called dormant.
  //
  // Asserted against the UNDECLARED LIST, not against the whole output. The
  // gate carries a hardcoded declaration list for the real tree, so every one
  // of those entries reads as a stale declaration inside a fixture where the
  // modules do not exist — expected noise, and its wording contains the word
  // "reachable". A first draft of this assertion matched that prose and failed
  // a gate that was working. Same shape as the two instrument bugs in A22 and
  // the numbering gate: the measurement was wrong, not the thing measured.
  const undeclaredLine = /undeclared: ([^\n]*)/.exec(b.stdout)?.[1] ?? '';
  ok(
    undeclaredLine.includes('probe/widget'),
    'the undeclared list names the dormant module'
  );
  ok(
    !undeclaredLine.includes('reachable'),
    'a barrel-exported module is absent from the undeclared list'
  );
} catch (err) {
  console.log(`\ncheck:dormancy self-test — NOT CHECKED (${err.message})`);
  process.exit(2);
} finally {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}

console.log(`\n${passed} self-test assertion(s) passed, ${failures.length} failed.`);
for (const f of failures) console.log(`  FAILED: ${f}`);
if (failures.length) {
  console.log(
    '\ncheck:dormancy self-test — FAILED. The gate no longer distinguishes a dormant\n' +
      'module from a same-named one elsewhere, so it under-reports: dormancy becomes\n' +
      'invisible exactly where a name is reused.'
  );
  process.exit(1);
}
console.log('check:dormancy self-test — VERIFIED. The gate fails when it should.');
