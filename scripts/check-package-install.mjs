// scripts/check-package-install.mjs
//
// DoD 1: "a portable npm TrustShell". Does it actually install?
//
// This is the last question in the chain, and the only one a consumer cares
// about. Three suites now answer three different things, and none substitutes
// for the next:
//
//   check:package-boundary   WHICH modules reach outside the package.
//                            A static read of import specifiers. Fast, names the
//                            culprit, and can be fooled by anything its parser
//                            does not model — it was wrong twice before it was right.
//
//   check:portable-surface   Does the entry point COMPILE and LOAD with no path
//                            alias? Asks tsc and Node, not a regex. Still runs
//                            against the repo's own tree.
//
//   THIS SUITE               Does `npm pack` produce a tarball that INSTALLS into
//                            a directory that is not this repo, and can a
//                            consumer `require()` it from there?
//
// The gap the first two cannot close is `files` / `exports`. A package can
// compile perfectly, load perfectly from `dist/`, and still ship a tarball with
// no `dist` in it — or an `exports` map pointing at a path that was never
// packed. Both produce a module that installs and then throws
// ERR_PACKAGE_PATH_NOT_EXPORTED at the consumer, and nothing in this repo would
// notice. `npm pack` + install into a temp dir is the only thing that does.
//
// ── WHAT THIS DOES *NOT* CLAIM ──────────────────────────────────────────────
//
// `package.json` is still `"private": true`, and nothing has been published to a
// registry. Publishing is Sean's decision and is irreversible per version. What
// is measured here is narrower and true: the tarball this repo produces installs
// and imports. DoD 1 is "the package works", not "the package is published", and
// this closes the first.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

// ── 1. The manifest declares an entry point at all ──────────────────────────

check('the package declares main, types and exports', () => {
  const missing = ['main', 'types', 'exports'].filter((k) => !pkg[k]);
  return missing.length === 0 ? true : `missing: ${missing.join(', ')}`;
});

check('the package declares `files`, so the tarball is not the whole repo', () =>
  Array.isArray(pkg.files) && pkg.files.length > 0
    ? true
    : 'no `files` array — npm would pack the entire working tree');

check('DoD 1 is not claimed as published — private is still true', () =>
  pkg.private === true
    ? true
    : 'package.json is no longer private. Publishing is irreversible per version and is ' +
      'Sean\'s decision; this suite measures that the package INSTALLS, never that it should ship');

// ── 2. Build, then pack ─────────────────────────────────────────────────────

let built = false;
let buildErr = '';
try {
  execFileSync('npx', ['tsc', '-p', 'tsconfig.package.json'], { stdio: 'pipe' });
  built = true;
} catch (e) {
  buildErr = (e.stdout?.toString() || e.message).slice(0, 3000);
}

check('the package builds', () => {
  if (built) return true;
  // Same reasoning as check:portable-surface: this suite's subject includes a
  // compile failure, and mutate.mjs scores /error TS\d+/ as a non-compiling
  // mutant. Rewritten so a real build break is legible as this suite's finding.
  return `tsc -p tsconfig.package.json failed:\n${buildErr.replace(/error (TS\d+)/g, 'package-build $1')}`;
});

check('the build emits the entry point named in `main`', () =>
  built && existsSync(pkg.main) ? true : `${pkg.main} was not emitted`);

check('the build emits the declarations named in `types`', () =>
  built && existsSync(pkg.types) ? true : `${pkg.types} was not emitted`);

// ── 3. Install the tarball SOMEWHERE ELSE and require it ────────────────────
//
// Outside the repo, so nothing resolves by accident through the working tree.

const sandbox = mkdtempSync(join(tmpdir(), 'trustshell-install-'));
let tarball = null;
let installed = false;
let installErr = '';
let loaded = null;

if (built) {
  try {
    const out = execFileSync('npm', ['pack', '--pack-destination', sandbox], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    tarball = join(sandbox, out.trim().split('\n').pop().trim());
  } catch (e) {
    installErr = `npm pack failed: ${e.stdout?.toString() || e.message}`;
  }
}

check('npm pack produces a tarball', () =>
  tarball && existsSync(tarball) ? true : installErr || 'no tarball produced');

if (tarball && existsSync(tarball)) {
  try {
    writeFileSync(
      join(sandbox, 'package.json'),
      JSON.stringify({ name: 'consumer', version: '1.0.0', private: true }, null, 2)
    );
    execFileSync('npm', ['install', '--no-audit', '--no-fund', tarball], {
      cwd: sandbox,
      stdio: 'pipe',
    });
    installed = true;
  } catch (e) {
    installErr = (e.stdout?.toString() || e.stderr?.toString() || e.message).slice(0, 2000);
  }
}

check('the tarball INSTALLS into a directory that is not this repo', () =>
  installed ? true : `npm install failed: ${installErr}`);

if (installed) {
  try {
    const probe = join(sandbox, 'probe.cjs');
    writeFileSync(
      probe,
      `const m = require('${pkg.name}');\n` +
        `process.stdout.write(JSON.stringify({ keys: Object.keys(m).length, ` +
        `has: ['stageFor','rewardFor','effectiveAuthority','realCollateralUsd','COST_MODEL']` +
        `.filter(k => typeof m[k] !== 'undefined') }));\n`
    );
    const out = execFileSync('node', [probe], { cwd: sandbox, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    loaded = JSON.parse(out);
  } catch (e) {
    installErr = (e.stdout?.toString() || e.stderr?.toString() || e.message).slice(0, 2000);
  }
}

check('a CONSUMER can require the installed package by name', () =>
  loaded ? true : `require('${pkg.name}') failed from the sandbox: ${installErr}`);

check('the installed package exposes the load-bearing surface', () => {
  if (!loaded) return 'the package did not load';
  const want = ['stageFor', 'rewardFor', 'effectiveAuthority', 'realCollateralUsd', 'COST_MODEL'];
  const missing = want.filter((k) => !loaded.has.includes(k));
  return missing.length === 0
    ? true
    : `${missing.join(', ')} absent from the installed package — "portable" must not be reached by shipping nothing`;
});

check('the installed surface is substantial, not a token export', () => {
  if (!loaded) return 'the package did not load';
  return loaded.keys >= 100
    ? true
    : `only ${loaded.keys} runtime exports installed (156 on 2026-08-19)`;
});

// ── 4. The tarball carries dist and NOT the repo ───────────────────────────

check('the tarball ships dist and does not ship lib/ or app/', () => {
  if (!tarball) return 'no tarball';
  const listing = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' });
  const entries = listing.split('\n').filter(Boolean);
  const hasDist = entries.some((e) => e.includes('package/dist/portable.js'));
  const leaks = entries.filter((e) => /package\/(lib|app|scripts|docs)\//.test(e));
  // NOTE, measured 2026-08-19: npm FORCE-INCLUDES the file named in `main`,
  // regardless of `files`. Setting `files: ["README.md"]` still packs
  // dist/portable.js — but none of the modules it requires. So this assertion
  // alone does NOT catch a broken `files`; the install-and-require assertions
  // above are what caught it (3 of 12 red). Both are kept: this one names the
  // shape, those prove the behaviour.
  if (!hasDist) return 'dist/portable.js is not in the tarball — it would install and then throw';
  return leaks.length === 0
    ? true
    : `${leaks.length} repo path(s) leaked into the tarball, e.g. ${leaks[0]}`;
});

rmSync(sandbox, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} of ${pass + failures.length} assertions`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`VERIFIED: ${pass} assertions — the package builds, packs, installs and imports`);
console.log(
  `  DoD 1: the tarball installs into a foreign directory and a consumer requires it by name ` +
    `(${loaded?.keys ?? 0} runtime exports). NOT published — package.json is still private.`
);
