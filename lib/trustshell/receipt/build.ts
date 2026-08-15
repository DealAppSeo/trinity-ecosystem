// lib/trustshell/receipt/build.ts — parsed transcript -> unsigned receipt.
//
// Pure. No file handles, no git, no clock, no network. Everything the receipt
// needs from outside is passed in, for the same reason TranscriptParser takes a
// string rather than a path: a live session is appended to while it is read, so
// anything that reaches out for its own inputs cannot be re-derived later.

import type { ParsedTranscript, ToolOutcome } from '../TranscriptParser';
import { canonicalJson, receiptIdFromAuditHash, sha256Hex } from './canonical';
import {
  AUDIT_DOMAIN,
  M2_RULESET,
  RECEIPT_SCHEMA_VERSION,
  type ActionsBlock,
  type ClaimsBlock,
  type Marker,
  type ReceiptCore,
  type Ruleset,
  type SessionReceipt,
  type SpendBlock,
} from './types';

export interface BuildOptions {
  ruleset?: Ruleset;
  /** HEAD the claims were made against. Absent stays absent, never ''. */
  gitHeadSha?: string | null;
  /**
   * Files `git diff --name-only` reports for the same branch. Supplying this
   * turns on reconciliation; omitting it leaves `gitDiffReconciled` at
   * NOT_CHECKED. There is no third state where we guess.
   */
  gitChangedFiles?: string[];
  /** From agent_kya_registry when the session is bound to an agent. */
  declaredLimitDaily?: number | null;
  /** Observed spend to compare against the declared limit, in the same unit. */
  observedSpendDaily?: number | null;
  /** Harness failures to record. §11: these force the marker down, never up. */
  internalErrors?: string[];
}

/**
 * The marker, derived from the core. §6, and the mitigation named in §11.
 *
 * The ordering matters and the last branch is the one that exists because of
 * this repo's history:
 *
 *   1. an internal error -> NOT_CHECKED. A harness that broke halfway cannot
 *      report a clean session; that is the product reproducing its own bug.
 *   2. contradicted claims -> FAILED.
 *   3. unchecked claims -> NOT_CHECKED.
 *   4. NO CLAIM TIER ENABLED -> NOT_CHECKED, unconditionally.
 *
 * Without (4), M2 would emit VERIFIED on every session: claim checking does not
 * ship until M4, so `total`, `unchecked` and `failed` are all zero, and a naive
 * "nothing failed" test reads that as success. Zero claims checked is not zero
 * claims contradicted. That is the `release-trust-demo` credential check —
 * green with no credential — and the `scan-secrets --history` run that reported
 * a clean tree from a `git grep` that exited 128. Same shape, third instance,
 * caught this time before shipping.
 */
export function markerFor(core: Pick<ReceiptCore, 'claims' | 'ruleset' | 'internalErrors'>): Marker {
  if (core.internalErrors.length > 0) return 'NOT_CHECKED';
  if (core.claims.failed > 0) return 'FAILED';
  if (core.claims.unchecked > 0) return 'NOT_CHECKED';

  const anyClaimTier = core.ruleset.claimsT0 || core.ruleset.claimsT1 || core.ruleset.claimsT2;
  if (!anyClaimTier) return 'NOT_CHECKED';

  return 'VERIFIED';
}

export async function ruleHashFor(ruleset: Ruleset): Promise<string> {
  return sha256Hex(`${AUDIT_DOMAIN}:ruleset|${canonicalJson(ruleset)}`);
}

const EMPTY_OUTCOMES: Record<ToolOutcome, number> = { ok: 0, error: 0, denied: 0, orphan: 0 };

function actionsFrom(parsed: ParsedTranscript, opts: BuildOptions): ActionsBlock {
  const byOutcome: Record<ToolOutcome, number> = { ...EMPTY_OUTCOMES };
  let writeOps = 0;
  let readOps = 0;
  let unknownEffectOps = 0;
  let duplicateDeliveries = 0;

  for (const t of parsed.tools) {
    byOutcome[t.outcome] += 1;
    if (t.effect === 'write') writeOps += 1;
    else if (t.effect === 'read') readOps += 1;
    else unknownEffectOps += 1;
    if (t.resultDeliveredTwice) duplicateDeliveries += 1;
  }

  const filesTouched = [...parsed.filesTouched].sort();

  // Reconciliation is what makes §4.1 more than a log: it catches an agent that
  // says it edited a file when nothing changed on disk. Only run it when the
  // caller supplied the git side; inferring an empty diff from an absent one
  // would turn "we did not look" into "nothing changed".
  let gitDiffReconciled: Marker = 'NOT_CHECKED';
  let reconcileMismatches: string[] = [];
  if (opts.ruleset?.gitReconcile && opts.gitChangedFiles) {
    const changed = new Set(opts.gitChangedFiles);
    reconcileMismatches = filesTouched.filter((f) => !changed.has(f)).sort();
    gitDiffReconciled = reconcileMismatches.length === 0 ? 'VERIFIED' : 'FAILED';
  }

  return {
    toolCalls: parsed.tools.length,
    toolResults: parsed.census.blocks.toolResult,
    orphanCalls: parsed.census.orphanToolUse.length,
    duplicateDeliveries,
    writeOps,
    readOps,
    unknownEffectOps,
    byOutcome,
    filesTouched,
    gitDiffReconciled,
    reconcileMismatches,
  };
}

function spendFrom(parsed: ParsedTranscript, opts: BuildOptions): SpendBlock {
  const s = parsed.spend;

  const declaredLimitDaily = opts.declaredLimitDaily ?? null;
  const observed = opts.observedSpendDaily ?? null;

  // Three outcomes again. An unbound session has no limit to diverge from, and
  // saying `false` there would assert compliance nobody measured.
  let limitDivergence: Marker = 'NOT_CHECKED';
  if (declaredLimitDaily !== null && observed !== null) {
    limitDivergence = observed > declaredLimitDaily ? 'FAILED' : 'VERIFIED';
  }

  return {
    turns: s.turns,
    inputTokens: s.inputTokens,
    outputTokens: s.outputTokens,
    cacheReadTokens: s.cacheReadTokens,
    cacheWriteTokens: s.cacheWriteTokens,
    naiveOutputTokens: s.naive.outputTokens,
    // Rounded here, once, so the ratio has exactly one representation in the
    // hashed region. A float that differs in its last bit between runs would
    // break auditHash stability in a way that is miserable to diagnose.
    overcountFactor: Math.round(s.naive.overcountFactor * 1e6) / 1e6,
    byModel: [...s.byModel]
      .sort((a, b) => a.model.localeCompare(b.model))
      .map((m) => ({
        model: m.model,
        turns: m.turns,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
      })),
    declaredLimitDaily,
    limitDivergence,
  };
}

/**
 * M2 ships no claim checking, so every field here is zero and the marker logic
 * above turns that into NOT_CHECKED rather than VERIFIED. When M4 lands, this
 * is the only function that changes.
 */
function claimsFrom(): ClaimsBlock {
  return { total: 0, verified: 0, unchecked: 0, failed: 0, findings: [] };
}

export async function buildReceipt(
  parsed: ParsedTranscript,
  opts: BuildOptions = {}
): Promise<SessionReceipt> {
  const ruleset = opts.ruleset ?? M2_RULESET;
  const withRuleset: BuildOptions = { ...opts, ruleset };

  const core: ReceiptCore = {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    parserVersion: parsed.parserVersion,
    ruleset,
    ruleHash: await ruleHashFor(ruleset),

    sessionId: parsed.sessionId,
    cwd: parsed.cwd,
    gitBranch: parsed.gitBranch,
    gitHeadSha: opts.gitHeadSha ?? null,
    startedAt: parsed.startedAt,
    endedAt: parsed.endedAt,
    models: [...parsed.models].sort(),

    transcriptSha256: parsed.transcriptSha256,

    actions: actionsFrom(parsed, withRuleset),
    spend: spendFrom(parsed, withRuleset),
    claims: claimsFrom(),

    internalErrors: [...(opts.internalErrors ?? [])].sort(),
  };

  const auditHash = await auditHashFor(core);

  return {
    receiptId: receiptIdFromAuditHash(auditHash),
    core,
    auditHash,
    marker: markerFor(core),
    attestation: { kind: 'unsigned', signerDid: null, signature: null },
  };
}

export async function auditHashFor(core: ReceiptCore): Promise<string> {
  return sha256Hex(`${AUDIT_DOMAIN}|${canonicalJson(core)}`);
}

/**
 * Recompute everything derived and report each part separately.
 *
 * Deliberately NOT a boolean. "The receipt is valid" collapses four independent
 * questions — do the bytes hash to the stated hash, does the id match the hash,
 * does the marker match the data, is the signature good — and a caller handed
 * one boolean cannot tell a tampered claim count from a wrong key.
 */
export async function recomputeReceipt(receipt: SessionReceipt): Promise<{
  auditHashMatches: boolean;
  receiptIdMatches: boolean;
  markerMatches: boolean;
  expected: { auditHash: string; receiptId: string; marker: Marker };
}> {
  const auditHash = await auditHashFor(receipt.core);
  const receiptId = receiptIdFromAuditHash(auditHash);
  const marker = markerFor(receipt.core);
  return {
    auditHashMatches: auditHash === receipt.auditHash,
    receiptIdMatches: receiptId === receipt.receiptId,
    markerMatches: marker === receipt.marker,
    expected: { auditHash, receiptId, marker },
  };
}
