// lib/trustshell/kernel/envelope.ts — the Trust/Action Envelope.
//
// THE ONE PATH TO A SIDE EFFECT. A model, an agent, a router — anything in the
// optimization plane — may *propose* an action, but it does so by emitting an
// Envelope, never by calling a tool directly. The Envelope is then handed to the
// deterministic policy engine (policy.ts), which *disposes* of it. "Models
// propose, TrustShell disposes"; the LLM's output is untrusted input to a
// deterministic gate. (docs/TRUSTHARNESS-STRATEGY.md §3.1.)
//
// NAMING. Called "Trust/Action Envelope", not "Trust Execution Envelope": "TEE"
// already means Trusted Execution Environment across this stack (ERC-8004's
// validation section lists TEE oracles), so a second "TEE" would guarantee a
// confused threat model.
//
// WHY HAND-ROLLED VALIDATION AND NOT A SCHEMA LIBRARY. A trust boundary should be
// readable in full at the boundary — `lib/dual-view/contract.ts` validates the
// same way, and the point is that a reviewer can see exactly which fields are
// required and exactly what "malformed" means, because *malformed → DENY* is a
// load-bearing security property, not a convenience. `normalizeEnvelope` takes an
// UNTRUSTED value (it may be anything an upstream model produced) and returns
// either a fully-typed Envelope or a reason it was rejected — it never throws on
// bad input and never half-accepts.

/** How reversible the proposed action is. Irreversible actions are the ones a
 *  hard rule most often escalates. */
export type Reversibility = 'reversible' | 'irreversible';

/** Sensitivity of the data the action touches. Coarse on purpose — the finer
 *  context-firewall model is a later interface; this is what the gate needs. */
export type DataClassification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'SECRET';

/** How much scrutiny the action warrants before it may run. `high` is the class
 *  that policy may route to VERIFY when evidence is thin. */
export type RiskClass = 'low' | 'medium' | 'high';

export const REVERSIBILITY: readonly Reversibility[] = ['reversible', 'irreversible'];
export const DATA_CLASSIFICATION: readonly DataClassification[] = [
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'SECRET',
];
export const RISK_CLASS: readonly RiskClass[] = ['low', 'medium', 'high'];

/**
 * A normalized, pre-execution description of ONE proposed action. Every field is
 * present and typed by the time this exists — `normalizeEnvelope` is the only
 * way to make one from untrusted input, and it rejects rather than fills gaps.
 */
export interface TrustActionEnvelope {
  /** Idempotency / audit key for this proposal. */
  readonly requestId: string;
  /** Who the action is on behalf of (the principal identity). */
  readonly principal: string;
  /** The capability being exercised, e.g. `repo.branch.create`. The gate grants
   *  authority per-capability; a capability the caller was not minted → DENY. */
  readonly capability: string;
  /** The concrete tool/endpoint that would run, e.g. `github.createBranch`. */
  readonly tool: string;
  /** What the tool acts on, e.g. `repo:acme/web@branch:agent/1`. */
  readonly targetResource: string;
  /** A content hash of the arguments. The kernel core does not read argument
   *  bodies — it authorizes the *shape* of the action and binds the args by
   *  hash so a receipt can prove which arguments were authorized. */
  readonly argsHash: string;
  readonly dataClassification: DataClassification;
  readonly riskClass: RiskClass;
  readonly reversibility: Reversibility;
  /** Worst-case value at stake, in the constitution's unit. 0 for non-financial. */
  readonly financialExposure: number;
  /** Single-use nonce; replay protection is the caller's, but the field is
   *  required so a receipt can carry it. */
  readonly nonce: string;
}

export interface NormalizeOk {
  readonly ok: true;
  readonly envelope: TrustActionEnvelope;
}
export interface NormalizeErr {
  readonly ok: false;
  /** Why the input was rejected. A rejected Envelope is a DENY at the gate. */
  readonly reason: string;
}
export type NormalizeResult = NormalizeOk | NormalizeErr;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function requireString(
  obj: Record<string, unknown>,
  field: string,
  errors: string[]
): string {
  const v = obj[field];
  if (typeof v !== 'string' || v.length === 0) {
    errors.push(`\`${field}\` must be a non-empty string`);
    return '';
  }
  return v;
}

function requireEnum<T extends string>(
  obj: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
  errors: string[]
): T {
  const v = obj[field];
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    errors.push(`\`${field}\` must be one of ${allowed.join(' / ')}`);
    return allowed[0];
  }
  return v as T;
}

function requireFiniteNonNegative(
  obj: Record<string, unknown>,
  field: string,
  errors: string[]
): number {
  const v = obj[field];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    errors.push(`\`${field}\` must be a finite number >= 0`);
    return 0;
  }
  return v;
}

/**
 * Turn an UNTRUSTED proposed action into a typed Envelope, or say why not.
 *
 * Fail-closed by construction: any missing, mistyped, or out-of-range field
 * makes the whole result `{ ok: false }` with every problem named at once, so a
 * caller cannot accidentally act on a partially-valid Envelope. It never throws
 * — hostile input is data, not an exception.
 */
export function normalizeEnvelope(raw: unknown): NormalizeResult {
  if (!isPlainObject(raw)) {
    return { ok: false, reason: 'envelope must be an object' };
  }
  const errors: string[] = [];

  const envelope: TrustActionEnvelope = {
    requestId: requireString(raw, 'requestId', errors),
    principal: requireString(raw, 'principal', errors),
    capability: requireString(raw, 'capability', errors),
    tool: requireString(raw, 'tool', errors),
    targetResource: requireString(raw, 'targetResource', errors),
    argsHash: requireString(raw, 'argsHash', errors),
    dataClassification: requireEnum(raw, 'dataClassification', DATA_CLASSIFICATION, errors),
    riskClass: requireEnum(raw, 'riskClass', RISK_CLASS, errors),
    reversibility: requireEnum(raw, 'reversibility', REVERSIBILITY, errors),
    financialExposure: requireFiniteNonNegative(raw, 'financialExposure', errors),
    nonce: requireString(raw, 'nonce', errors),
  };

  if (errors.length > 0) {
    return { ok: false, reason: `invalid envelope: ${errors.join('; ')}` };
  }
  return { ok: true, envelope };
}
