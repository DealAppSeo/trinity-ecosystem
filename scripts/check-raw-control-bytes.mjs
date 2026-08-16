#!/usr/bin/env node
// scripts/check-raw-control-bytes.mjs — no canonical separator as a raw byte.
//
// Run: npm run check:raw-bytes
//
// WHY THIS EXISTS, AND WHY IT IS A CHECK RATHER THAN A RULE.
//
// `work-contract.ts` says it plainly: *"Written as an escape, never as a raw
// byte. A literal U+001F in source has landed here twice and both times was
// caught by a byte scan rather than by reading — it is invisible in every
// editor and survives review."*
//
// It landed a **third** time on 2026-08-15, in `checker-assignment.ts`, written
// by the agent that had read that warning the same session. The separator was
// authored as an escape and arrived on disk as the character itself.
//
// **`check:identity` caught it, in CI, exactly as designed** — it already runs
// this scan over `lib/trustshell/identity/`, and it turned the PR red. An
// earlier draft of this header said "nothing caught it", which was false and is
// corrected here: the existing guard worked. What did NOT catch it were the
// module's own 15 assertions, its 9/10 mutation run, `check:types`, and reading
// the diff — the defect is invisible to all four.
//
// So this file is not a replacement for that guard. It is the same scan with
// the scope the incident argues for, and **widening it immediately found the
// defect still live outside `identity/`**: two raw U+001F in the kernel
// (`loop.ts`, in the tool-call and observation fingerprints) and four raw NUL
// bytes in `agreement.ts`. That last one is not a new discovery — it is the
// incident `work-contract.ts` already describes, *"four raw NUL bytes once sat
// in this repo's wire formats … and the interop spec handed to the other lane
// was wrong because of it"* — still sitting there, believed fixed, in a pair
// key that two agents compare. All eleven were escaped in the same commit that
// added this check; behaviour is identical, because `\u0000` and the character
// compile to the same string.
//
// ── WHAT IT REFUSES, AND WHAT IT DELIBERATELY ALLOWS ─────────────────────────
//
// Refused: C0 control characters in source, except tab, newline and carriage
// return. Those three are ordinary whitespace and banning them would fail every
// file in the repo.
//
// This is NOT a general "no weird unicode" check. It is aimed at exactly the
// class that has cost time here — a control byte standing in for a separator
// that was meant to be an escape. Widening it to homoglyphs or zero-width
// characters would be a different check with a different false-positive
// profile, and inventing one before it has cost anything is how a suite fills
// with rules nobody trusts.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

/** Tab (09), newline (0A) and carriage return (0D) are ordinary whitespace. */
const ALLOWED = new Set([0x09, 0x0a, 0x0d]);

const SCAN_DIRS = ['lib', 'scripts', 'app', 'supabase'];
const SCAN_EXT = /\.(ts|tsx|mjs|js|sql)$/;
const SKIP_DIR = /(^|\/)(node_modules|\.next|\.git|dist|build)(\/|$)/;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (SKIP_DIR.test(full)) continue;
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (SCAN_EXT.test(full)) out.push(full);
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
const findings = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    for (const ch of lines[i]) {
      const code = ch.codePointAt(0);
      if (code < 0x20 && !ALLOWED.has(code)) {
        findings.push({
          file: relative(ROOT, file),
          line: i + 1,
          code: `U+${code.toString(16).toUpperCase().padStart(4, '0')}`,
        });
        break; // one finding per line is enough to fix it
      }
    }
  }
}

if (files.length === 0) {
  console.error('check:raw-bytes — NOT CHECKED. No source files were scanned.');
  process.exit(2);
}

if (findings.length > 0) {
  console.error(`\ncheck:raw-bytes — FAILED. ${findings.length} raw control byte(s):\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  contains ${f.code} as a raw byte`);
  }
  console.error(
    '\nWrite it as an escape instead — `\\u001f`, not the character. A raw control\n' +
      'byte is invisible in every editor and survives review; this has cost time\n' +
      'here three times. See work-contract.ts.\n'
  );
  process.exit(1);
}

console.log(
  `check:raw-bytes — VERIFIED. ${files.length} source files scanned, no raw C0 control bytes.`
);
