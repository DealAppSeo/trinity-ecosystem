// lib/trustshell/evidence/canonical-evidence.ts — the canonical evidence row.
//
// Refinement (b) of the strategy, §3.3: SEPARATE THE EVIDENCE FROM THE SCORE.
// A reputation number is an interpretation; the evidence is the truth. So the
// kernel stores canonical, append-only evidence ROWS, and a versioned Trust Lens
// (trust-lens.ts) computes a score FROM them at read time. Changing weights, decay,
// or the whole scoring model never rewrites history — it is a different lens over
// the same rows.
//
// WHY THIS IS THE HIGHEST-LEVERAGE SMALL PIECE (strategy §6). "The one thing you
// cannot retroactively manufacture is real historical evidence." Every day the
// kernel runs without structured evidence rows is reputation data permanently
// lost. Collect the receipts before building the lenses.
//
// THE LAW, STATED BEFORE THE FIELDS: A ROW STORES EVIDENCE, NEVER A SCORE.
// There is no `reputation`, no `rank`, no baked number on a row. `metric` +
// `success` (+ `latencyMs`) are the RAW outcome a lens reduces; they are not a
// score, and a row that cannot be classified into a metric carries `metric: null`
// and contributes to no lens — never a fabricated signal. This is the same
// discipline EarnedMetrics.ts enforces one level up (unmeasured contributes zero,
// never a default), applied at the storage boundary.
//
// APPEND-ONLY IS THE OTHER HALF OF THAT LAW. Evidence you can edit is not
// evidence. `EvidenceStore.append` never overwrites, and there is no update or
// delete on the interface. The durable, hash-chained, EAS-anchored store
// (HyperDAG writer, strategy §3.3) is the NEXT step and is deliberately NOT in
// this file — this ships the schema + an in-memory append-only store so the
// kernel can start collecting rows offline today; persistence is fenced behind
// the `EvidenceStore` interface exactly as the execution ledger fences its store.
//
// INTEGRITY HASH, NOT A COMMITMENT. `integrityHash` is a SHA-256 over the row's
// canonical serialization — it detects tampering with a stored row. It is NOT a
// signature and NOT an on-chain commitment; anchoring is the AttestationSink's
// job (EAS, later), named honestly per this repo's discipline, exactly as
// runtime/receipt.ts names its own.

import { createHash } from 'node:crypto';
import type { TrustReceipt } from '../runtime/receipt';
import type { EvidenceState } from '../runtime/receipt';

/**
 * Which earned dimension a row bears on. Closed on purpose and aligned with
 * EarnedMetrics' four metrics (the default lens reduces exactly these). A row
 * that bears on none of them is `null` — honest "unclassified", never coerced
 * into a signal it did not produce.
 */
export type EvidenceMetric = 'bft_accuracy' | 'veritas_catch' | 'x402_success' | 'latency';

/** The same set at runtime — a union is erased at an HTTP/DB boundary. */
export const EVIDENCE_METRICS: readonly EvidenceMetric[] = [
  'bft_accuracy',
  'veritas_catch',
  'x402_success',
  'latency',
];

/**
 * One canonical evidence row — strategy §3.3's field set, normalized.
 *
 * `{who, for-whom, what, with-what, under-what-authority, cost, evidence,
 * verification, outcome, composition, timestamps, parent-task}` — plus the raw
 * material a lens needs (`metric` / `success` / `latencyMs`) and NO score.
 */
export interface CanonicalEvidenceRow {
  // ── identity / provenance (who did what, for whom, as what) ──────────────
  /** The subject the evidence is ABOUT — the agent whose reputation it bears on. */
  readonly who: string;
  /** The beneficiary, when the action was on someone's behalf. Absent is normal. */
  readonly forWhom: string | null;
  /** What was done — the capability exercised and the tool that carried it. */
  readonly what: { readonly capability: string; readonly tool: string; readonly targetResource: string };
  /** With what the actor was composed — model + tools + MCPs, as an opaque id for now (§3.2 is the full four-level identity). */
  readonly withWhat: string;
  /** Under what authority — the constitution that governed it, plus an optional grant reference. */
  readonly underWhatAuthority: { readonly constitutionFingerprint: string; readonly grantRef: string | null };

  // ── the evidence itself (input, verification, outcome) ───────────────────
  /** Binds the exact arguments (the Envelope's argsHash) — the input side of the evidence. */
  readonly argsHash: string;
  /**
   * The validator's evidence for this row — confidence, source and availability
   * STATE (enabled / disabled / unavailable). A reference to what a validator
   * (HAL) returned, NOT a score. Null when no validator was consulted.
   */
  readonly verification: { readonly confidence: number | null; readonly source: string | null; readonly state: EvidenceState } | null;
  /** What actually happened. The ground truth a lens reduces. */
  readonly outcome: 'committed' | 'blocked' | 'error';

  // ── the raw material a lens reduces — NOT a score ────────────────────────
  /** Which earned dimension this row bears on, or `null` for unclassified. */
  readonly metric: EvidenceMetric | null;
  /** For a rate metric: did this outcome count as a success? Ignored for latency and for `metric: null`. */
  readonly success: boolean;
  /** For the latency metric: the observed latency in ms. Null otherwise. */
  readonly latencyMs: number | null;
  /** Optional domain tag, so a lens can scope a score rather than compute it globally. */
  readonly domain: string | null;

  // ── cost, lineage, time ──────────────────────────────────────────────────
  /** What the action cost, when known (tokens, USDC, ms of wall-clock — opaque unit for now). */
  readonly cost: number | null;
  /** The task this evidence belongs to, and its parent — the lineage a composition/audit walk follows. */
  readonly taskId: string;
  readonly parentTaskId: string | null;
  /** When the outcome happened. ISO 8601. Read-time decay rests on this — it is asserted, never proven. */
  readonly observedAt: string;
}

/** Everything hashed into `integrityHash` (the row minus the hash itself). */
export type EvidenceRowBody = CanonicalEvidenceRow;

export interface SealedEvidenceRow extends CanonicalEvidenceRow {
  /** SHA-256 over the canonical serialization of the row body. */
  readonly integrityHash: string;
}

/** Deterministic canonical JSON: keys sorted at every level. Mirrors receipt.ts. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** SHA-256 hex of an evidence row body's canonical form. */
export function evidenceIntegrityHash(body: EvidenceRowBody): string {
  return 'sha256:' + createHash('sha256').update(canonical(body)).digest('hex');
}

/** Seal a row with its integrity hash. */
export function sealEvidenceRow(body: EvidenceRowBody): SealedEvidenceRow {
  return { ...body, integrityHash: evidenceIntegrityHash(body) };
}

/** Re-derive the hash and compare — true when the row has not been tampered with. */
export function verifyEvidenceIntegrity(row: SealedEvidenceRow): boolean {
  const { integrityHash, ...body } = row;
  return evidenceIntegrityHash(body) === integrityHash;
}

/**
 * How a caller classifies a receipt into an earned dimension. The kernel does NOT
 * guess this: a file-write receipt bears on no RepID metric, and inventing one
 * would be the exact fabricated-signal defect DISPUTE-001 exists to catch. The
 * caller that has the domain knowledge supplies it; absent, the row is `null` and
 * contributes to no lens.
 */
export interface ReceiptClassification {
  readonly metric: EvidenceMetric | null;
  /** Overrides success when the metric's success is not simply "committed". */
  readonly success?: boolean;
  readonly latencyMs?: number | null;
  readonly domain?: string | null;
  readonly cost?: number | null;
  readonly forWhom?: string | null;
  readonly parentTaskId?: string | null;
}

/**
 * Normalize a TrustReceipt (runtime/receipt.ts) into a canonical evidence row.
 *
 * The receipt is already ~most of a row — this maps its fields and attaches the
 * caller's classification. Default success is "the executor committed"; a
 * classifier may override it (e.g. a veritas catch is a success even though it
 * blocked something). `metric` defaults to `null` — no fabricated signal.
 */
export function evidenceFromReceipt(receipt: TrustReceipt, cls: ReceiptClassification = { metric: null }): SealedEvidenceRow {
  const body: EvidenceRowBody = {
    who: receipt.principal,
    forWhom: cls.forWhom ?? null,
    what: { capability: receipt.capability, tool: receipt.tool, targetResource: receipt.targetResource },
    withWhat: receipt.composition,
    underWhatAuthority: { constitutionFingerprint: receipt.constitutionFingerprint, grantRef: receipt.firedRule ?? null },
    argsHash: receipt.argsHash,
    verification: receipt.evidence
      ? { confidence: receipt.evidence.confidence, source: receipt.evidence.source, state: receipt.evidence.state }
      : null,
    outcome: receipt.outcome,
    metric: cls.metric,
    success: cls.success ?? receipt.outcome === 'committed',
    latencyMs: cls.latencyMs ?? null,
    domain: cls.domain ?? null,
    cost: cls.cost ?? null,
    taskId: receipt.requestId,
    parentTaskId: cls.parentTaskId ?? null,
    observedAt: receipt.at,
  };
  return sealEvidenceRow(body);
}

/**
 * The append-only canonical evidence store.
 *
 * Injected so a durable (HyperDAG / Supabase / EAS-anchored) store can replace
 * the in-memory one without touching a caller. There is NO update and NO delete:
 * evidence you can edit is not evidence.
 */
export interface EvidenceStore {
  /** Append one row. Never overwrites; the row is added to the end of the history. */
  append(row: SealedEvidenceRow): void;
  /** Every row, in append order. */
  all(): readonly SealedEvidenceRow[];
  /** Every row about `who`, in append order. */
  forSubject(who: string): readonly SealedEvidenceRow[];
}

/**
 * The reference in-memory append-only store. Enough to collect rows offline
 * today and to test a lens against; the durable store is the fenced next step.
 */
export class InMemoryEvidenceStore implements EvidenceStore {
  private readonly rows: SealedEvidenceRow[] = [];
  append(row: SealedEvidenceRow): void {
    this.rows.push(row);
  }
  all(): readonly SealedEvidenceRow[] {
    // A COPY, never the live array. `readonly` is a compile-time promise only —
    // erased at runtime — so returning `this.rows` would hand a caller
    // `store.all()[0] = tampered` / `.splice(...)`, an overwrite-and-delete path
    // that defeats append-only exactly where the type says it cannot. Independent
    // verification found this; `forSubject` already copied, and now so does this.
    return this.rows.slice();
  }
  forSubject(who: string): readonly SealedEvidenceRow[] {
    return this.rows.filter((r) => r.who === who);
  }
}
