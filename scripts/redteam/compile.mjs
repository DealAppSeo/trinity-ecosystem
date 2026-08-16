// scripts/redteam/compile.mjs — drive real TypeScript modules from a probe.
//
// A red team probe that reasons ABOUT code rather than RUNNING it is exactly
// the failure CLAUDE.md names first: "Run it; don't read it. Every wrong claim
// in LESSONS.md came from describing behaviour without executing it." That
// applies with more force here than anywhere, because a reading-derived
// "vulnerability" is a published claim about a system being unsafe.
//
// So probes that can execute the module, do. This wraps the compile-to-temp
// pattern the `check:*` suites already use (see check-config-readiness.mjs) and
// adds the one thing a probe needs that a check does not: a compile failure
// must surface as NOT_CHECKED, never as a breach. A module that will not build
// has told us nothing about whether it is exploitable.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Compile one or more `lib/**` TypeScript files and import them.
 *
 * @param {string[]} entrypoints  repo-relative paths under `lib/`
 * @param {string[]} imports      repo-relative paths (same list, or a subset)
 *                                to actually import, in order
 * @returns {Promise<{ok: true, modules: object[], cleanup: () => void}
 *                  | {ok: false, reason: string, howToRun: string}>}
 */
export async function compileAndImport(entrypoints, imports = entrypoints) {
  const tscBin = join('node_modules', '.bin', 'tsc');
  if (!existsSync(tscBin)) {
    // Deliberately NOT `npx tsc` — see scripts/local-tsc.mjs for why that
    // silently fetches TypeScript 6 and fails on every file.
    return {
      ok: false,
      reason: 'TypeScript is not installed locally (node_modules/.bin/tsc absent)',
      howToRun: 'npm install && npm run check:redteam',
    };
  }

  const outDir = mkdtempSync(join(process.cwd(), '.redteam-probe-'));
  const cleanup = () => rmSync(outDir, { recursive: true, force: true });

  try {
    execFileSync(
      tscBin,
      [
        ...entrypoints,
        '--outDir', outDir,
        '--rootDir', 'lib',
        '--module', 'commonjs', '--target', 'es2022',
        '--lib', 'es2022,dom', '--moduleResolution', 'node',
        '--esModuleInterop', '--strict', '--skipLibCheck',
      ],
      { stdio: 'pipe' }
    );
  } catch (e) {
    cleanup();
    const out = (e.stdout?.toString() || '') + (e.stderr?.toString() || '') || e.message;
    return {
      ok: false,
      // A build error is NOT evidence of a vulnerability. Say what it was.
      reason: `could not compile ${entrypoints.join(', ')}: ${out.split('\n').slice(0, 4).join(' | ')}`,
      howToRun: 'fix the compile error above, then re-run npm run check:redteam',
    };
  }

  const modules = [];
  for (const src of imports) {
    // lib/trustshell/x.ts -> <outDir>/trustshell/x.js  (rootDir is `lib`)
    const rel = src.replace(/^lib\//, '').replace(/\.ts$/, '.js');
    try {
      modules.push(await import(pathToFileURL(join(outDir, rel)).href));
    } catch (e) {
      cleanup();
      return {
        ok: false,
        reason: `compiled but could not import ${rel}: ${e.message}`,
        howToRun: 'check the module has no side effects at import time',
      };
    }
  }

  return { ok: true, modules, cleanup };
}
