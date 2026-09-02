// lib/trustshell/runtime/execute.ts — the runtime that ties the whole path together.
//
// This is the ONE real side-effect action path (the brief's "First prove this with
// ONE real side-effect action path"). It composes the pieces into a single loop:
//
//   proposal + args
//        │  normalize (untrusted → typed Envelope)
//        │  idempotency  (a requestId is single-use — no replay/double execution)
//        │  args-binding (the args must hash to the Envelope's argsHash)
//        ▼
//   kernel guardedExecute  (Kernel Laws → policy → gate; runs the executor ONLY on ALLOW)
//        │
//        ▼
//   real executor runs (file write, etc.)  →  Trust Receipt (every disposition)
//
// FIVE INVARIANTS THIS EXISTS TO PROVE (brief point 9), each checkable:
//   1. NO ENVELOPE BYPASS — the executor is reachable ONLY through the kernel's
//      guardedExecute, and only on ALLOW. There is no other call site.
//   2. NO PRIVILEGE AMPLIFICATION — a Kernel-Law-forbidden or ungranted capability
//      never reaches the executor (inherited from the kernel; capabilities are
//      TTL'd and attenuate-only, capability.ts).
//   3. NO REPLAY / DOUBLE EXECUTION — a requestId is consumed on first disposition;
//      a second call with the same requestId returns the stored receipt and does
//      NOT run the side effect again.
//   4. HAL CANNOT AUTHORIZE — evidence is passed to the kernel as input only, and
//      only when its state is `enabled`; the deterministic policy decides.
//   5. EVERY COMMITTED ACTION PRODUCES A RECEIPT — in fact every disposition does,
//      committed or blocked; `executed === (outcome === 'committed')`.

import type { TrustActionEnvelope } from '../kernel/envelope';
import { normalizeEnvelope } from '../kernel/envelope';
import type { Constitution } from '../kernel/constitution';
import { constitutionFingerprint } from '../kernel/constitution';
import { guardedExecute } from '../kernel/gate';
import { hashArgs } from './receipt';
import type { TrustReceipt, ReceiptBody, ReceiptEvidence } from './receipt';
import { buildReceipt } from './receipt';

/** What a concrete side effect returns. It should catch its own IO errors and
 *  report `error` rather than throw, but the runtime also guards against a throw. */
export interface ExecutionResult {
  readonly outcome: 'committed' | 'error';
  readonly detail: string;
}

/** A real side effect, run ONLY on a legitimate ALLOW, on args already bound to
 *  the Envelope's argsHash. */
export type Executor = (envelope: TrustActionEnvelope, args: unknown) => Promise<ExecutionResult>;

/** The single-use record of processed requests — the no-replay ledger. Injected so
 *  a durable (DB) ledger can replace the in-memory one without touching this file. */
export interface ExecutionLedger {
  get(requestId: string): TrustReceipt | undefined;
  put(requestId: string, receipt: TrustReceipt): void;
}

export class InMemoryLedger implements ExecutionLedger {
  private readonly rows = new Map<string, TrustReceipt>();
  get(requestId: string): TrustReceipt | undefined {
    return this.rows.get(requestId);
  }
  put(requestId: string, receipt: TrustReceipt): void {
    this.rows.set(requestId, receipt);
  }
}

export interface RunInput {
  /** Untrusted proposed action (normalized here). */
  readonly proposal: unknown;
  /** The concrete arguments the executor will act on; bound to the Envelope by hash. */
  readonly args: unknown;
  readonly constitution: Constitution;
  /** Capability names of currently-valid grants (capability.resolveGrantedCapabilities). */
  readonly grantedCapabilities: readonly string[];
  readonly approvals?: readonly string[];
  /** HAL's advice. Used by the kernel only when `state === 'enabled'`. */
  readonly evidence?: ReceiptEvidence;
  /** Composition identity/lineage of the acting agent (minimal for the slice). */
  readonly composition?: string;
  readonly verifyThreshold?: number;
  /** ms epoch; receipts timestamp from here so tests are reproducible. */
  readonly now: number;
}

export interface RunOutput {
  readonly receipt: TrustReceipt;
  /** Did the real side effect run on THIS call? (false on a replay.) */
  readonly executed: boolean;
  /** True when this requestId had already been processed. */
  readonly replay: boolean;
}

/**
 * Run one proposed action through the whole path. Always returns a receipt.
 */
export async function runAction(
  input: RunInput,
  executor: Executor,
  ledger: ExecutionLedger
): Promise<RunOutput> {
  const nowIso = new Date(input.now).toISOString();
  const fp = constitutionFingerprint(input.constitution);
  const composition = input.composition ?? 'composition:unspecified';

  // (a) Normalize. A malformed proposal is a blocked receipt; nothing runs, and
  //     there is no stable requestId to key the ledger, so it is not recorded.
  const norm = normalizeEnvelope(input.proposal);
  if (!norm.ok) {
    const raw = input.proposal as { requestId?: unknown; nonce?: unknown };
    return {
      executed: false,
      replay: false,
      receipt: buildReceipt(
        blockedBody({
          requestId: typeof raw?.requestId === 'string' ? raw.requestId : 'unknown',
          nonce: typeof raw?.nonce === 'string' ? raw.nonce : 'unknown',
          principal: 'unknown',
          capability: 'unknown',
          tool: 'unknown',
          targetResource: 'unknown',
          argsHash: 'unknown',
          fp,
          composition,
          decision: 'DENY',
          firedRule: null,
          evidence: input.evidence ?? null,
          detail: norm.reason,
          at: nowIso,
        })
      ),
    };
  }
  const envelope = norm.envelope;

  // (b) Idempotency: a requestId is single-use. A repeat returns the stored
  //     receipt and does NOT run the side effect again.
  const prior = ledger.get(envelope.requestId);
  if (prior) {
    return { receipt: prior, executed: false, replay: true };
  }

  // (c) Args-binding: the executor's args must hash to the Envelope's argsHash.
  //     A mismatch means the args were swapped after authorization — block.
  if (hashArgs(input.args) !== envelope.argsHash) {
    const receipt = buildReceipt(
      blockedBody({
        ...fromEnvelope(envelope),
        fp,
        composition,
        decision: 'DENY',
        firedRule: null,
        evidence: input.evidence ?? null,
        detail: 'args do not match the authorized argsHash (post-authorization swap)',
        at: nowIso,
      })
    );
    ledger.put(envelope.requestId, receipt);
    return { receipt, executed: false, replay: false };
  }

  // (d) HAL advises: pass confidence to the kernel ONLY when the evidence is
  //     ENABLED. Disabled/unavailable evidence → no confidence → the kernel's
  //     high-risk VERIFY branch blocks (fail-closed). Policy, not HAL, decides.
  const kernelEvidence =
    input.evidence && input.evidence.state === 'enabled' && typeof input.evidence.confidence === 'number'
      ? { confidence: input.evidence.confidence, source: input.evidence.source ?? undefined }
      : undefined;

  // (e) Dispose + execute through the kernel gate — the ONLY path that runs the
  //     executor, and only on ALLOW.
  let executed = false;
  let decision: ReceiptBody['decision'] = 'DENY';
  let firedRule: string | null = null;
  let outcome: ReceiptBody['outcome'] = 'blocked';
  let detail = '';
  try {
    const result = await guardedExecute(
      input.proposal,
      input.constitution,
      {
        grantedCapabilities: input.grantedCapabilities,
        approvals: input.approvals,
        evidence: kernelEvidence,
        verifyThreshold: input.verifyThreshold,
      },
      (env) => executor(env, input.args)
    );
    decision = result.decision;
    if (result.ran) {
      executed = true;
      outcome = result.value.outcome;
      detail = result.value.detail;
    } else {
      firedRule = result.verdict?.firedRule ?? null;
      detail = result.reason;
    }
  } catch (e) {
    // A throw from the executor (unexpected IO fault). The side effect may have
    // partially happened; record it honestly as an error, not a commit.
    executed = true;
    outcome = 'error';
    detail = `executor threw: ${e instanceof Error ? e.message : String(e)}`;
  }

  const receipt = buildReceipt({
    ...fromEnvelope(envelope),
    constitutionFingerprint: fp,
    composition,
    decision,
    firedRule,
    evidence: input.evidence ?? null,
    executed,
    outcome,
    outcomeDetail: detail,
    at: nowIso,
  });
  ledger.put(envelope.requestId, receipt);
  return { receipt, executed, replay: false };
}

function fromEnvelope(e: TrustActionEnvelope) {
  return {
    requestId: e.requestId,
    principal: e.principal,
    capability: e.capability,
    tool: e.tool,
    targetResource: e.targetResource,
    argsHash: e.argsHash,
    nonce: e.nonce,
  };
}

/** Assemble a blocked (non-executed) receipt body. */
function blockedBody(x: {
  requestId: string;
  principal: string;
  capability: string;
  tool: string;
  targetResource: string;
  argsHash: string;
  nonce: string;
  fp: string;
  composition: string;
  decision: ReceiptBody['decision'];
  firedRule: string | null;
  evidence: ReceiptEvidence | null;
  detail: string;
  at: string;
}): ReceiptBody {
  return {
    requestId: x.requestId,
    principal: x.principal,
    capability: x.capability,
    tool: x.tool,
    targetResource: x.targetResource,
    argsHash: x.argsHash,
    constitutionFingerprint: x.fp,
    composition: x.composition,
    decision: x.decision,
    firedRule: x.firedRule,
    evidence: x.evidence,
    executed: false,
    outcome: 'blocked',
    outcomeDetail: x.detail,
    at: x.at,
    nonce: x.nonce,
  };
}
