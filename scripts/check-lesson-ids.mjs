#!/usr/bin/env node
// scripts/check-lesson-ids.mjs — every LESSONS id resolves to exactly one entry.
//
// Run: npm run check:lesson-ids
//
// Logic lives in `lib/trustshell/lessons/ids.ts` so it can be asserted directly
// and mutation-tested; this file is the IO and the verdict. Three outcomes:
// 0 VERIFIED, 2 NOT_CHECKED, 1 FAILED.
//
// See that module's header for why this check exists. Short version: on
// 2026-08-16 LESSONS.md carried two `A19` headings and two `A20` headings, and
// three live citations pointed at those ambiguous tokens.

import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { localTsc } from './local-tsc.mjs';

const ROOT = process.cwd();
const LESSONS = join(ROOT, 'LESSONS.md');

const SCAN_DIRS = ['.', 'lib', 'scripts', 'app', 'docs', 'supabase'];
const SCAN_EXT = /\.(md|ts|tsx|mjs|js|sql)$/;
// Every dot-directory, not a hand-kept list. The first draft named `.next`,
// `.git` and `.claude` explicitly and therefore walked into this check's OWN
// temp output directory, `.lesson-ids-check-*` — so the compiled copy of
// `ids.ts` was scanned as if it were a source file and its header comment's
// citations were counted twice. The reported citation total moved between runs
// because the directory name is random. A scan that includes its own build
// output measures itself.
const SKIP_DIR = /(^|\/)(node_modules|dist|build|\.[^/]+)(\/|$)/;

function walk(dir, out = [], depth = 0) {
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
    if (st.isDirectory()) walk(full, out, depth + 1);
    else if (SCAN_EXT.test(full)) out.push(full);
  }
  return out;
}

if (!existsSync(LESSONS)) {
  console.error('check:lesson-ids — NOT CHECKED. LESSONS.md not found.');
  process.exit(2);
}

// The module is TypeScript with zero imports, so it compiles standalone — a
// sibling using the `@/` alias could not, which is why this directory has none.
const outDir = mkdtempSync(join(ROOT, '.lesson-ids-check-'));
process.on('exit', () => rmSync(outDir, { recursive: true, force: true }));

let mod;
try {
  execFileSync(
    localTsc(),
    ['lib/trustshell/lessons/ids.ts', '--outDir', outDir, '--rootDir', 'lib',
     '--module', 'commonjs', '--target', 'es2022', '--lib', 'es2022,dom',
     '--moduleResolution', 'node', '--strict'],
    { stdio: 'pipe' }
  );
  mod = await import(pathToFileURL(join(outDir, 'trustshell', 'lessons', 'ids.js')).href);
} catch (err) {
  console.error(
    'check:lesson-ids — FAILED. ids module does not compile:\n' +
      `${err.stdout ?? ''}${err.stderr ?? ''}`
  );
  process.exit(1);
}

const { parseLessonDefs, parseCitations, duplicateDefs, danglingCitations, ambiguousCitations } =
  mod;

// --- self-test: the detector must actually fire ----------------------------
//
// THIS IS THE LOAD-BEARING PART. The tree is currently clean, so a scan that
// finds nothing is the expected outcome — which means a detector that CANNOT
// find anything prints exactly the same green line. "A checker that cannot fire
// and a checker with nothing to find look identical from the outside"
// (`check-schema-names.mjs`, same reasoning). Every assertion below runs against
// fixture text, so it is red whenever the logic is broken regardless of what
// LESSONS.md happens to contain today.
//
// The first fixture is the real 2026-08-16 defect, reduced: two `## A19`
// headings on unrelated failures, plus the two citation shapes that made it
// matter.
const FIXTURE_DUPE = [
  '# LESSONS — failure log',
  '',
  '## A19 — the documented rule that was enforced in one directory (2026-08-15)',
  'body',
  '',
  '## A19 — `npm run check` was 52 VERIFIED, and CI still went red (2026-08-16)',
  'body',
  '',
  '## A20 — two correct components, one value, two meanings (2026-08-15)',
].join('\n');

const FIXTURE_CLEAN = [
  '## A19 — the documented rule that was enforced in one directory (2026-08-15)',
  '**A4. Asserted a credential was disabled without measuring it.**',
  '**S1. Two tables are effectively world-readable.**',
].join('\n');

const selfTest = [
  [
    'two headings with the same ID are a duplicate',
    () => duplicateDefs(parseLessonDefs(FIXTURE_DUPE)).length === 1,
  ],
  [
    'the duplicate report names both sites, so a human can pick which one moves',
    () => duplicateDefs(parseLessonDefs(FIXTURE_DUPE))[0]?.sites.length === 2,
  ],
  [
    'a clean file yields no duplicates',
    () => duplicateDefs(parseLessonDefs(FIXTURE_CLEAN)).length === 0,
  ],
  [
    'inline bold labels are definitions — CLAUDE.md cites A4 and S1, which exist only in that form',
    () => {
      const ids = parseLessonDefs(FIXTURE_CLEAN).map((d) => d.id);
      return ids.includes('A4') && ids.includes('S1');
    },
  ],
  [
    'the series letter is part of the ID: A19 and S19 are different entries',
    () => duplicateDefs(parseLessonDefs('## A19 — x\n## S19 — y')).length === 0,
  ],
  [
    'a citation to a duplicated ID is reported ambiguous',
    () =>
      ambiguousCitations(parseCitations('see LESSONS A19', 'f.md'), parseLessonDefs(FIXTURE_DUPE))
        .length === 1,
  ],
  [
    'a citation to a single-definition ID is NOT ambiguous',
    () =>
      ambiguousCitations(parseCitations('see LESSONS A20', 'f.md'), parseLessonDefs(FIXTURE_DUPE))
        .length === 0,
  ],
  [
    'a citation to an ID that does not exist is dangling, not ambiguous',
    () => {
      const cites = parseCitations('see LESSONS A99', 'f.md');
      const d = parseLessonDefs(FIXTURE_DUPE);
      return danglingCitations(cites, d).length === 1 && ambiguousCitations(cites, d).length === 0;
    },
  ],
  [
    'dangling and ambiguous are separate verdicts — collapsing them hides which one you have',
    () => {
      const cites = parseCitations('LESSONS A19 and LESSONS A99', 'f.md');
      const d = parseLessonDefs(FIXTURE_DUPE);
      return danglingCitations(cites, d).length === 1 && ambiguousCitations(cites, d).length === 1;
    },
  ],
  [
    'the LESSONS prefix is required, so a bare A4 in prose is not a citation',
    () => parseCitations('an A4 sheet of paper, an S3 bucket', 'f.md').length === 0,
  ],
  [
    'a heading must start the line — one quoted inside a table cell is not a definition',
    () => parseLessonDefs('| x | ## A19 — quoted | y |').length === 0,
  ],
  [
    'citations are located, not just counted — the report has to say where to edit',
    () => {
      const c = parseCitations('x\ny LESSONS A19', 'docs/f.md')[0];
      return c?.line === 2 && c?.file === 'docs/f.md';
    },
  ],
];

const selfFailures = selfTest.filter(([, fn]) => {
  try {
    return fn() !== true;
  } catch {
    return true;
  }
});

if (selfFailures.length > 0) {
  console.error(
    `\ncheck:lesson-ids — FAILED. ${selfFailures.length} of ${selfTest.length} self-test ` +
      'assertions failed, so a clean scan would prove nothing:\n'
  );
  for (const [name] of selfFailures) console.error(`  ${name}`);
  process.exit(1);
}

const defs = parseLessonDefs(readFileSync(LESSONS, 'utf8'));

if (defs.length === 0) {
  console.error(
    'check:lesson-ids — NOT CHECKED. No lesson IDs were parsed out of LESSONS.md.\n' +
      'The file exists, so either its heading format changed or the parser is broken.\n' +
      'A clean scan over zero definitions proves nothing.'
  );
  process.exit(2);
}

// This file is excluded from the citation scan, and the exclusion is printed in
// the verdict rather than kept quiet.
//
// WHY. The self-test above must contain a citation to an ID that does not exist
// (`LESSONS A99`) and citations to a duplicated one — that is what proves the
// dangling and ambiguous branches fire. Scanned as ordinary source, those
// fixtures are indistinguishable from real broken references and the check fails
// on itself. The first draft did exactly that.
//
// KNOWN LIMIT, stated rather than hidden: a genuine `LESSONS <id>` citation
// written in prose inside THIS file is not verified. The cost is one file; the
// alternative — obfuscating the fixtures so the scanner cannot see them, e.g.
// `'LESSONS ' + 'A99'` — would make the self-test stop resembling the thing it
// models, and a fixture that does not look like the real input is the weaker
// trade.
const SELF = 'scripts/check-lesson-ids.mjs';

const files = [...new Set(SCAN_DIRS.flatMap((d) => walk(join(ROOT, d))))].filter(
  (f) => relative(ROOT, f) !== SELF
);
// LESSONS.md is scanned for citations too: entries cross-reference each other,
// and a cross-reference to an ambiguous ID is exactly as useless as an external
// one.
const citations = files.flatMap((f) =>
  parseCitations(readFileSync(f, 'utf8'), relative(ROOT, f))
);

const dupes = duplicateDefs(defs);
const dangling = danglingCitations(citations, defs);
const ambiguous = ambiguousCitations(citations, defs);

let failed = false;

if (dupes.length > 0) {
  failed = true;
  console.error(`\ncheck:lesson-ids — FAILED. ${dupes.length} ID(s) defined more than once:\n`);
  for (const { id, sites } of dupes) {
    console.error(`  ${id}`);
    for (const s of sites) console.error(`    LESSONS.md:${s.line}  ${s.title}`);
  }
}

if (ambiguous.length > 0) {
  failed = true;
  console.error(`\n${ambiguous.length} citation(s) point at an ambiguous ID:\n`);
  for (const c of ambiguous) console.error(`  ${c.file}:${c.line}  cites LESSONS ${c.id}`);
}

if (dangling.length > 0) {
  failed = true;
  console.error(`\n${dangling.length} citation(s) point at an ID that does not exist:\n`);
  for (const c of dangling) console.error(`  ${c.file}:${c.line}  cites LESSONS ${c.id}`);
}

if (failed) {
  console.error(
    '\nThe ID is the whole reference — there is no line number or link beside it.\n' +
      'Give the newer entry the next free number and update its citations. Do NOT\n' +
      'renumber an entry that older documents already cite.\n'
  );
  process.exit(1);
}

console.log(
  `check:lesson-ids — VERIFIED. ${defs.length} lesson ID(s) each defined once; ` +
    `${citations.length} citation(s) across ${files.length} files all resolve. ` +
    `${selfTest.length} self-test assertions passed. NOT scanned: ${SELF} (its own fixtures).`
);
