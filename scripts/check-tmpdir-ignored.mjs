#!/usr/bin/env node
// scripts/check-tmpdir-ignored.mjs — a scratch dir written INTO the repo must be
// ignored, and must never be tracked.
//
// WHY THIS EXISTS. Many suites typecheck into a scratch directory created with
// mkdtempSync(join(process.cwd(), PREFIX)), where PREFIX is a dotted literal such
// as the durable-ledger one below. (Written without quotes on purpose: this file
// is itself scanned by the parser below, and a quoted example would be picked up
// as a real call — it was, on the first run.) `mkdtemp` appends a
// random suffix, so the directory name is different every run — which means a
// `.gitignore` entry has to be a GLOB written by hand, and nobody is reminded to
// write it. The entry is added reactively, when someone notices.
//
// Measured 2026-08-17 on `main`: 34 such prefixes existed and only 11 had an
// entry. Two had already been committed —
//
//   .durable-ledger-check-JH8rRL/   (4 files, emitted .js + tsconfig, from #75)
//   .zk-cost-check-SZFzbE/
//
// — which is the defect CLAUDE.md already names twice: `.next/` was committed
// here (65 files) and so was `.claude/worktrees/`, both causing stale-build bugs.
// The random suffix makes it worse than those: each leak has a NEW name, so it
// never collides with an existing entry and never looks familiar in `git status`.
//
// WHAT THIS CHECKS. Two things, and the second is the one that bites:
//   1. every repo-writing scratch prefix has a matching `.gitignore` entry;
//   2. no file under such a prefix is TRACKED — an entry added after the commit
//      does not untrack what is already in the index, so (1) can pass while the
//      artifact stays in the tree.
//
// OUT OF SCOPE, deliberately. `mkdtempSync(join(tmpdir(), …))` writes to the OS
// temp directory, outside the repo, and can never be committed. Flagging those
// would be noise — 9 scripts use that form correctly.
//
// THREE OUTCOMES. VERIFIED / NOT CHECKED / FAILED. If `.gitignore` cannot be
// read or `git` cannot be run, that is NOT CHECKED — never a pass.

import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const results = [];
const record = (state, control, detail) => results.push({ state, control, detail });

// Only the `process.cwd()` form writes into the repo. The prefix is the literal
// passed to join(), e.g. '.durable-ledger-check-'.
const CWD_TMPDIR = /mkdtempSync\(\s*join\(\s*process\.cwd\(\)\s*,\s*'([^']+)'/g;

// ------------------------------------------------------------------- discover
let prefixes = new Map(); // prefix -> [script, …]
try {
  for (const f of readdirSync('scripts').filter((f) => f.endsWith('.mjs'))) {
    const src = readFileSync(`scripts/${f}`, 'utf8');
    for (const m of src.matchAll(CWD_TMPDIR)) {
      const list = prefixes.get(m[1]);
      if (list) list.push(f);
      else prefixes.set(m[1], [f]);
    }
  }
} catch (e) {
  record('NOT CHECKED', 'scripts are readable', `could not scan scripts/: ${e.message}`);
  prefixes = null;
}

// ------------------------------------------------------- 1. every prefix ignored
if (prefixes) {
  let ignore = null;
  try {
    ignore = readFileSync('.gitignore', 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  } catch (e) {
    record('NOT CHECKED', 'every scratch prefix is ignored', `could not read .gitignore: ${e.message}`);
  }

  if (ignore) {
    // An entry covers a prefix if it is that prefix followed by a glob, in any of
    // the shapes git accepts: `.foo-*/`, `.foo-*`, `/.foo-*/`.
    const covers = (p) =>
      ignore.some((line) => {
        const bare = line.replace(/^\//, '').replace(/\/$/, '');
        return bare === `${p}*` || bare === p;
      });

    const missing = [...prefixes.keys()].filter((p) => !covers(p)).sort();
    if (missing.length) {
      record(
        'FAILED',
        'every scratch prefix is ignored',
        `${missing.length} of ${prefixes.size} prefixes have no .gitignore entry:\n` +
          missing.map((p) => `      ${p}*/   (${prefixes.get(p).join(', ')})`).join('\n') +
          `\n    Add each as \`${'<prefix>'}*/\`. The suffix is random per run, so the entry MUST be a glob.`
      );
    } else {
      record(
        'VERIFIED',
        'every scratch prefix is ignored',
        `all ${prefixes.size} repo-writing prefixes have a .gitignore glob`
      );
    }
  }
}

// --------------------------------------------- 2. nothing under them is tracked
// This is the half that an added .gitignore entry does NOT fix: ignoring a path
// has no effect on a path already in the index.
if (prefixes && prefixes.size) {
  let tracked = null;
  try {
    tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\0')
      .filter(Boolean);
  } catch (e) {
    record('NOT CHECKED', 'no scratch artifact is tracked', `could not run git ls-files: ${e.message}`);
  }

  if (tracked) {
    const leaked = tracked.filter((f) => [...prefixes.keys()].some((p) => f.startsWith(p)));
    if (leaked.length) {
      const dirs = [...new Set(leaked.map((f) => f.split('/')[0]))].sort();
      record(
        'FAILED',
        'no scratch artifact is tracked',
        `${leaked.length} tracked file(s) under ${dirs.length} scratch dir(s): ${dirs.join(', ')}\n` +
          `    A .gitignore entry does NOT untrack what is already committed.\n` +
          `    Remove with: git rm -r --cached ${dirs.map((d) => `'${d}'`).join(' ')}`
      );
    } else {
      record('VERIFIED', 'no scratch artifact is tracked', 'no tracked file sits under a scratch prefix');
    }
  }
}

if (prefixes && prefixes.size === 0) {
  record('NOT CHECKED', 'scratch prefixes found', 'no mkdtemp-into-cwd call found — parser may be stale');
}

// ------------------------------------------------------------------- report
const width = Math.max(...results.map((r) => r.control.length));
console.log('\nScratch directories — written into the repo, so they must be ignored AND untracked\n');
for (const r of results) {
  const mark = r.state === 'VERIFIED' ? '✓' : r.state === 'FAILED' ? '✗' : '·';
  console.log(`  ${mark} ${r.control.padEnd(width)}  ${r.state}`);
  console.log(`    ${r.detail}`);
}
const failed = results.filter((r) => r.state === 'FAILED').length;
const unchecked = results.filter((r) => r.state === 'NOT CHECKED').length;
const verified = results.filter((r) => r.state === 'VERIFIED').length;
if (prefixes) {
  console.log(`\n  ${prefixes.size} repo-writing prefixes; ${[...new Set([...prefixes.values()].flat())].length} scripts`);
}
console.log(`\ncheck:tmpdir-ignored — ${verified} VERIFIED, ${unchecked} NOT CHECKED, ${failed} FAILED.`);
// Exit codes carry the verdict (CLAUDE.md): 0 VERIFIED, 2 NOT_CHECKED, else FAILED.
process.exit(failed > 0 ? 1 : unchecked > 0 ? 2 : 0);
