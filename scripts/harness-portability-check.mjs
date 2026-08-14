#!/usr/bin/env node
// scripts/harness-portability-check.mjs — enforce the portability constraint.
//
// lib/trustshell/harness/ must stay shippable as a standalone package: no
// Supabase, no Next, no repo-internal imports, no Node built-ins. types.ts
// claims this is "enforced, not aspirational", and this is the enforcement.
// Without it the claim is exactly the kind of unearned assertion this harness
// was written to stop making.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'lib/trustshell/harness';
const files = readdirSync(DIR).filter((f) => f.endsWith('.ts'));

const violations = [];

/**
 * Strip comments so the scan reads CODE, not prose.
 *
 * FIXED 2026-08-14. This check reported a violation for eight sprints and was
 * misread as passing that whole time. The "violation" was a sentence in
 * transform.ts: "the most disposable thing in the window." — the word window
 * followed by a full stop, matching the banned `window.` token.
 *
 * A comment cannot tie the harness to a runtime; only code can. And a checker
 * that fires on English gets worked around by rewording the English, which
 * leaves the real constraint unenforced while looking green. So comments are
 * removed before scanning rather than the prose being edited.
 *
 * Quotes are tracked because `'https://x'` contains `//` and a naive stripper
 * would eat the rest of the line — including, potentially, a real violation.
 */
function stripComments(src) {
  let out = '';
  let i = 0;
  let quote = null; // "'", '"', '`', or null
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (quote) {
      if (c === '\\') {
        out += c + (next ?? '');
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      out += c;
      i += 1;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue; // newline preserved by the loop
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n'; // keep line numbers honest
        i += 1;
      }
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

// Any import specifier that is not a sibling inside this directory.
const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g;
const ALLOWED_PREFIX = '@/lib/trustshell/harness/';

for (const file of files) {
  const src = stripComments(readFileSync(join(DIR, file), 'utf8'));

  for (const match of src.matchAll(IMPORT_RE)) {
    const spec = match[1];
    const ok = spec.startsWith(ALLOWED_PREFIX) || spec.startsWith('./');
    if (!ok) {
      violations.push(`${DIR}/${file}: imports '${spec}' — only sibling harness modules are allowed.`);
    }
  }

  // Bare `require(` would smuggle a dependency past the import scan.
  if (/\brequire\s*\(/.test(src)) {
    violations.push(`${DIR}/${file}: uses require(), which bypasses the import allowlist.`);
  }

  // Globals that tie the harness to one runtime. `globalThis` is permitted
  // because replay.ts feature-detects structuredClone through it, which is the
  // portable way to reach an optional global rather than assuming a runtime.
  for (const banned of ['process.env', '__dirname', 'window.', 'document.']) {
    if (src.includes(banned)) {
      violations.push(`${DIR}/${file}: references '${banned}', tying the harness to a runtime.`);
    }
  }
}

if (files.length === 0) {
  console.error(`harness-portability: no .ts files found in ${DIR} — check the path.`);
  process.exit(1);
}

// Report in the SAME `N passed, M failed` shape as every other suite here.
//
// This is not cosmetic. The old output printed a prose line on failure and a
// different prose line on success, so a runner grepping for the common shape
// matched neither and fell through to its own default — which said "ok". That
// is how a red check read as green for eight sprints. One format across all
// suites means a naive grep cannot invent a pass.
console.log(`\nharness-portability: scanned ${files.length} file(s) in ${DIR}`);
console.log(
  `harness-portability: ${files.length - violations.length} passed, ${violations.length} failed`
);
if (violations.length > 0) {
  console.error(`\n${violations.length} violation(s):\n`);
  for (const v of violations) console.error(`  ${v}`);
  console.error('\nThe harness must stay dependency-free so it can ship as a package.\n');
  process.exit(1);
}
console.log('Portable: no external imports, no runtime globals, no require().\n');
