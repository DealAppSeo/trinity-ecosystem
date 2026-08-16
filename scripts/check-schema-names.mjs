#!/usr/bin/env node
//
// check-schema-names.mjs — no code may query a table that holds nothing.
//
//   npm run check:schema-names
//
// ============================================================================
// THE MISTAKE THIS CLOSES, WHICH IS THE SAME MISTAKE EVERY TIME
// ============================================================================
//
// Something is identified by NAME, the name looks right, the conclusion is
// wrong. CLAUDE.md records it at the deployment layer: `hyperdag-org` and
// `trustrails-dev` are named after domains they do not serve, and both produced
// published findings that had to be retracted.
//
// Measured 2026-08-16, the database is worse: 623 tables, 501 of them empty,
// 66 with >= 100 rows. Four out of five are debris, and seven pieces of that
// debris are named almost exactly like the table that matters —
// `trinity_task_archive` (47,141 rows) vs `trinity_tasks_archive` (0), one
// letter apart.
//
// This has been found and written down at least three times already:
//   LESSONS.md          — a recall path checked `agents`, `trinity_agents`,
//                         `agent_kya_registry`, found them empty, and concluded
//                         there was no agent registry
//   AGENT-MEMORY-SPEC.md — the same incident, corrected
//   ROADMAP-HYBRID-REPID.md — lists 30+ empty RepID tables
//
// Written down three times and still repeatable, because none of it was
// mechanical. This is the mechanical half.
//
// WHAT IT DELIBERATELY DOES NOT FLAG. Prose. Every existing mention of a decoy
// in this repo is documentation ABOUT the problem. Failing those would force
// someone to delete the record of a correction to get a green build — the same
// reason check-prior-work.mjs allowlists its historical files rather than
// demanding they be edited. Only a real query counts: `.from('x')`, `FROM x`,
// `INSERT INTO x`, `JOIN x`.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const ROOT = process.cwd();
const outDir = mkdtempSync(join(ROOT, '.schema-names-check-'));

let mod;
try {
  execFileSync(
    localTsc(),
    ['lib/trustshell/schema/decoys.ts', '--outDir', outDir, '--rootDir', 'lib',
     '--module', 'commonjs', '--target', 'es2022', '--lib', 'es2022,dom',
     '--moduleResolution', 'node', '--strict'],
    { stdio: 'pipe' }
  );
  mod = await import(pathToFileURL(join(outDir, 'trustshell', 'schema', 'decoys.js')).href);
} catch (err) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('FAILED — decoys module does not compile:\n' + `${err.stdout ?? ''}${err.stderr ?? ''}`);
  process.exit(1);
}

const { DECOYS, decoyFor, usesAsTable, MEASURED_ON } = mod;

// --- self-test: the matcher must separate a query from prose ---------------
//
// Without this the scanner could match nothing at all and still print a clean
// green line, which is precisely the failure mode the whole repo is built
// against. A checker that cannot fire and a checker with nothing to find look
// identical from the outside.
const selfTest = [
  ["supabase.from('repid_scores')", 'repid_scores', true, 'supabase-js call'],
  ['select * from public.repid_scores', 'repid_scores', true, 'SQL FROM with schema'],
  ['SELECT x FROM repid_scores r', 'repid_scores', true, 'SQL FROM bare'],
  ['insert into repid_scores (a) values (1)', 'repid_scores', true, 'INSERT INTO'],
  ['left join repid_scores on ...', 'repid_scores', true, 'JOIN'],
  ['`repid_scores` is empty — see LESSONS.md', 'repid_scores', false, 'prose in a doc'],
  ['the repid_scores table was never populated', 'repid_scores', false, 'prose, no verb'],
  ["from('repid_score_events')", 'repid_scores', false, 'the LIVE table must not match'],
];
const selfFailures = [];
for (const [line, table, want, why] of selfTest) {
  if (usesAsTable(line, table) !== want) selfFailures.push(`${why}: ${JSON.stringify(line)}`);
}
if (selfFailures.length > 0) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('FAILED — the decoy matcher does not work, so a clean scan would prove nothing:\n');
  for (const f of selfFailures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

// --- scan -------------------------------------------------------------------

const CODE = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.sql']);
const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.claude']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (CODE.has(entry.slice(entry.lastIndexOf('.')))) out.push(full);
  }
  return out;
}

// Generated from the live schema; it names every table including the decoys,
// and rewriting it by hand would be wrong.
const IGNORE_FILES = [/database\.types\.ts$/, /schema\/decoys\.ts$/, /check-schema-names\.mjs$/];

const files = walk(ROOT).filter((f) => !IGNORE_FILES.some((re) => re.test(f)));
const violations = [];

for (const full of files) {
  const rel = relative(ROOT, full);
  const lines = readFileSync(full, 'utf8').split('\n');
  for (const [i, line] of lines.entries()) {
    for (const d of DECOYS) {
      if (!line.includes(d.decoy)) continue;
      if (usesAsTable(line, d.decoy)) {
        violations.push({ file: rel, line: i + 1, ...d, text: line.trim().slice(0, 100) });
      }
    }
  }
}

console.log(
  `check:schema-names — ${files.length} code file(s) scanned for ${DECOYS.length} ` +
    `empty decoy table(s) [measured ${MEASURED_ON}]; matcher self-test ${selfTest.length}/${selfTest.length}.`
);

rmSync(outDir, { recursive: true, force: true });

if (violations.length > 0) {
  console.error(`\nFAILED — ${violations.length} quer${violations.length === 1 ? 'y' : 'ies'} against an EMPTY table:\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.text}`);
    console.error(`    ${v.decoy} holds 0 rows. You want ${v.live} (${v.liveRows.toLocaleString()} rows).`);
    console.error(`    ${v.note}\n`);
  }
  console.error(
    'A query against an empty table returns [] and no error, so this reads as\n' +
      '"the data does not exist" rather than "I asked the wrong table". That exact\n' +
      'confusion is recorded in LESSONS.md and docs/AGENT-MEMORY-SPEC.md.\n' +
      '\n' +
      'Each of these tables also carries a COMMENT in Postgres naming its live\n' +
      'counterpart — visible in \\d, the Supabase table editor, and generated types.'
  );
  process.exit(1);
}

console.log('check:schema-names — VERIFIED. No code queries a table that holds nothing.');
