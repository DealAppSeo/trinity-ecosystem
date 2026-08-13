// lib/trustshell/TranscriptParser.ts
//
// TrustShell M1 — the transcript parser.
//
// Spec: docs/TRUSTSHELL-V1.md §3 (observation substrate), §4.1 (actions),
// §4.2 (spend), §11 (what would make this fail).
// Proven by: scripts/check-transcript-parser.mjs
// Run against a session: node scripts/trustshell-parse.mjs <session.jsonl>
//
// This module is deliberately pure: it takes the transcript as a string and
// returns a value. It performs no I/O, opens no file, and hashes nothing —
// the caller reads the bytes once, hashes them once, and passes both in. Three
// reasons, in order of how much each has cost this repo:
//
//   1. §7.2 requires the observer be read-only on ~/.claude. A module that
//      cannot open a file cannot violate that.
//   2. A session transcript is *appended to while the session runs*. Parsing a
//      path twice gives two different answers; parsing a pinned string twice
//      gives one. `transcript_sha256` in the §5 receipt is only meaningful if
//      the parser saw exactly the bytes that were hashed.
//   3. It compiles standalone under `tsc` with no lib or @types dependency,
//      which is how scripts/check-harness-profile.mjs already loads its subject.
//
// The house rule this file exists to respect: three outcomes, never two. A
// tool call is ok / error / denied / orphan — never "not ok". A record type is
// known / unknown — never silently dropped. A line either parses or is counted
// as malformed. Nothing here rounds silence up to success.

// ---------------------------------------------------------------------------
// Record types
// ---------------------------------------------------------------------------

/**
 * Record `type` values observed in a real Claude Code transcript.
 *
 * [VERIFIED] Derived by census over the corpus named in
 * OBSERVED_CORPUS below — 6,811 lines, every distinct `type` enumerated.
 *
 * This list is *not* a claim about the format in general. Claude Code's JSONL
 * is not a public API (§11, "transcript format churn"). Anything outside this
 * set is reported in `unknownRecordTypes` and, under `onUnknownRecordType:
 * 'throw'`, aborts the parse. An unknown record is NOT CHECKED — it is never
 * skipped quietly, because a parser that ignores what it does not understand
 * reports a clean session it never read.
 */
export const KNOWN_RECORD_TYPES = [
  'user',
  'assistant',
  'system',
  'attachment',
  'queue-operation',
  'mode',
  'last-prompt',
] as const;

export type KnownRecordType = (typeof KNOWN_RECORD_TYPES)[number];

/**
 * The single session the constants in this file were measured against.
 * Named so a future reader can tell a measurement from an assumption.
 */
export const OBSERVED_CORPUS = {
  lines: 6811,
  sessionsInCorpus: 1,
  measuredAt: '2026-08-13',
  note: 'one cloud session of this repo; the parser has not been run against a second format revision',
} as const;

/** Content-block `type` values observed inside `message.content`. */
export const KNOWN_BLOCK_TYPES = ['text', 'thinking', 'tool_use', 'tool_result', 'image'] as const;

/**
 * Tools whose invocation changes state on disk, and the input field naming the
 * file. Everything not listed is classified `read` or `unknown` — see
 * classifyEffect.
 */
const WRITE_TOOLS: Record<string, string[]> = {
  Edit: ['file_path'],
  Write: ['file_path'],
  MultiEdit: ['file_path'],
  NotebookEdit: ['notebook_path'],
};

/** Tools that cannot change local state. Conservative: only obvious readers. */
const READ_TOOLS = new Set([
  'Read',
  'Grep',
  'Glob',
  'ToolSearch',
  'WebFetch',
  'WebSearch',
  'ListAgents',
  'ListMcpResourcesTool',
  'ReadMcpResourceTool',
  'TaskList',
  'TaskGet',
  'TaskOutput',
]);

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

export type ToolEffect = 'write' | 'read' | 'unknown';
export type ToolOutcome = 'ok' | 'error' | 'denied' | 'orphan';

export interface ToolInvocation {
  /** `toolu_…` — the id the tool_result refers back to. */
  id: string;
  name: string;
  /** MCP server that served the call, from `attributionMcpServer`. */
  mcpServer: string | null;
  /** Skill the call was attributed to, from `attributionSkill`. */
  skill: string | null;
  timestamp: string | null;
  /** uuid of the assistant record carrying the tool_use block. */
  recordUuid: string | null;
  effect: ToolEffect;
  /** Files named by a write tool's input. Empty for reads and unknowns. */
  files: string[];
  outcome: ToolOutcome;
  /** Present when outcome === 'denied'; from `toolDenialKind`. */
  denialKind: string | null;
  resultTimestamp: string | null;
  /** Wall time between tool_use and its result, when both carry timestamps. */
  latencyMs: number | null;
  /**
   * True when this call's result was delivered more than once — a retry or a
   * rejected-then-approved call. The call still happened once; only the
   * delivery repeated. Reported rather than dropped.
   */
  resultDeliveredTwice: boolean;
}

export interface ModelSpend {
  model: string;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface SpendSummary {
  /** Distinct API requests, i.e. `requestId` groups — not records. See note. */
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  byModel: ModelSpend[];
  /**
   * What a per-record sum would have produced. Kept because the difference is
   * the whole point: Claude Code repeats one turn's `usage` on every record
   * belonging to that `requestId`, so summing records overcounts. Anyone
   * re-deriving these numbers a different way needs to see both.
   */
  naive: {
    outputTokens: number;
    records: number;
    /** naive.outputTokens / outputTokens. 1.0 means no duplication present. */
    overcountFactor: number;
  };
}

export interface BlockCensus {
  assistantText: number;
  assistantThinking: number;
  toolUse: number;
  toolResult: number;
  userText: number;
  userImage: number;
  /** Block types outside KNOWN_BLOCK_TYPES, by type. */
  unknown: Record<string, number>;
}

export interface MalformedLine {
  /** 1-based line number in the file as given. */
  line: number;
  reason: string;
}

export interface TranscriptCensus {
  lines: number;
  parsedRecords: number;
  malformedLines: MalformedLine[];
  recordsByType: Record<string, number>;
  unknownRecordTypes: Record<string, number>;
  blocks: BlockCensus;
  /** tool_use ids with no tool_result anywhere in the file. */
  orphanToolUse: string[];
  /** tool_result blocks whose tool_use_id appears in no tool_use. Must be 0. */
  phantomToolResult: string[];
  /** Extra tool_result blocks for an id already resolved (retry branches). */
  duplicateToolResultBlocks: number;
  /** Records sharing a uuid with an earlier record. */
  duplicateRecordUuids: number;
  graph: TranscriptGraph;
  /** `system` records with subtype `compact_boundary`. */
  compactBoundaries: number;
}

/**
 * Shape of the `parentUuid` graph.
 *
 * What this deliberately does *not* report is which records are "live" and
 * which the session abandoned. That question is not decidable from the
 * transcript: at a branch point nothing records which sibling won, and on the
 * observed corpus the graph is a forest of 10 chains rather than one tree, so
 * walking back from any single leaf reaches at most one root-to-leaf path
 * (1,484 of 5,469 uuid-bearing records at best). An earlier draft of this
 * parser reported that walk as "the active path" and therefore called 98% of a
 * real session abandoned — a confident number with nothing behind it, which is
 * the precise defect TrustShell exists to catch. What is decidable is reported
 * here; what is not is absent rather than guessed.
 */
export interface TranscriptGraph {
  /** uuid-bearing records whose parent is absent or unresolvable. */
  roots: number;
  /**
   * Of those roots, the ones naming a parentUuid that is not in the file —
   * a seam left by context compaction or by resuming the session, not a real
   * beginning.
   */
  danglingParents: number;
  /** uuid-bearing records with no children. */
  leaves: number;
  /** parentUuid values with more than one child — the session branched here. */
  branchPoints: number;
  /** Records on the longest root-to-leaf chain. */
  longestChain: number;
  /** Distinct uuid-bearing records. */
  addressableRecords: number;
}

export interface ParsedTranscript {
  sessionId: string | null;
  cwd: string | null;
  gitBranch: string | null;
  startedAt: string | null;
  endedAt: string | null;
  models: string[];
  /** Passed in by the caller; this module never hashes. */
  transcriptSha256: string | null;
  census: TranscriptCensus;
  tools: ToolInvocation[];
  spend: SpendSummary;
  /** Distinct files named by write-tool inputs, sorted. */
  filesTouched: string[];
  toolsByName: Record<string, number>;
  toolsByMcpServer: Record<string, number>;
  /** Parser build that produced this. Pinned per §11. */
  parserVersion: string;
}

export interface ParseOptions {
  /**
   * 'collect' (default) records unknown record types in the census.
   * 'throw' aborts — §11's "fail loudly on unknown record types".
   */
  onUnknownRecordType?: 'collect' | 'throw';
  /** sha256 of the exact bytes parsed, computed by the caller. */
  sha256?: string;
}

/**
 * Bumped whenever the meaning of any counted field changes, so an old receipt
 * stays interpretable against the parser that produced it (§11).
 */
export const PARSER_VERSION = 'trustshell-transcript/1.0.0';

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface RawRecord {
  type?: unknown;
  uuid?: unknown;
  parentUuid?: unknown;
  timestamp?: unknown;
  sessionId?: unknown;
  cwd?: unknown;
  gitBranch?: unknown;
  requestId?: unknown;
  subtype?: unknown;
  leafUuid?: unknown;
  toolDenialKind?: unknown;
  attributionMcpServer?: unknown;
  attributionSkill?: unknown;
  message?: unknown;
}

interface RawUsage {
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_read_input_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
}

interface RawBlock {
  type?: unknown;
  id?: unknown;
  name?: unknown;
  input?: unknown;
  tool_use_id?: unknown;
  is_error?: unknown;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function blocksOf(record: RawRecord): RawBlock[] {
  const message = record.message;
  if (!message || typeof message !== 'object') return [];
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) return [];
  return content.filter((b): b is RawBlock => !!b && typeof b === 'object');
}

function usageOf(record: RawRecord): RawUsage | null {
  const message = record.message;
  if (!message || typeof message !== 'object') return null;
  const usage = (message as { usage?: unknown }).usage;
  if (!usage || typeof usage !== 'object') return null;
  return usage as RawUsage;
}

function modelOf(record: RawRecord): string | null {
  const message = record.message;
  if (!message || typeof message !== 'object') return null;
  return str((message as { model?: unknown }).model);
}

function classifyEffect(name: string): ToolEffect {
  if (WRITE_TOOLS[name]) return 'write';
  if (READ_TOOLS.has(name)) return 'read';
  // Everything else — Bash, every MCP tool, Agent, Task* — is genuinely
  // unknown. `git status` and `rm -rf` arrive through the same tool, and the
  // spec's §4.1 shorthand ("Bash with side effects") is not decidable from the
  // transcript alone. Calling it a write would overstate; calling it a read
  // would understate. It gets its own bucket, and M2's git-diff reconciliation
  // is what resolves it.
  return 'unknown';
}

function filesOf(name: string, input: unknown): string[] {
  const fields = WRITE_TOOLS[name];
  if (!fields || !input || typeof input !== 'object') return [];
  const out: string[] = [];
  for (const field of fields) {
    const value = (input as Record<string, unknown>)[field];
    const path = str(value);
    if (path) out.push(path);
  }
  return out;
}

function bump(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1;
}

/**
 * Measure the `parentUuid` graph: how many chains, where they branch, how deep
 * the deepest runs. See TranscriptGraph for what is deliberately not measured.
 */
function measureGraph(
  byUuid: Map<string, RawRecord>,
  childCount: Map<string, number>
): TranscriptGraph {
  let roots = 0;
  let danglingParents = 0;
  let leaves = 0;
  let branchPoints = 0;

  byUuid.forEach((record, uuid) => {
    const parent = str(record.parentUuid);
    if (!parent) roots++;
    else if (!byUuid.has(parent)) {
      roots++;
      danglingParents++;
    }
    if (!childCount.has(uuid)) leaves++;
  });

  childCount.forEach((count) => {
    if (count > 1) branchPoints++;
  });

  // Depth of each node from its chain root, memoised, walking up iteratively so
  // a 1,484-deep chain cannot blow the stack. The `pending` guard makes a
  // malformed cyclic parentUuid terminate instead of hanging.
  const depth = new Map<string, number>();
  let longestChain = 0;

  byUuid.forEach((_record, start) => {
    const pending: string[] = [];
    const seen = new Set<string>();
    let cursor: string | null = start;
    let base = 0;

    while (cursor) {
      const known = depth.get(cursor);
      if (known !== undefined) {
        base = known;
        break;
      }
      if (seen.has(cursor)) {
        base = 0;
        break;
      }
      seen.add(cursor);
      const record = byUuid.get(cursor);
      if (!record) break;
      pending.push(cursor);
      const parent = str(record.parentUuid);
      cursor = parent && byUuid.has(parent) ? parent : null;
    }

    for (let i = pending.length - 1; i >= 0; i--) {
      base++;
      depth.set(pending[i], base);
      if (base > longestChain) longestChain = base;
    }
  });

  return {
    roots,
    danglingParents,
    leaves,
    branchPoints,
    longestChain,
    addressableRecords: byUuid.size,
  };
}

// ---------------------------------------------------------------------------
// parseTranscript
// ---------------------------------------------------------------------------

/**
 * Parse a Claude Code session transcript.
 *
 * @param text  the entire `.jsonl` file, as read once by the caller
 * @param options see ParseOptions
 */
export function parseTranscript(text: string, options: ParseOptions = {}): ParsedTranscript {
  const onUnknown = options.onUnknownRecordType ?? 'collect';
  const known = new Set<string>(KNOWN_RECORD_TYPES);
  const knownBlocks = new Set<string>(KNOWN_BLOCK_TYPES);

  const rawLines = text.split('\n');
  const malformedLines: MalformedLine[] = [];
  const records: RawRecord[] = [];
  let lines = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (line.trim().length === 0) continue;
    lines++;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      malformedLines.push({
        line: i + 1,
        reason: err instanceof Error ? err.message : 'unparseable JSON',
      });
      continue;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      malformedLines.push({ line: i + 1, reason: 'record is not a JSON object' });
      continue;
    }
    records.push(parsed as RawRecord);
  }

  // -- record census, uuid index, unknown types -----------------------------

  const recordsByType: Record<string, number> = {};
  const unknownRecordTypes: Record<string, number> = {};
  const byUuid = new Map<string, RawRecord>();
  let duplicateRecordUuids = 0;
  let compactBoundaries = 0;

  const childCount = new Map<string, number>();

  for (const record of records) {
    const type = str(record.type) ?? '(missing)';
    bump(recordsByType, type);
    if (!known.has(type)) bump(unknownRecordTypes, type);

    const uuid = str(record.uuid);
    if (uuid) {
      if (byUuid.has(uuid)) duplicateRecordUuids++;
      else byUuid.set(uuid, record);
    }

    const parent = str(record.parentUuid);
    if (parent) childCount.set(parent, (childCount.get(parent) ?? 0) + 1);

    if (type === 'system' && str(record.subtype) === 'compact_boundary') compactBoundaries++;
  }

  if (onUnknown === 'throw') {
    const names = Object.keys(unknownRecordTypes);
    if (names.length > 0) {
      throw new Error(
        `unknown transcript record type(s): ${names.join(', ')} — ` +
          `the format moved and this parser has not been checked against it (TRUSTSHELL-V1 §11)`
      );
    }
  }

  const graph = measureGraph(byUuid, childCount);

  // -- blocks, tool pairing -------------------------------------------------

  const blocks: BlockCensus = {
    assistantText: 0,
    assistantThinking: 0,
    toolUse: 0,
    toolResult: 0,
    userText: 0,
    userImage: 0,
    unknown: {},
  };

  interface PendingResult {
    outcome: 'ok' | 'error';
    timestamp: string | null;
    denialKind: string | null;
    duplicate: boolean;
  }

  const invocations = new Map<string, ToolInvocation>();
  const invocationOrder: string[] = [];
  const results = new Map<string, PendingResult>();
  const phantomToolResult: string[] = [];
  let duplicateToolResultBlocks = 0;

  let sessionId: string | null = null;
  let cwd: string | null = null;
  let gitBranch: string | null = null;
  let startedAt: string | null = null;
  let endedAt: string | null = null;

  for (const record of records) {
    const type = str(record.type);
    const timestamp = str(record.timestamp);
    if (timestamp) {
      if (!startedAt || timestamp < startedAt) startedAt = timestamp;
      if (!endedAt || timestamp > endedAt) endedAt = timestamp;
    }
    sessionId = sessionId ?? str(record.sessionId);
    cwd = cwd ?? str(record.cwd);
    gitBranch = gitBranch ?? str(record.gitBranch);

    for (const block of blocksOf(record)) {
      const blockType = str(block.type);
      if (!blockType) continue;

      if (!knownBlocks.has(blockType)) {
        bump(blocks.unknown, blockType);
        continue;
      }

      if (blockType === 'text') {
        if (type === 'assistant') blocks.assistantText++;
        else blocks.userText++;
        continue;
      }
      if (blockType === 'thinking') {
        blocks.assistantThinking++;
        continue;
      }
      if (blockType === 'image') {
        blocks.userImage++;
        continue;
      }

      if (blockType === 'tool_use') {
        blocks.toolUse++;
        const id = str(block.id);
        const name = str(block.name) ?? '(unnamed)';
        if (!id) continue;
        if (invocations.has(id)) continue;
        invocations.set(id, {
          id,
          name,
          mcpServer: str(record.attributionMcpServer),
          skill: str(record.attributionSkill),
          timestamp,
          recordUuid: str(record.uuid),
          effect: classifyEffect(name),
          files: filesOf(name, block.input),
          outcome: 'orphan',
          denialKind: null,
          resultTimestamp: null,
          latencyMs: null,
          resultDeliveredTwice: false,
        });
        invocationOrder.push(id);
        continue;
      }

      if (blockType === 'tool_result') {
        blocks.toolResult++;
        const id = str(block.tool_use_id);
        if (!id) continue;
        const outcome: 'ok' | 'error' = block.is_error === true ? 'error' : 'ok';
        const existing = results.get(id);
        if (existing) {
          duplicateToolResultBlocks++;
          // Keep the later delivery: when a call is rejected and re-run, the
          // second result is the one the session carried forward.
          results.set(id, {
            outcome,
            timestamp,
            denialKind: str(record.toolDenialKind) ?? existing.denialKind,
            duplicate: true,
          });
        } else {
          results.set(id, {
            outcome,
            timestamp,
            denialKind: str(record.toolDenialKind),
            duplicate: false,
          });
        }
      }
    }
  }

  // Pair. A result whose tool_use never appears is a phantom — the one thing
  // M1 must never produce (§10, "0 phantom results").
  results.forEach((result, id) => {
    const invocation = invocations.get(id);
    if (!invocation) {
      phantomToolResult.push(id);
      return;
    }
    invocation.outcome = result.denialKind ? 'denied' : result.outcome;
    invocation.denialKind = result.denialKind;
    invocation.resultTimestamp = result.timestamp;
    invocation.resultDeliveredTwice = result.duplicate;
    if (invocation.timestamp && result.timestamp) {
      const started = Date.parse(invocation.timestamp);
      const ended = Date.parse(result.timestamp);
      if (Number.isFinite(started) && Number.isFinite(ended)) invocation.latencyMs = ended - started;
    }
  });

  const tools = invocationOrder.map((id) => invocations.get(id) as ToolInvocation);
  const orphanToolUse = tools.filter((t) => t.outcome === 'orphan').map((t) => t.id);
  phantomToolResult.sort();

  // -- spend ----------------------------------------------------------------
  //
  // Grouped by requestId, not by record. Claude Code writes one record per
  // content block of a turn and repeats that turn's `usage` verbatim on each
  // of them. Summing records inflates every figure by however many blocks the
  // turn happened to contain — 2.36x on the observed corpus. `naive` keeps the
  // wrong number visible so the two can be told apart.

  interface TurnSpend {
    model: string;
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  }
  const turnsByRequest = new Map<string, TurnSpend>();
  const modelsSeen = new Set<string>();
  let naiveOutput = 0;
  let naiveRecords = 0;

  for (const record of records) {
    const usage = usageOf(record);
    if (!usage) continue;
    const model = modelOf(record) ?? '(unknown)';
    modelsSeen.add(model);
    naiveOutput += num(usage.output_tokens);
    naiveRecords++;

    const key = str(record.requestId) ?? str(record.uuid);
    if (!key) continue;
    if (turnsByRequest.has(key)) continue;
    turnsByRequest.set(key, {
      model,
      input: num(usage.input_tokens),
      output: num(usage.output_tokens),
      cacheRead: num(usage.cache_read_input_tokens),
      cacheWrite: num(usage.cache_creation_input_tokens),
    });
  }

  const perModel = new Map<string, ModelSpend>();
  const spend: SpendSummary = {
    turns: turnsByRequest.size,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    byModel: [],
    naive: { outputTokens: naiveOutput, records: naiveRecords, overcountFactor: 1 },
  };

  turnsByRequest.forEach((turn) => {
    spend.inputTokens += turn.input;
    spend.outputTokens += turn.output;
    spend.cacheReadTokens += turn.cacheRead;
    spend.cacheWriteTokens += turn.cacheWrite;
    let entry = perModel.get(turn.model);
    if (!entry) {
      entry = {
        model: turn.model,
        turns: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      };
      perModel.set(turn.model, entry);
    }
    entry.turns++;
    entry.inputTokens += turn.input;
    entry.outputTokens += turn.output;
    entry.cacheReadTokens += turn.cacheRead;
    entry.cacheWriteTokens += turn.cacheWrite;
  });

  spend.byModel = Array.from(perModel.values()).sort((a, b) => b.outputTokens - a.outputTokens);
  spend.naive.overcountFactor =
    spend.outputTokens > 0 ? Number((naiveOutput / spend.outputTokens).toFixed(4)) : 1;

  // -- rollups --------------------------------------------------------------

  const toolsByName: Record<string, number> = {};
  const toolsByMcpServer: Record<string, number> = {};
  const files = new Set<string>();
  for (const tool of tools) {
    bump(toolsByName, tool.name);
    if (tool.mcpServer) bump(toolsByMcpServer, tool.mcpServer);
    for (const file of tool.files) files.add(file);
  }

  return {
    sessionId,
    cwd,
    gitBranch,
    startedAt,
    endedAt,
    models: Array.from(modelsSeen).sort(),
    transcriptSha256: options.sha256 ?? null,
    census: {
      lines,
      parsedRecords: records.length,
      malformedLines,
      recordsByType,
      unknownRecordTypes,
      blocks,
      orphanToolUse,
      phantomToolResult,
      duplicateToolResultBlocks,
      duplicateRecordUuids,
      graph,
      compactBoundaries,
    },
    tools,
    spend,
    filesTouched: Array.from(files).sort(),
    toolsByName,
    toolsByMcpServer,
    parserVersion: PARSER_VERSION,
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

function padLeft(value: string, width: number): string {
  return value.length >= width ? value : ' '.repeat(width - value.length) + value;
}

const group = (n: number): string => n.toLocaleString('en-US');

/**
 * The §3 table, rendered. This is M1's acceptance criterion made literal: the
 * same six rows the spec measured by hand, plus the rows the hand-count missed.
 */
export function formatCensusTable(parsed: ParsedTranscript): string {
  const c = parsed.census;
  const rows: Array<[string, string, string]> = [
    ['tool_use blocks', group(c.blocks.toolUse), 'what the agent actually did'],
    ['tool_result blocks', group(c.blocks.toolResult), 'what actually came back'],
    ['assistant text blocks', group(c.blocks.assistantText), 'the claims'],
    ['thinking blocks', group(c.blocks.assistantThinking), 'excluded — not an assertion'],
    ['orphan tool_use (no result)', group(c.orphanToolUse.length), 'denied, interrupted, in flight'],
    ['tool_result with no tool_use', group(c.phantomToolResult.length), 'must be 0'],
    ['duplicate tool_result blocks', group(c.duplicateToolResultBlocks), 'retry / re-approval branches'],
    ['branch points', group(c.graph.branchPoints), 'parentUuid with >1 child'],
    ['chain roots', group(c.graph.roots), `${c.graph.danglingParents} are compaction / resume seams`],
    ['malformed lines', group(c.malformedLines.length), 'never skipped silently'],
    ['unknown record types', group(Object.keys(c.unknownRecordTypes).length), 'NOT CHECKED, not ignored'],
  ];

  const wKey = Math.max(...rows.map((r) => r[0].length));
  const wVal = Math.max(...rows.map((r) => r[1].length));
  const out = rows.map(([k, v, note]) => `  ${pad(k, wKey)}  ${padLeft(v, wVal)}  ${note}`);
  return out.join('\n');
}

/** One-line-per-section summary for the CLI. */
export function formatSummary(parsed: ParsedTranscript): string {
  const c = parsed.census;
  const s = parsed.spend;
  const byOutcome: Record<ToolOutcome, number> = { ok: 0, error: 0, denied: 0, orphan: 0 };
  const byEffect: Record<ToolEffect, number> = { write: 0, read: 0, unknown: 0 };
  for (const tool of parsed.tools) {
    byOutcome[tool.outcome]++;
    byEffect[tool.effect]++;
  }

  const topTools = Object.entries(parsed.toolsByName)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, n]) => `${name}:${n}`)
    .join('  ');

  const lines = [
    `session   ${parsed.sessionId ?? '(unknown)'}  branch=${parsed.gitBranch ?? '(unknown)'}`,
    `window    ${parsed.startedAt ?? '?'} → ${parsed.endedAt ?? '?'}`,
    `sha256    ${parsed.transcriptSha256 ?? '(not supplied)'}`,
    `parser    ${parsed.parserVersion}`,
    '',
    `records   ${group(c.parsedRecords)} parsed of ${group(c.lines)} lines`,
    `graph     ${group(c.graph.addressableRecords)} addressable — ${c.graph.roots} chains, ` +
      `${c.graph.branchPoints} branch points, ${c.graph.leaves} leaves, longest chain ${group(c.graph.longestChain)}` +
      `  (which records are live is not decidable here — see TranscriptGraph)`,
    `types     ${Object.entries(c.recordsByType)
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${t}:${n}`)
      .join('  ')}`,
    '',
    '§3 census',
    formatCensusTable(parsed),
    '',
    `actions   ${group(parsed.tools.length)} calls — ` +
      `ok ${byOutcome.ok}, error ${byOutcome.error}, denied ${byOutcome.denied}, orphan ${byOutcome.orphan}`,
    `effects   write ${byEffect.write}, read ${byEffect.read}, unknown ${byEffect.unknown}` +
      `  (unknown is honest: Bash and MCP are not decidable from the transcript)`,
    `files     ${parsed.filesTouched.length} touched by write tools`,
    `top       ${topTools}`,
    '',
    `spend     ${group(s.turns)} turns — in ${group(s.inputTokens)}, out ${group(s.outputTokens)}, ` +
      `cache read ${group(s.cacheReadTokens)}, cache write ${group(s.cacheWriteTokens)}`,
    `models    ${s.byModel.map((m) => `${m.model} (${m.turns} turns, ${group(m.outputTokens)} out)`).join('; ')}`,
    `naive     a per-record sum would report ${group(s.naive.outputTokens)} output tokens ` +
      `across ${group(s.naive.records)} records — ${s.naive.overcountFactor}x the real figure`,
  ];
  return lines.join('\n');
}
