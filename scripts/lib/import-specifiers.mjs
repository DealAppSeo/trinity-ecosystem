// scripts/lib/import-specifiers.mjs — which modules a source file imports AT RUNTIME.
//
// Extracted from `check-dormancy.mjs` so it can be tested directly. That gate
// self-executes and calls `process.exit`, so importing it to test one function
// runs the whole check; a shared module is the smaller change.
//
// ── WHAT "AT RUNTIME" EXCLUDES, AND WHY IT MATTERS ───────────────────────────
//
// The dormancy gate asks whether anything can actually reach a module. Two
// things look like imports and are not, and both were counted before
// 2026-08-17 (issue #73). Both made the gate report a module as REACHABLE when
// nothing imports it — under-reporting dormancy, which is the direction that
// HIDES the defect the gate exists to surface, exactly as that file's own
// comment argues for resolved paths over basenames.
//
//   * `import type { X } from './m'` is erased by the compiler. Nothing imports
//     './m' in the emitted JavaScript.
//   * A specifier inside a COMMENT is prose. This one is not hypothetical: while
//     building #70 the router was marked reachable by a comment explaining why it
//     must not be, and `retry.ts` still carries a note about not spelling a
//     specifier out.
//
// ── WHAT IT DELIBERATELY STILL COUNTS ────────────────────────────────────────
//
// `import { type X, Y } from './m'` is counted. The statement is not wholly
// type-only — Y is a value — so the import survives. `import { type X } from
// './m'` with no value specifier is counted TOO, conservatively: whether TS
// elides it depends on `verbatimModuleSyntax` and friends, and guessing wrong in
// the other direction would call a live module dormant. Between over-reporting
// reachability for one unusual form and inventing dormancy that does not exist,
// this takes the first — but only where the answer genuinely depends on compiler
// settings, not for `import type`, where it does not.

/**
 * Remove block and line comments.
 *
 * The `[^:]` guard before `//` keeps `'https://…'` intact. It is not a parser:
 * a `//` inside a string that is not preceded by a colon is still stripped. That
 * is acceptable here because the only thing read afterwards is import
 * specifiers, and losing a URL from a string literal cannot invent or erase one.
 */
export function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** `import …ature… from 'spec'` and `export … from 'spec'`, capturing the clause between. */
const FROM_STATEMENT = /\b(?:import|export)\b([^'";]*?)\bfrom\s*['"]([^'"]+)['"]/g;
/** `import 'spec'` — a side-effect import, which has no clause and always runs. */
const SIDE_EFFECT = /\bimport\s*['"]([^'"]+)['"]/g;
/** `import('spec')` and `require('spec')`. */
const CALL = /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]/g;

/** A clause that is wholly type-only: `type X`, `type { X }`, `type * as X`. */
const TYPE_ONLY_CLAUSE = /^\s*type\s/;

/**
 * Every module specifier this source imports in a way that survives to runtime.
 *
 * Returns raw specifiers — resolution to a path is the caller's job, because
 * only the caller knows what it is resolving relative to.
 */
export function runtimeSpecifiers(src) {
  const text = stripComments(src);
  const found = [];

  for (const m of text.matchAll(FROM_STATEMENT)) {
    if (TYPE_ONLY_CLAUSE.test(m[1])) continue;
    found.push(m[2]);
  }
  for (const m of text.matchAll(SIDE_EFFECT)) found.push(m[1]);
  for (const m of text.matchAll(CALL)) found.push(m[1]);

  return found;
}
