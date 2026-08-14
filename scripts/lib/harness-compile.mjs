// scripts/lib/harness-compile.mjs — compile lib/trustshell/harness to runnable JS.
//
// Shared by the harness test scripts and the simulator. Same approach as
// scripts/mcp-fleet-smoke.mjs: compile through a generated tsconfig that
// extends the repo's, so the checks run under the same `strict` settings the
// build uses, then rewrite the `@/` alias that tsc emits verbatim.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function compileHarness() {
  const outDir = mkdtempSync(join(tmpdir(), 'trust-harness-'));
  const tsconfigPath = join(outDir, 'tsconfig.harness.json');

  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      extends: join(process.cwd(), 'tsconfig.json'),
      compilerOptions: {
        outDir,
        noEmit: false,
        incremental: false,
        declaration: false,
        rootDir: join(process.cwd(), 'lib/trustshell/harness'),
        lib: ['esnext'],
        jsx: undefined,
        plugins: undefined,
      },
      include: [join(process.cwd(), 'lib/trustshell/harness/**/*.ts')],
    })
  );

  try {
    execFileSync('npx', ['tsc', '-p', tsconfigPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });
  } catch (e) {
    console.error('harness compilation failed\n');
    console.error(e.stdout?.toString() || e.message);
    process.exit(1);
  }

  for (const file of readdirSync(outDir).filter((f) => f.endsWith('.js'))) {
    const path = join(outDir, file);
    let src = readFileSync(path, 'utf8');
    src = src.replace(/(['"])@\/lib\/trustshell\/harness\/([a-z-]+)\1/g, "'./$2.js'");
    src = src.replace(/from '\.\/([a-z-]+)'/g, "from './$1.js'");
    writeFileSync(path, src);
  }

  return {
    outDir,
    load: (name) => import(pathToFileURL(join(outDir, `${name}.js`)).href),
  };
}

/** Minimal assertion harness shared across the harness test scripts. */
export function createChecker(label) {
  let passed = 0;
  const failures = [];

  const check = (name, fn) => {
    try {
      fn();
      passed += 1;
    } catch (e) {
      failures.push(`${name}\n    ${e.message}`);
    }
  };

  const eq = (actual, expected, what) => {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) throw new Error(`${what}: expected ${b}, got ${a}`);
  };

  const truthy = (v, what) => {
    if (!v) throw new Error(`${what}: expected truthy, got ${JSON.stringify(v)}`);
  };

  const close = (actual, expected, tolerance, what) => {
    if (Math.abs(actual - expected) > tolerance) {
      throw new Error(`${what}: expected ${expected} ±${tolerance}, got ${actual}`);
    }
  };

  const report = () => {
    console.log(`\n${label}: ${passed} passed, ${failures.length} failed\n`);
    if (failures.length > 0) {
      for (const f of failures) console.error(`  FAIL  ${f}`);
      process.exit(1);
    }
    console.log(`All ${label} checks passed.`);
  };

  return { check, eq, truthy, close, report };
}
