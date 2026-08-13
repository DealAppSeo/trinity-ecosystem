#!/usr/bin/env node
//
// trustshell-parse.mjs — run the M1 transcript parser against a real session.
//
//   node scripts/trustshell-parse.mjs <session.jsonl> [--json] [--strict]
//   node scripts/trustshell-parse.mjs --latest
//
// --latest picks the most recently modified transcript under
// ~/.claude/projects. --strict aborts on an unrecognised record type instead of
// reporting it. --json prints the parsed structure instead of the report.
//
// This is read-only on the transcript and writes nothing to ~/.claude (§7.2).
// The file is read once into memory and hashed once; the parser is handed the
// bytes and the hash together, because a live session is being appended to
// while this runs and a path is not a stable input.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SOURCE = 'lib/trustshell/TranscriptParser.ts';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const strict = args.includes('--strict');
const latest = args.includes('--latest');
let target = args.find((a) => !a.startsWith('--'));

if (!target && !latest) {
  console.error(
    'usage: node scripts/trustshell-parse.mjs <session.jsonl> [--json] [--strict]\n' +
      '       node scripts/trustshell-parse.mjs --latest'
  );
  process.exit(2);
}

if (latest) {
  const root = join(homedir(), '.claude', 'projects');
  let best = null;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.jsonl')) {
        const mtime = statSync(path).mtimeMs;
        if (!best || mtime > best.mtime) best = { path, mtime };
      }
    }
  };
  try {
    walk(root);
  } catch {
    console.error(`no transcripts found under ${root}`);
    process.exit(2);
  }
  if (!best) {
    console.error(`no .jsonl transcripts found under ${root}`);
    process.exit(2);
  }
  target = best.path;
}

const outDir = mkdtempSync(join(tmpdir(), 'trustshell-transcript-'));
let mod;
try {
  execFileSync(
    'npx',
    ['tsc', SOURCE, '--outDir', outDir, '--module', 'commonjs', '--target', 'es2019'],
    { stdio: 'pipe' }
  );
  mod = await import(pathToFileURL(join(outDir, 'TranscriptParser.js')).href);
} catch (err) {
  console.error(`Could not compile ${SOURCE}:\n${err.stdout?.toString() ?? err.message}`);
  rmSync(outDir, { recursive: true, force: true });
  process.exit(1);
}
rmSync(outDir, { recursive: true, force: true });

const bytes = readFileSync(target);
const sha256 = createHash('sha256').update(bytes).digest('hex');

let parsed;
try {
  parsed = mod.parseTranscript(bytes.toString('utf8'), {
    sha256,
    onUnknownRecordType: strict ? 'throw' : 'collect',
  });
} catch (err) {
  console.error(`✗ NOT CHECKED  ${err.message}`);
  process.exit(1);
}

if (asJson) {
  console.log(JSON.stringify(parsed, null, 2));
  process.exit(0);
}

console.log(`\n${target}\n`);
console.log(mod.formatSummary(parsed));

const c = parsed.census;
const problems = [];
if (c.phantomToolResult.length > 0) {
  problems.push(`${c.phantomToolResult.length} phantom tool_result — referential integrity broken`);
}
if (c.malformedLines.length > 0) {
  problems.push(`${c.malformedLines.length} malformed line(s)`);
}
const unknownTypes = Object.keys(c.unknownRecordTypes);
if (unknownTypes.length > 0) {
  problems.push(`unrecognised record type(s): ${unknownTypes.join(', ')}`);
}

console.log('');
if (problems.length === 0) {
  console.log(`✓ VERIFIED    every line parsed, every result paired    sha256 ${sha256.slice(0, 16)}`);
} else {
  // Not FAILED: an unread record is a thing we did not check, not a thing we
  // caught. Collapsing those two is the defect this whole package exists for.
  console.log(`⚠ NOT CHECKED ${problems.join(' · ')}`);
  process.exitCode = 1;
}
console.log('');
