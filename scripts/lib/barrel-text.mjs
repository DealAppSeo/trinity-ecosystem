// scripts/lib/barrel-text.mjs
//
// What does `@/lib/trustshell` actually export?
//
// ── WHY THIS IS NOT `readFileSync('lib/trustshell/index.ts')` ANY MORE ──────
//
// It was, in two suites, and both went red on 2026-08-19 when the barrel split.
// `index.ts` had become:
//
//     export * from './portable';
//     export { KYAValidator } from './KYAValidator';   // …and the other adapters
//
// Every name those suites were looking for was still reachable to every consumer
// — the split is invisible from `@/lib/trustshell` — but the FILE no longer
// mentioned them. The invariant held and the measurement broke, which is the
// less obvious of the two failures and the one worth being careful about: a
// red suite that is wrong teaches people to ignore it.
//
// So this follows `export * from './x'` one level and returns the concatenation.
// One level is deliberate: the barrel is two files by design, and a general
// transitive walk would start reporting names that are re-exported from deep
// inside the package as though they were part of the public surface.
//
// A textual answer, not a loaded module — these suites run without compiling the
// TypeScript, and requiring a build step to ask "is this exported" would put the
// cheapest gate in the repo behind the slowest one.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * The barrel's own text plus the text of every `export * from './x'` it names.
 *
 * Returns a single string, so existing `includes()` and regex assertions keep
 * working unchanged — the point is to fix what they read, not to make every
 * caller learn a new shape.
 */
export function barrelText(entry = 'lib/trustshell/index.ts') {
  const own = readFileSync(entry, 'utf8');
  const parts = [own];
  for (const m of own.matchAll(/export\s+\*\s+from\s+'(\.[^']+)'\s*;/g)) {
    const base = resolve(dirname(entry), m[1]);
    const target = [base + '.ts', join(base, 'index.ts')].find((p) => existsSync(p));
    if (target) parts.push(readFileSync(target, 'utf8'));
  }
  return parts.join('\n');
}
