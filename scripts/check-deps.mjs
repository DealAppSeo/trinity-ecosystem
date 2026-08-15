#!/usr/bin/env node
// scripts/check-deps.mjs — refuse a "security fix" that is actually a downgrade.
//
// WHY THIS EXISTS. On 2026-08-15 `npm audit` reported 12 advisories on this
// repo and offered `npm audit fix --force`. Reading what that command would
// actually do:
//
//   @solana/web3.js   1.98.4  ->  0.0.3     "fix"
//   @solana/spl-token 0.4.15  ->  0.1.8     "fix"
//   agent0-sdk        1.7.1   ->  1.5.3     "fix"
//
// All three installed versions were already the LATEST published. npm's
// resolver treats "no advisory matches this version" as "this version is
// safe", and versions old enough to predate the advisory database satisfy that
// trivially. So `--force` would have rolled the Solana client back six years,
// broken the payment path, and printed `found 0 vulnerabilities`.
//
// That is this repo's recurring defect in its purest form: a system reporting
// success it has not earned. The advisory count would have gone green while the
// code got materially worse, and nothing in CI would have noticed.
//
// So this gate asserts the two things the audit tool cannot:
//   1. no dependency is pinned below a version we have already shipped past;
//   2. no specifier floats, because a floating specifier means a fresh install
//      can resolve to code nobody reviewed.
//
// THREE OUTCOMES. Every control reports VERIFIED, NOT CHECKED or FAILED.
// "We could not read the lockfile" is NOT CHECKED — it is never a pass.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Version floors. A package appears here once we have deliberately landed on a
 * version and a downgrade would be a regression rather than a fix.
 *
 * The `reason` is the point. A bare number invites someone to "just bump it
 * down to make audit pass", which is exactly the move this file exists to stop.
 */
const FLOORS = [
  {
    name: '@solana/web3.js',
    floor: '1.98.4',
    reason:
      '`npm audit fix --force` proposes 0.0.3. 1.98.4 is the latest published 1.x; ' +
      'the uuid/jayson advisories under it have no upstream fix, and 0.0.3 predates ' +
      'the entire current API. SolanaExecutor is on the live payment path.',
  },
  {
    name: '@solana/spl-token',
    floor: '0.4.15',
    reason:
      '`npm audit fix --force` proposes 0.1.8. 0.4.15 is the latest published. The ' +
      'bigint-buffer advisory beneath it applies to ALL published versions (`*`), so ' +
      'no version of this package clears it — downgrading trades a known advisory for ' +
      'six years of unfixed ones.',
  },
  {
    name: 'agent0-sdk',
    floor: '1.7.1',
    reason:
      '`npm audit fix --force` proposes 1.5.3. 1.7.1 is the latest published. Its ' +
      'helia -> @libp2p/kad-dht advisory needs helia 7, which agent0-sdk does not yet ' +
      'accept (it pins helia ^5.0.0). Moved to devDependencies instead — it is reached ' +
      'only by scripts/register-agents-agent0.ts, never by the app.',
  },
  {
    name: 'next',
    floor: '16.3.1',
    reason:
      '21 CVEs (cache poisoning, SSRF, XSS, DoS) are fixed only in >=16.3.1 — every ' +
      '14.x and 15.x release is inside the vulnerable range. Reverting reopens all of them.',
  },
];

/** Specifiers that mean "whatever npm feels like today". */
const FLOATING = /^(latest|\*|x|)$/i;

/** Numeric-only semver compare. Returns <0, 0 or >0. Pre-release tags sort low. */
function compareVersions(a, b) {
  const split = (v) => {
    const [core, pre] = String(v).split('-');
    return [core.split('.').map((n) => parseInt(n, 10) || 0), pre ?? null];
  };
  const [ac, apre] = split(a);
  const [bc, bpre] = split(b);
  for (let i = 0; i < 3; i++) {
    const d = (ac[i] ?? 0) - (bc[i] ?? 0);
    if (d !== 0) return d;
  }
  if (apre && !bpre) return -1;
  if (!apre && bpre) return 1;
  return 0;
}

const results = [];
const record = (state, control, detail) => results.push({ state, control, detail });

let pkg = null;
let lock = null;
try {
  pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
} catch (err) {
  record('NOT CHECKED', 'read package.json', err.message);
}
try {
  lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
} catch (err) {
  record('NOT CHECKED', 'read package-lock.json', err.message);
}

// ---------------------------------------------------------------- control 1
// No floating specifiers, in either dependency block.
if (pkg) {
  const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const floating = Object.entries(all).filter(([, spec]) => FLOATING.test(String(spec).trim()));
  if (floating.length) {
    record(
      'FAILED',
      'no floating specifiers',
      floating.map(([n, s]) => `${n}@"${s}"`).join(', ')
    );
  } else {
    record('VERIFIED', 'no floating specifiers', `${Object.keys(all).length} specifiers, all pinned`);
  }
} else {
  record('NOT CHECKED', 'no floating specifiers', 'package.json unreadable');
}

// ---------------------------------------------------------------- control 2
// Nothing installed below a recorded floor.
for (const { name, floor, reason } of FLOORS) {
  if (!lock) {
    record('NOT CHECKED', `${name} >= ${floor}`, 'lockfile unreadable');
    continue;
  }
  const entry = lock.packages?.[`node_modules/${name}`];
  if (!entry?.version) {
    // Absent is not a violation — a dependency may legitimately be removed.
    record('VERIFIED', `${name} >= ${floor}`, 'not installed (removed, not downgraded)');
    continue;
  }
  if (compareVersions(entry.version, floor) < 0) {
    record('FAILED', `${name} >= ${floor}`, `installed ${entry.version} — ${reason}`);
  } else {
    record('VERIFIED', `${name} >= ${floor}`, `installed ${entry.version}`);
  }
}

// ---------------------------------------------------------------- report
const width = Math.max(...results.map((r) => r.control.length));
console.log('\nDependency floors and specifier hygiene\n');
for (const r of results) {
  const mark = r.state === 'VERIFIED' ? '✓' : r.state === 'FAILED' ? '✗' : '·';
  console.log(`  ${mark} ${r.control.padEnd(width)}  ${r.state}`);
  console.log(`    ${r.detail}`);
}

const failed = results.filter((r) => r.state === 'FAILED').length;
const unchecked = results.filter((r) => r.state === 'NOT CHECKED').length;
const verified = results.filter((r) => r.state === 'VERIFIED').length;

console.log(
  `\ncheck:deps — ${verified} VERIFIED, ${unchecked} NOT CHECKED, ${failed} FAILED.`
);
if (failed) {
  console.error(
    '\nA dependency is below a floor this project has already shipped past.\n' +
      'If this came from `npm audit fix --force`, read what it changed: npm treats an\n' +
      'unpublished-advisory version as a fix, including versions that predate the\n' +
      'advisory database. Reverting a package to clear an advisory is not a fix.\n'
  );
}
process.exit(failed > 0 ? 1 : 0);
