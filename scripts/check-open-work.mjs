#!/usr/bin/env node
//
// check-open-work.mjs — did you read the open entry before working next to it?
//
//   npm run check:open-work        the gate (compares this branch against main)
//   npm run why:open <term>        the LOOKUP — run this BEFORE starting
//
// ============================================================================
// THE DAY THIS COST
// ============================================================================
//
// On 2026-08-16 an agent spent most of a session establishing why HAL stopped on
// 2026-07-17 at 22:18 UTC. It was already root-caused the previous day by another
// lane and filed as an OPEN entry owned by Sean — one that ruled out four
// candidates by evidence and flagged a trap the re-derivation then walked into
// twice.
//
// CLAUDE.md's first line is "FIRST: read docs/PRIOR-WORK-INDEX.md". The index
// header says its purpose is to "stop agents redoing work that is already done".
// Neither worked, because neither is mechanical. `check:prior-work` enforces the
// file's other halves — no new doc may cite a retracted number, every doc must be
// indexed — and structurally cannot verify that anyone READ an open entry.
//
// ============================================================================
// THE GATE IS THE SECOND-BEST HALF, AND THAT IS WORTH SAYING
// ============================================================================
//
// A CI gate fires at PR time — after the wasted day, not before it. It stops the
// merge and forces the entry to be read, which is real but late.
//
// `npm run why:open <term>` is the half that actually pays: one command, run
// before starting, that prints every open entry whose scope mentions the thing
// you are about to touch. The gate exists to make skipping the lookup visible;
// the lookup exists so the gate never has to fire.
//
// FAILS OPEN ON PURPOSE in one place: if the diff against main cannot be
// computed (detached checkout, missing ref, shallow clone), this reports
// NOT_CHECKED and exits 2 rather than passing. Exit 2 is this repo's
// NOT_CHECKED code — see scripts/check-all.mjs. A gate that silently passes when
// it cannot see the diff is the house defect wearing a seatbelt.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const INDEX = 'docs/PRIOR-WORK-INDEX.md';
const argv = process.argv.slice(2);
const lookupTerm = argv[0] && !argv[0].startsWith('--') ? argv.join(' ') : null;

const outDir = mkdtempSync(join(process.cwd(), '.open-work-check-'));
let mod;
try {
  execFileSync(
    localTsc(),
    ['lib/trustshell/priorwork/open-index.ts', '--outDir', outDir, '--rootDir', 'lib',
     '--module', 'commonjs', '--target', 'es2022', '--lib', 'es2022,dom',
     '--moduleResolution', 'node', '--strict'],
    { stdio: 'pipe' }
  );
  mod = await import(pathToFileURL(join(outDir, 'trustshell', 'priorwork', 'open-index.js')).href);
} catch (err) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('FAILED — open-index does not compile:\n' + `${err.stdout ?? ''}${err.stderr ?? ''}`);
  process.exit(1);
}
rmSync(outDir, { recursive: true, force: true });

const { parseOpenEntries, assessChange, scopeMatches } = mod;
const entries = parseOpenEntries(readFileSync(INDEX, 'utf8'));

// ---------------------------------------------------------------------------
// LOOKUP MODE — the half that pays. Run before starting.
// ---------------------------------------------------------------------------

if (lookupTerm) {
  const change = { paths: [lookupTerm], diffText: lookupTerm };
  const hits = entries.filter((e) => e.scope.some((t) => scopeMatches(t, change)));
  const loose = entries.filter(
    (e) => !hits.includes(e) &&
      (e.item.toLowerCase().includes(lookupTerm.toLowerCase()) ||
       e.note.toLowerCase().includes(lookupTerm.toLowerCase()))
  );

  if (hits.length === 0 && loose.length === 0) {
    console.log(`why:open — nothing open matches "${lookupTerm}" (${entries.length} open entries scanned).`);
    console.log('That is not proof the work is new: only entries carrying a [scope: …] marker');
    console.log('are matched by scope, and the rest match only on their own text.');
    process.exit(0);
  }
  for (const [label, list] of [['SCOPED MATCH', hits], ['mentions it', loose]]) {
    for (const e of list) {
      console.log(`\n=== ${label}: ${e.item}`);
      console.log(`    owner: ${e.owner}`);
      console.log(`    cite as: PRIOR-WORK: ${e.slug}`);
      console.log(`    ${e.note.replace(/\s+/g, ' ').slice(0, 600)}`);
    }
  }
  console.log(`\n${hits.length} scoped, ${loose.length} textual. Read these BEFORE building.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// GATE MODE
// ---------------------------------------------------------------------------

const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

let base, paths, diffText, commitMessages, indexDiff;
try {
  base = git(['merge-base', 'HEAD', 'origin/main']).trim();
  paths = git(['diff', '--name-only', `${base}..HEAD`]).split('\n').filter(Boolean);
  diffText = git(['diff', `${base}..HEAD`]);
  commitMessages = git(['log', '--format=%B', `${base}..HEAD`]);
  indexDiff = git(['diff', `${base}..HEAD`, '--', INDEX]);
} catch (err) {
  console.log(`check:open-work — NOT CHECKED: cannot diff against origin/main (${String(err.message).split('\n')[0]}).`);
  console.log('A gate that passes when it cannot see the diff would be worse than none.');
  process.exit(2);
}

if (paths.length === 0) {
  console.log('check:open-work — VERIFIED. No changes against origin/main.');
  process.exit(0);
}

const scoped = entries.filter((e) => e.scope.length > 0);
const verdicts = assessChange(entries, { paths, diffText }, commitMessages, indexDiff);
const unacknowledged = verdicts.filter((v) => !v.acknowledged);

console.log(
  `check:open-work — ${paths.length} changed file(s) against origin/main; ` +
    `${entries.length} open entries, ${scoped.length} scoped; ` +
    `${verdicts.length} touched, ${unacknowledged.length} unacknowledged.`
);

if (unacknowledged.length > 0) {
  console.error(`\nFAILED — this branch touches ${unacknowledged.length} OPEN item(s) it never cites:\n`);
  for (const v of unacknowledged) {
    console.error(`  ${v.entry.item}`);
    console.error(`    owner   : ${v.entry.owner}`);
    console.error(`    matched : ${v.matchedOn.join(', ')}`);
    console.error(`    ${v.entry.note.replace(/\s+/g, ' ').slice(0, 700)}\n`);
  }
  console.error(
    'Read the entries above. They may already answer what you are building, name a\n' +
      'trap, or belong to someone else. On 2026-08-16 a session re-derived an entire\n' +
      'root cause that one of these entries already recorded — including four\n' +
      'candidates it had ruled out by evidence.\n' +
      '\n' +
      'Then do ONE of:\n' +
      '  - add `PRIOR-WORK: <slug>` to a commit message on this branch, or\n' +
      '  - update the entry in docs/PRIOR-WORK-INDEX.md with what you learned.\n' +
      '\n' +
      'Next time, run this first:  npm run why:open <table-or-path>'
  );
  process.exit(1);
}

console.log('check:open-work — VERIFIED. Every open item this branch touches is cited.');
