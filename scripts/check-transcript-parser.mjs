#!/usr/bin/env node
//
// check-transcript-parser.mjs — asserts the M1 transcript parser counts what is
// there and refuses to count what is not.
//
//   node scripts/check-transcript-parser.mjs
//
// Exits non-zero on any failure, so it can gate CI.
//
// Why this file exists. docs/TRUSTSHELL-V1.md §10 makes M1 done when the parser
// "reproduces the §3 table on any saved session; 0 phantom results." Both
// halves are failable in the quiet way this repo keeps finding: a parser that
// skips records it does not recognise reports a clean census of a session it
// only partly read, and a parser that never emits a phantom because it cannot
// detect one looks identical to a correct one. So the fixtures come in pairs —
// a clean session whose every count is known by hand, and a pathological one
// carrying one of each defect, where finding them is the pass condition.
//
// Fixtures are synthetic. No production row, proof, session id, or agent id
// appears in either file — the preflight contract forbids it, and a transcript
// is exactly the kind of artefact where a real one would leak everything.
//
// Same shape as check-harness-profile.mjs: node:assert plus the TypeScript
// compiler that is already a dependency, so this adds nothing to package.json.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const SOURCE = 'lib/trustshell/TranscriptParser.ts';
const CLEAN = 'lib/trustshell/fixtures/synthetic-clean.jsonl';
const PATHOLOGICAL = 'lib/trustshell/fixtures/synthetic-pathological.jsonl';

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

const { parseTranscript, formatCensusTable, formatSummary, KNOWN_RECORD_TYPES, PARSER_VERSION } = mod;

const clean = parseTranscript(readFileSync(CLEAN, 'utf8'), { sha256: 'deadbeef' });
const bad = parseTranscript(readFileSync(PATHOLOGICAL, 'utf8'));

let passed = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
  }
}

// -- the clean session: every count known by hand ----------------------------

check('clean fixture parses every line', () => {
  assert.equal(clean.census.lines, 10);
  assert.equal(clean.census.parsedRecords, 10);
  assert.deepEqual(clean.census.malformedLines, []);
});

check('clean fixture reports no unknown record types', () => {
  assert.deepEqual(clean.census.unknownRecordTypes, {});
});

check('clean fixture census matches the hand count', () => {
  assert.deepEqual(clean.census.recordsByType, {
    user: 3,
    assistant: 5,
    'last-prompt': 1,
    mode: 1,
  });
});

check('clean fixture block census matches the hand count', () => {
  assert.deepEqual(clean.census.blocks, {
    assistantText: 2,
    assistantThinking: 1,
    toolUse: 2,
    toolResult: 2,
    userText: 0,
    userImage: 0,
    unknown: {},
  });
});

check('a clean session has no orphans, no phantoms, no branches', () => {
  assert.deepEqual(clean.census.orphanToolUse, []);
  assert.deepEqual(clean.census.phantomToolResult, []);
  assert.equal(clean.census.duplicateToolResultBlocks, 0);
  assert.equal(clean.census.duplicateRecordUuids, 0);
});

check('a linear session is one unbranched chain', () => {
  assert.deepEqual(clean.census.graph, {
    roots: 1,
    danglingParents: 0,
    leaves: 1,
    branchPoints: 0,
    longestChain: 8,
    addressableRecords: 8,
  });
});

check('string message.content does not crash or count as a block', () => {
  // The first user record carries a bare string, not an array. It must still be
  // counted as a record and must contribute no blocks.
  assert.equal(clean.census.recordsByType.user, 3);
  assert.equal(clean.census.blocks.userText, 0);
});

check('tool calls are paired to their results', () => {
  assert.equal(clean.tools.length, 2);
  const [read, write] = clean.tools;
  assert.equal(read.name, 'Read');
  assert.equal(read.outcome, 'ok');
  assert.equal(read.effect, 'read');
  assert.equal(read.latencyMs, 1000);
  assert.equal(write.name, 'Write');
  assert.equal(write.outcome, 'ok');
  assert.equal(write.effect, 'write');
});

check('only write tools contribute files touched', () => {
  // Read names a file_path too. Counting it would make "files touched" mean
  // "files mentioned", which is the reconciliation M2 depends on.
  assert.deepEqual(clean.filesTouched, ['/synthetic/b.ts']);
});

check('no result is delivered twice in a clean session', () => {
  for (const tool of clean.tools) assert.equal(tool.resultDeliveredTwice, false);
});

// -- spend: the per-record sum is the trap -----------------------------------

check('spend is grouped by requestId, not by record', () => {
  // req_1 spans three assistant records carrying identical usage.
  assert.equal(clean.spend.turns, 3);
  assert.equal(clean.spend.outputTokens, 175);
  assert.equal(clean.spend.inputTokens, 3300);
  assert.equal(clean.spend.cacheReadTokens, 15500);
  assert.equal(clean.spend.cacheWriteTokens, 200);
});

check('the per-record sum is reported alongside, not instead', () => {
  assert.equal(clean.spend.naive.outputTokens, 375);
  assert.equal(clean.spend.naive.records, 5);
  assert.equal(clean.spend.naive.overcountFactor, Number((375 / 175).toFixed(4)));
  assert.ok(
    clean.spend.naive.outputTokens > clean.spend.outputTokens,
    'the fixture must actually exercise usage duplication or this check proves nothing'
  );
});

check('spend is attributed per model', () => {
  assert.equal(clean.spend.byModel.length, 1);
  assert.equal(clean.spend.byModel[0].model, 'claude-opus-5');
  assert.equal(clean.spend.byModel[0].turns, 3);
  assert.equal(clean.spend.byModel[0].outputTokens, 175);
});

// -- the pathological session: finding the defects is the pass condition -----

check('a malformed line is counted, never skipped', () => {
  assert.equal(bad.census.lines, 15);
  assert.equal(bad.census.parsedRecords, 13);
  assert.equal(bad.census.malformedLines.length, 2);
  assert.deepEqual(
    bad.census.malformedLines.map((m) => m.line),
    [3, 4]
  );
});

check('valid JSON that is not a record object is malformed, not a record', () => {
  assert.match(bad.census.malformedLines[1].reason, /not a JSON object/);
});

check('an unknown record type is reported', () => {
  assert.deepEqual(bad.census.unknownRecordTypes, { 'telemetry-beacon': 1 });
});

check('an unknown record type can be made fatal', () => {
  // §11: fail loudly on unknown record types rather than skipping them.
  assert.throws(
    () => parseTranscript(readFileSync(PATHOLOGICAL, 'utf8'), { onUnknownRecordType: 'throw' }),
    /unknown transcript record type\(s\): telemetry-beacon/
  );
});

check('a clean session does not trip the strict switch', () => {
  assert.doesNotThrow(() =>
    parseTranscript(readFileSync(CLEAN, 'utf8'), { onUnknownRecordType: 'throw' })
  );
});

check('an unknown content block is counted, not silently dropped', () => {
  assert.deepEqual(bad.census.blocks.unknown, { redacted_thinking: 1 });
  assert.equal(bad.census.blocks.assistantThinking, 0);
});

check('a phantom tool_result is detected', () => {
  // The M1 acceptance criterion is 0 phantoms on a real session. That number
  // only means something if the detector can produce a non-zero.
  assert.deepEqual(bad.census.phantomToolResult, ['toolu_ghost']);
});

check('an orphan tool_use is detected', () => {
  assert.deepEqual(bad.census.orphanToolUse, ['toolu_orphan']);
  const orphan = bad.tools.find((t) => t.id === 'toolu_orphan');
  assert.equal(orphan.outcome, 'orphan');
});

check('denied is not failed', () => {
  // §2.4 of HARNESS-SPEC: denied != failed != not attempted. The transcript
  // marks a rejection with is_error too; the denial kind has to win.
  const denied = bad.tools.find((t) => t.id === 'toolu_denied');
  assert.equal(denied.outcome, 'denied');
  assert.equal(denied.denialKind, 'user-rejected');
});

check('a genuine tool error is failed, not denied', () => {
  const errored = bad.tools.find((t) => t.id === 'toolu_err');
  assert.equal(errored.outcome, 'error');
  assert.equal(errored.denialKind, null);
});

check('a re-delivered result is deduplicated but still reported', () => {
  assert.equal(bad.census.duplicateToolResultBlocks, 1);
  const dup = bad.tools.filter((t) => t.id === 'toolu_dup');
  assert.equal(dup.length, 1, 'one call delivered twice is still one call');
  assert.equal(dup[0].outcome, 'ok');
  assert.equal(dup[0].resultDeliveredTwice, true);
});

check('the graph is measured, and liveness is not guessed', () => {
  assert.deepEqual(bad.census.graph, {
    roots: 1,
    danglingParents: 0,
    leaves: 2,
    branchPoints: 2,
    longestChain: 10,
    addressableRecords: 12,
  });
  // The census must not carry a live/abandoned verdict at all. It is not
  // decidable from parentUuid, and an earlier draft that reported one called
  // 98% of a real session abandoned.
  assert.equal('activePathRecords' in bad.census, false);
  assert.equal('abandonedRecords' in bad.census, false);
  assert.equal('onActivePath' in bad.tools[0], false);
});

check('a dangling parentUuid is reported as a seam, not a root', () => {
  // Compaction and session resume leave records whose parent is not in the
  // file. They start a chain, but they are not where the session began.
  const seam = parseTranscript(
    [
      '{"type":"user","uuid":"s1","parentUuid":"gone-with-the-compaction","message":{"role":"user","content":"resumed"}}',
      '{"type":"assistant","uuid":"s2","parentUuid":"s1","requestId":"r","message":{"role":"assistant","model":"m","content":[{"type":"text","text":"ok"}],"usage":{"output_tokens":1}}}',
    ].join('\n')
  );
  assert.equal(seam.census.graph.roots, 1);
  assert.equal(seam.census.graph.danglingParents, 1);
  assert.equal(seam.census.graph.longestChain, 2);
});

check('a cyclic parentUuid terminates instead of hanging', () => {
  const cyclic = parseTranscript(
    [
      '{"type":"user","uuid":"c1","parentUuid":"c2","message":{"role":"user","content":"a"}}',
      '{"type":"user","uuid":"c2","parentUuid":"c1","message":{"role":"user","content":"b"}}',
    ].join('\n')
  );
  assert.equal(cyclic.census.graph.addressableRecords, 2);
  assert.ok(cyclic.census.graph.longestChain >= 1);
});

check('a duplicate record uuid is counted', () => {
  assert.equal(bad.census.duplicateRecordUuids, 1);
});

check('a compact boundary is counted', () => {
  assert.equal(bad.census.compactBoundaries, 1);
});

check('MCP attribution survives into the invocation', () => {
  const sql = bad.tools.find((t) => t.id === 'toolu_dup');
  assert.equal(sql.mcpServer, 'Supabase');
  assert.deepEqual(bad.toolsByMcpServer, { Supabase: 1 });
});

check('Bash and MCP calls are unknown-effect, not assumed writes', () => {
  assert.equal(bad.tools.find((t) => t.id === 'toolu_orphan').effect, 'unknown');
  assert.equal(bad.tools.find((t) => t.id === 'toolu_dup').effect, 'unknown');
});

check('a denied write still names the file it was going to touch', () => {
  // The intent is evidence even though nothing changed on disk. M2 reconciles
  // this against git diff; losing it here would make that impossible.
  const denied = bad.tools.find((t) => t.id === 'toolu_denied');
  assert.deepEqual(denied.files, ['/synthetic/denied.txt']);
  assert.deepEqual(bad.filesTouched, ['/synthetic/denied.txt', '/synthetic/e.ts']);
});

// -- determinism and provenance ----------------------------------------------

check('parsing is deterministic on identical bytes', () => {
  const text = readFileSync(PATHOLOGICAL, 'utf8');
  assert.deepEqual(parseTranscript(text), parseTranscript(text));
});

check('the caller supplies the hash; the parser never invents one', () => {
  assert.equal(clean.transcriptSha256, 'deadbeef');
  assert.equal(bad.transcriptSha256, null);
});

check('the parser stamps its own version', () => {
  assert.equal(clean.parserVersion, PARSER_VERSION);
  assert.match(PARSER_VERSION, /^trustshell-transcript\/\d+\.\d+\.\d+$/);
});

check('session metadata is recovered', () => {
  assert.equal(clean.sessionId, 'synthetic-clean');
  assert.equal(clean.cwd, '/synthetic');
  assert.equal(clean.gitBranch, 'synthetic');
  assert.equal(clean.startedAt, '2026-08-13T00:00:00.000Z');
  assert.equal(clean.endedAt, '2026-08-13T00:00:07.000Z');
});

// -- degenerate inputs -------------------------------------------------------

check('an empty transcript parses to an empty census, not a crash', () => {
  const empty = parseTranscript('');
  assert.equal(empty.census.lines, 0);
  assert.equal(empty.census.parsedRecords, 0);
  assert.equal(empty.spend.turns, 0);
  assert.equal(empty.spend.naive.overcountFactor, 1);
  assert.deepEqual(empty.tools, []);
});

check('a transcript of nothing but garbage reports all of it', () => {
  const garbage = parseTranscript('nope\n{\nalso nope\n');
  assert.equal(garbage.census.lines, 3);
  assert.equal(garbage.census.malformedLines.length, 3);
  assert.equal(garbage.census.parsedRecords, 0);
});

check('trailing and blank lines are not counted as records', () => {
  const padded = parseTranscript(`\n\n${readFileSync(CLEAN, 'utf8')}\n\n`);
  assert.equal(padded.census.lines, 10);
  assert.equal(padded.census.parsedRecords, 10);
});

// -- the report itself --------------------------------------------------------

check('the rendered census names every §3 row', () => {
  const table = formatCensusTable(clean);
  for (const row of [
    'tool_use blocks',
    'tool_result blocks',
    'assistant text blocks',
    'thinking blocks',
    'orphan tool_use',
    'tool_result with no tool_use',
  ]) {
    assert.ok(table.includes(row), `§3 row missing from the rendered table: ${row}`);
  }
});

check('the summary surfaces the naive figure so the two cannot be confused', () => {
  const summary = formatSummary(clean);
  assert.ok(summary.includes('naive'));
  assert.ok(summary.includes('375'));
});

check('KNOWN_RECORD_TYPES is documented as observed, not assumed', () => {
  assert.ok(KNOWN_RECORD_TYPES.length >= 7);
  assert.ok(KNOWN_RECORD_TYPES.includes('assistant'));
  assert.ok(KNOWN_RECORD_TYPES.includes('queue-operation'));
});

// -- report -------------------------------------------------------------------

rmSync(outDir, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`\ncheck-transcript: ${passed} passed, ${failures.length} failed`);
  console.error(`\n✗ FAILED  ${failures.length} of ${passed + failures.length} checks\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log(`check-transcript: ${passed} passed, 0 failed`);
console.log(`✓ VERIFIED  ${passed} transcript-parser assertions`);
