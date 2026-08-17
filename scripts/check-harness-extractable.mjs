#!/usr/bin/env node
// scripts/check-harness-extractable.mjs — the harness must COMPILE outside this repo.
//
// WHY THIS EXISTS, next to check:harness-portable rather than instead of it.
//
// `harness-portability-check.mjs` scans imports: sibling-only specifiers, no
// require(), no `process.env` / `__dirname` / `window.` / `document.`. That is a
// real constraint and it passes today, 16 files, 0 violations.
//
// It cannot see two things, and both were measured on 2026-08-17:
//
//   1. THE ALIAS. 18 of the 19 imports are `@/lib/trustshell/harness/…`, which
//      resolves only through this repo's tsconfig `paths`. The portability check
//      ALLOWS that prefix by design, so the suite is green while the directory
//      does not compile anywhere else. Copied out as-is against a bare tsconfig
//      it produced 20 × TS2307 "Cannot find module '@/lib/trustshell/harness/…'".
//
//   2. AMBIENT GLOBALS. A file can depend on `fetch`, `crypto`, `Buffer` or a
//      DOM type without importing anything, so an import scan cannot detect it.
//      Only a compile against a bare `lib` and `types: []` can.
//
// So this gate does not read the code — it EXTRACTS it and builds it: copy the
// directory out, rewrite the alias to relative, compile with `lib: ["ES2022"]`,
// `types: []`, `strict`, no DOM and no @types/node. Zero errors means the
// package is genuinely shippable; anything else names the coupling.
//
// Measured when this was written: **0 errors**. The harness is portable in
// substance — `structuredClone` is feature-detected off `globalThis` with a JSON
// fallback (replay.ts), and `Math.random` / `Date.now` sit behind the injectable
// `Rng` and `Clock` seams rather than being called inline. The alias is the only
// thing standing between it and `npm publish`.
//
// THREE OUTCOMES. VERIFIED / NOT CHECKED / FAILED. If `tsc` cannot be run this
// reports NOT CHECKED — never a pass.

import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const DIR = 'lib/trustshell/harness';
const ALIAS = '@/lib/trustshell/harness/';

const results = [];
const record = (state, control, detail) => results.push({ state, control, detail });

let out = null;
let errors = null;
let files = [];
let aliasFiles = 0;

try {
  files = readdirSync(DIR).filter((f) => f.endsWith('.ts'));
} catch (e) {
  record('NOT CHECKED', 'harness directory is readable', `${DIR}: ${e.message}`);
}

if (files.length) {
  // Written into the repo, so `.gitignore` must carry `.harness-extract-check-*/`
  // and check:tmpdir-ignored enforces that it does.
  out = mkdtempSync(join(process.cwd(), '.harness-extract-check-'));
  try {
    mkdirSync(join(out, 'src'));
    let rewritten = 0;
    for (const f of files) {
      const src = readFileSync(join(DIR, f), 'utf8');
      const relative = src.split(ALIAS).join('./');
      if (relative !== src) { rewritten += 1; aliasFiles += 1; }
      writeFileSync(join(out, 'src', f), relative);
    }

    // Deliberately hostile: no DOM, no @types/node, no repo paths, strict.
    writeFileSync(
      join(out, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'bundler',
            lib: ['ES2022'],
            types: [],
            strict: true,
            noEmit: true,
            skipLibCheck: false,
          },
          include: ['src/**/*.ts'],
        },
        null,
        2
      )
    );

    record(
      'VERIFIED',
      'the directory extracts',
      `${files.length} file(s) copied; the repo alias was rewritten in ${rewritten}`
    );

    try {
      execFileSync('npx', ['tsc', '-p', join(out, 'tsconfig.json')], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      errors = [];
    } catch (e) {
      const text = `${e.stdout ?? ''}${e.stderr ?? ''}`;
      if (!/error TS/.test(text)) {
        record('NOT CHECKED', 'the extracted package compiles', `tsc could not run: ${text.trim().slice(0, 300)}`);
      } else {
        errors = text.split('\n').filter((l) => /error TS/.test(l));
      }
    }

    if (errors !== null) {
      if (errors.length === 0) {
        record(
          'VERIFIED',
          'the extracted package compiles',
          '0 errors under lib:["ES2022"], types:[], strict — no DOM, no @types/node, no repo paths'
        );
      } else {
        record(
          'FAILED',
          'the extracted package compiles',
          `${errors.length} error(s) outside this repo. The harness claims to be shippable standalone:\n` +
            errors.slice(0, 8).map((l) => `      ${l.replace(/^.*[\\/]src[\\/]/, 'src/')}`).join('\n') +
            (errors.length > 8 ? `\n      … ${errors.length - 8} more` : '')
        );
      }
    }
  } finally {
    if (out) rmSync(out, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------------- report
const width = Math.max(...results.map((r) => r.control.length));
console.log('\nHarness extractability — it must compile OUTSIDE this repo, not merely import cleanly\n');
for (const r of results) {
  const mark = r.state === 'VERIFIED' ? '✓' : r.state === 'FAILED' ? '✗' : '·';
  console.log(`  ${mark} ${r.control.padEnd(width)}  ${r.state}`);
  console.log(`    ${r.detail}`);
}
const failed = results.filter((r) => r.state === 'FAILED').length;
const unchecked = results.filter((r) => r.state === 'NOT CHECKED').length;
const verified = results.filter((r) => r.state === 'VERIFIED').length;
console.log(
  `\n  NOTE: ${aliasFiles} of ${files.length} file(s) import via \`${ALIAS}\`, which resolves only here.` +
    `\n  This gate rewrites it to prove the code is portable; it does not make the directory\n` +
    `  drop-in publishable. That fix is changing the imports to relative — lib/ territory.`
);
console.log(`\ncheck:harness-extractable — ${verified} VERIFIED, ${unchecked} NOT CHECKED, ${failed} FAILED.`);
// Exit codes carry the verdict (CLAUDE.md): 0 VERIFIED, 2 NOT_CHECKED, else FAILED.
process.exit(failed > 0 ? 1 : unchecked > 0 ? 2 : 0);
