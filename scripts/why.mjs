#!/usr/bin/env node
/**
 * why — ask the repository why something is the way it is.
 *
 * The commit messages in these repos carry measurements, dates, error codes and
 * reasoning. That is already a memory system; it is just slow to query, so nobody
 * queries it. This makes it one command.
 *
 *   node scripts/why.mjs <term>            term = a path, a symbol, or a phrase
 *   node scripts/why.mjs <term> --limit 5
 *   node scripts/why.mjs <term> --full     print whole commit bodies
 *
 * It runs three searches and merges them, because each finds a different thing:
 *
 *   --grep     commits that TALK about the term      → intent, incidents, decisions
 *   -S         commits that ADD or REMOVE the term   → when it entered the codebase
 *   --follow   commits touching the path             → the artefact's own history
 *
 * The --grep pass is the one that pays. A fact can be recorded in a commit body
 * years before it matters, attached to a change that looks unrelated.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const SEP = '\u0001';           // record separator, will not appear in a message
const FIELD = '\u0002';

function git(args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return '';                  // a search that matches nothing is not an error
  }
}

function parse(raw, source) {
  return raw
    .split(SEP)
    .map(s => s.trim())
    .filter(Boolean)
    .map(rec => {
      const [sha, date, author, subject, body = ''] = rec.split(FIELD);
      return { sha, date, author, subject, body, source };
    });
}

const FORMAT = `--pretty=format:${SEP}%h${FIELD}%ad${FIELD}%an${FIELD}%s${FIELD}%b`;
const DATE = '--date=short';

function search(term, isPath) {
  const found = [];

  // 1. Commit messages that mention it.
  found.push(...parse(
    git(['log', FORMAT, DATE, '-i', `--grep=${term}`, '--all']),
    'message'
  ));

  // 2. Commits that added or removed the string in the content.
  found.push(...parse(
    git(['log', FORMAT, DATE, `-S${term}`, '--all']),
    'content'
  ));

  // 3. If it is a real path, that file's own history.
  if (isPath) {
    found.push(...parse(
      git(['log', FORMAT, DATE, '--follow', '--', term]),
      'path'
    ));
  }

  // Merge, keeping every reason a commit surfaced.
  const byS = new Map();
  for (const c of found) {
    const hit = byS.get(c.sha);
    if (hit) { if (!hit.sources.includes(c.source)) hit.sources.push(c.source); }
    else byS.set(c.sha, { ...c, sources: [c.source] });
  }
  return [...byS.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}

// Pull the lines of a commit body that actually mention the term, with a little
// context. Printing whole bodies buries the answer — these messages run long.
function excerpt(body, term, full) {
  const lines = body.split('\n');
  if (full) return lines.filter(l => l.trim()).map(l => '    ' + l);

  const needle = term.toLowerCase();
  const keep = new Set();
  lines.forEach((l, i) => {
    if (l.toLowerCase().includes(needle)) {
      for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 1); j++) keep.add(j);
    }
  });
  if (!keep.size) return [];

  const out = [];
  let last = -2;
  for (const i of [...keep].sort((a, b) => a - b)) {
    if (i > last + 1 && out.length) out.push('    …');
    if (lines[i].trim()) out.push('    ' + lines[i].trim());
    last = i;
  }
  return out.slice(0, 12);
}

const argv = process.argv.slice(2);
const term = argv.find(a => !a.startsWith('--'));
const full = argv.includes('--full');
const limitFlag = argv.indexOf('--limit');
const limit = limitFlag !== -1 ? Number(argv[limitFlag + 1]) : 12;

if (!term) {
  console.error(`why — ask the repository why something is the way it is

  node scripts/why.mjs <term> [--limit N] [--full]

  <term>  a path (lib/supabase-admin.ts), a symbol (getSupabaseAdmin),
          or a phrase (Railway, NPM_TOKEN, module scope)

Searches commit messages, content changes and file history together.`);
  process.exit(1);
}

const isPath = existsSync(term);
const hits = search(term, isPath);

if (!hits.length) {
  console.log(`no history mentions "${term}".`);
  console.log(`\nthat is itself information: if this is load-bearing, it was never`);
  console.log(`written down. consider a note in CLAUDE.md or a comment at the site.`);
  process.exit(0);
}

const LABEL = { message: 'mentions it', content: 'added/removed it', path: 'touched the file' };

console.log(`\n${hits.length} commit${hits.length === 1 ? '' : 's'} relate to "${term}"` +
            (hits.length > limit ? `  (showing ${limit}, --limit to see more)` : '') + '\n');

for (const c of hits.slice(0, limit)) {
  console.log(`─ ${c.sha}  ${c.date}  ${c.author}`);
  console.log(`  ${c.subject}`);
  console.log(`  [${c.sources.map(s => LABEL[s]).join(', ')}]`);
  const ex = excerpt(c.body, term, full);
  if (ex.length) console.log(ex.join('\n'));
  console.log();
}

console.log(`git show <sha>   for the full change`);
