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
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
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

/**
 * Compile and import a SET of `lib/**` modules that import EACH OTHER through the
 * `@/lib/...` path alias.
 *
 * `compileAndImport` above passes files straight to `tsc` with no tsconfig, so it
 * has no `paths` mapping — a module that does `import { x } from '@/lib/mcp/y'`
 * fails type-checking with TS2307 before it ever emits, and the probe would then
 * read NOT_CHECKED over a module that compiles perfectly well in the app. That is
 * the wrong answer for exactly the multi-file surfaces most worth probing (the MCP
 * server is three files that reference each other by alias).
 *
 * Rather than teach the flag-based compile about `paths` (which would change the
 * behaviour of the six existing single-file callers), this copies the sources flat
 * into a temp dir and rewrites each intra-set `@/lib/.../<name>` specifier to a
 * relative `./<name>` — so tsc resolves siblings with no alias at all. A specifier
 * pointing OUTSIDE the provided set is left untouched, so it fails loudly rather
 * than resolving to the wrong thing. Bare package imports (`@supabase/supabase-js`)
 * resolve via the repo's node_modules because the temp dir lives under `cwd`.
 *
 * The set must be self-contained: every intra-repo import is either a bare package
 * or names another file in `files` (by basename). Basenames must be unique.
 *
 * @param {string[]} files    repo-relative `lib/**` paths that import each other
 * @param {string[]} imports  basenames (no dir, no extension) to import, in order
 * @returns {Promise<{ok: true, modules: object[], cleanup: () => void}
 *                  | {ok: false, reason: string, howToRun: string}>}
 */
export async function compileAliasedModules(files, imports) {
  const tscBin = join('node_modules', '.bin', 'tsc');
  if (!existsSync(tscBin)) {
    return {
      ok: false,
      reason: 'TypeScript is not installed locally (node_modules/.bin/tsc absent)',
      howToRun: 'npm install && npm run check:redteam',
    };
  }

  const bases = files.map((f) => basename(f).replace(/\.ts$/, ''));
  if (new Set(bases).size !== bases.length) {
    return {
      ok: false,
      reason: `compileAliasedModules needs unique basenames; got ${bases.join(', ')}`,
      howToRun: 'rename or split so no two provided files share a basename',
    };
  }
  const inSet = new Set(bases);

  const outDir = mkdtempSync(join(process.cwd(), '.redteam-probe-'));
  const cleanup = () => rmSync(outDir, { recursive: true, force: true });

  // Rewrite `@/lib/<dir>/<name>` -> `./<name>` when <name> is one of ours.
  // A specifier we do not own is left as-is on purpose: a silent mis-resolution
  // is exactly the "looks wired, isn't" defect this repo keeps finding.
  const rewrite = (src) =>
    src.replace(/(['"])@\/lib\/[a-zA-Z0-9_./-]*?([a-zA-Z0-9_-]+)\1/g, (m, q, name) =>
      inSet.has(name) ? `'./${name}'` : m
    );

  try {
    const copied = [];
    for (const f of files) {
      if (!existsSync(f)) {
        cleanup();
        return { ok: false, reason: `source not found: ${f}`, howToRun: 're-point the probe at the current path' };
      }
      const dest = join(outDir, basename(f));
      writeFileSync(dest, rewrite(readFileSync(f, 'utf8')));
      copied.push(dest);
    }

    const emitDir = join(outDir, 'out');
    try {
      execFileSync(
        tscBin,
        [
          ...copied,
          '--outDir', emitDir,
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
        reason: `could not compile ${files.join(', ')}: ${out.split('\n').slice(0, 4).join(' | ')}`,
        howToRun: 'fix the compile error above, then re-run npm run check:redteam',
      };
    }

    const modules = [];
    for (const name of imports) {
      try {
        modules.push(await import(pathToFileURL(join(emitDir, `${name}.js`)).href));
      } catch (e) {
        cleanup();
        return {
          ok: false,
          reason: `compiled but could not import ${name}.js: ${e.message}`,
          howToRun: 'check the module has no side effects at import time',
        };
      }
    }

    return { ok: true, modules, cleanup };
  } catch (e) {
    cleanup();
    return { ok: false, reason: `compileAliasedModules failed: ${e.message}`, howToRun: 're-run npm run check:redteam' };
  }
}
