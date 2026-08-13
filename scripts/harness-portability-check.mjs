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

// Any import specifier that is not a sibling inside this directory.
const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g;
const ALLOWED_PREFIX = '@/lib/trustshell/harness/';

for (const file of files) {
  const src = readFileSync(join(DIR, file), 'utf8');

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

console.log(`\nharness-portability: scanned ${files.length} file(s) in ${DIR}`);
if (violations.length > 0) {
  console.error(`\n${violations.length} violation(s):\n`);
  for (const v of violations) console.error(`  ${v}`);
  console.error('\nThe harness must stay dependency-free so it can ship as a package.\n');
  process.exit(1);
}
console.log('Portable: no external imports, no runtime globals, no require().\n');
