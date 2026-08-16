#!/usr/bin/env node
// scripts/check-lessons-numbering.mjs — a citation must resolve to one lesson.
//
// WHY THIS EXISTS. `LESSONS.md` is a shared surface: every lane appends to it,
// and the append-only rule in docs/AGENT-LOOP-PROMPTS.md keeps those appends
// merging textually. It does NOT keep them numbered, because the number is
// chosen BEFORE the merge — two lanes both reading "the highest is A18" both
// write A19, and git resolves that without complaint.
//
// Measured 2026-08-16: `LESSONS.md` carried two A19s and two A20s, and the
// collision was not cosmetic. Both A19s were cited from elsewhere in the repo,
// meaning DIFFERENT lessons:
//
//   scripts/mutations.mjs                       -> the 2026-08-16 A19
//   docs/COMPOSITION-EXPERIMENTS-2026-08-15.md  -> the 2026-08-15 A19
//
// A citation that resolves to two different findings is worse than a broken
// one: a broken link announces itself, and an ambiguous link quietly hands the
// reader the wrong lesson. The 08-16 pair was renumbered A24/A25 and its one
// citation updated.
//
// WHAT THIS DOES NOT DO. It does not require a contiguous sequence. A gap is
// how a withdrawn lesson stays withdrawn — reusing the number would point old
// citations at new content, which is the same defect from the other direction.
// Gaps are reported, never failed.
//
// THREE OUTCOMES. VERIFIED / NOT CHECKED / FAILED. A file it cannot read is
// NOT CHECKED, never a pass.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const LESSONS = 'LESSONS.md';
const SKIP_CITATION_FILES = new Set([
  LESSONS,
  'scripts/check-lessons-numbering.mjs',
  // This file's self-test fixtures deliberately cite `LESSONS+A99` and a duplicated
  // id. Scanning it as ordinary source makes this checker fail on another
  // checker's proof material rather than on a real broken reference.
  'scripts/check-lesson-ids.mjs',
]);

// THREE CONVENTIONS, ALL LIVE. The file grew them in order, and a parser that
// knows only the newest reports the oldest entries as missing — which is exactly
// what the first version of this gate did, flagging eight healthy citations to
// A4, A6, A8 and A9 as dangling. The measurement was wrong, not the repo.
//
//   `**A4. title**`   bold lead-in   (earliest, shared with the S series)
//   `### A8 — title`  h3             (middle)
//   `## A22 — title`  h2             (current)
/** h2 and h3 entries: `## A22 — …` / `### A8 — …`. */
const HEADING = /^#{2,3} ([A-Z]+\d+)\s+—/gm;
/** Bold lead-in entries: `**A4. …**` / `**S3. …**`. */
const SEC = /^\*\*([AS]\d+)\.\s/gm;
/** A citation anywhere in the repo: "LESSONS.md A19", "LESSONS A19", "`LESSONS.md` S1". */
const CITE = /LESSONS(?:\.md)?`?\s+([AS]\d+)\b/g;

const results = [];
const record = (state, control, detail) => results.push({ state, control, detail });

function report() {
  const width = Math.max(...results.map((r) => r.control.length));
  console.log('\nLESSONS numbering — a citation must resolve to exactly one entry\n');
  for (const r of results) {
    const mark = r.state === 'VERIFIED' ? '✓' : r.state === 'FAILED' ? '✗' : '·';
    console.log(`  ${mark} ${r.control.padEnd(width)}  ${r.state}`);
    console.log(`    ${r.detail}`);
  }
  const failed = results.filter((r) => r.state === 'FAILED').length;
  const unchecked = results.filter((r) => r.state === 'NOT CHECKED').length;
  const verified = results.filter((r) => r.state === 'VERIFIED').length;
  console.log(
    `\ncheck:lessons-numbering — ${verified} VERIFIED, ${unchecked} NOT CHECKED, ${failed} FAILED.`
  );
  process.exit(failed > 0 ? 1 : 0);
}

let text;
try {
  text = readFileSync(LESSONS, 'utf8');
} catch (err) {
  record('NOT CHECKED', `read ${LESSONS}`, err.message);
  report();
}

/** id -> how many entries claim it. */
const ids = new Map();
for (const re of [HEADING, SEC]) {
  re.lastIndex = 0;
  for (const m of text.matchAll(re)) ids.set(m[1], (ids.get(m[1]) ?? 0) + 1);
}

// -------------------------------------------------------------- control 1
const dupes = [...ids.entries()].filter(([, n]) => n > 1);
if (dupes.length) {
  record(
    'FAILED',
    'every lesson id is unique',
    `${dupes.length} duplicated: ${dupes.map(([id, n]) => `${id}×${n}`).join(', ')}\n` +
      `    Two lanes picked the same number against different snapshots. Renumber the LATER\n` +
      `    entry to the next free id and update anything citing it — the earlier one keeps\n` +
      `    its number because existing citations already point at it.`
  );
} else {
  record('VERIFIED', 'every lesson id is unique', `${ids.size} entries, no id claimed twice`);
}

// -------------------------------------------------------------- control 2
// Every citation in the repo resolves. Ambiguous is reported separately from
// missing, because they fail for opposite reasons and are fixed differently.
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (/^(node_modules|\.next|\.git|out)$/.test(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(md|mjs|ts|tsx|js|cjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

const missing = [];
const ambiguous = [];
for (const file of walk('.')) {
  if (SKIP_CITATION_FILES.has(file)) continue;
  let body;
  try {
    body = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  CITE.lastIndex = 0;
  for (const m of body.matchAll(CITE)) {
    const n = ids.get(m[1]) ?? 0;
    if (n === 0) missing.push(`${file} -> ${m[1]}`);
    else if (n > 1) ambiguous.push(`${file} -> ${m[1]}`);
  }
}

if (missing.length) {
  record(
    'FAILED',
    'every citation resolves',
    `${missing.length} pointing at no entry: ${[...new Set(missing)].join(', ')}`
  );
} else {
  record('VERIFIED', 'every citation resolves', 'no citation points at a missing entry');
}

if (ambiguous.length) {
  record(
    'FAILED',
    'no citation is ambiguous',
    `${ambiguous.length} pointing at a duplicated id: ${[...new Set(ambiguous)].join(', ')}\n` +
      `    An ambiguous citation is worse than a broken one — a broken link announces itself,\n` +
      `    and this one quietly hands the reader the wrong lesson.`
  );
} else {
  record('VERIFIED', 'no citation is ambiguous', 'every citation lands on exactly one entry');
}

// -------------------------------------------------------------- informational
const nums = [...ids.keys()]
  .filter((k) => k.startsWith('A'))
  .map((k) => Number(k.slice(1)))
  .sort((a, b) => a - b);
const gaps = [];
for (let i = nums[0]; i < nums[nums.length - 1]; i += 1) if (!nums.includes(i)) gaps.push(`A${i}`);
console.log(
  `\n  A-series A${nums[0]}–A${nums[nums.length - 1]}, ${nums.length} entries` +
    (gaps.length
      ? `\n  gaps (not a failure — a withdrawn lesson keeps its number retired): ${gaps.join(', ')}`
      : '\n  no gaps')
);

report();
