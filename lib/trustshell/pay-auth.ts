// lib/trustshell/pay-auth.ts
//
// Who is allowed to call the payment route?
//
// Today: anyone. `app/api/trustrails/pay/route.ts` has no authentication of any
// kind. The only barrier is that `agentName` must already exist in
// `agent_kya_registry` — which is a lookup, not a credential, and the agent
// names are not secret.
//
// ── SHIPPED IN OBSERVE MODE, DELIBERATELY ───────────────────────────────────
//
// Whether that route is meant to be callable by anyone is a POLICY question, not
// a code one, and turning authentication on unilaterally would break every
// existing caller in a single commit. So this follows the pattern already in the
// repo for exactly this situation — `bftEnforcementMode`, and the ControlProof
// shadow on the same route: **evaluate, disclose, change nothing** until
// `PAY_AUTH_MODE=enforce` is set.
//
// Observe mode is not a placeholder. It answers the question that has to be
// answered before enforcement is safe: how many live callers would this deny?
// Nobody can answer that today, which is the actual reason auth has not shipped.
//
// ── SIGNATURE, NOT A BEARER TOKEN ───────────────────────────────────────────
//
// The credential signs the REQUEST, so it cannot be lifted from one call and
// replayed with a different amount or recipient. A bearer token is a password
// for the whole route; an HMAC over the body authorises exactly one payment.
//
// It reuses `TRUSTRAILS_HMAC_SECRET` and its existing rules rather than
// inventing a credential: the same `MIN_AUDIT_SECRET_LENGTH` bound, and the same
// refusal of `ABANDONED_DEFAULT_SECRET` — a value that is published, long enough
// to pass a length check, and therefore forgeable by anyone.
//
// ── THREE OUTCOMES, AND THE THIRD IS NOT A PASS ─────────────────────────────
//
// `NOT_CHECKED` means no secret is configured, so nothing could be verified. In
// enforce mode that DENIES, matching the RepID threshold's reasoning on the same
// route — "a limit that could not be evaluated is not a limit that passed" —
// and not BFT's, because an unconfigured authentication check that allows is an
// open door reached by a missing environment variable.

import { ABANDONED_DEFAULT_SECRET, MIN_AUDIT_SECRET_LENGTH } from './receipt-audit';

export type PayAuthMode = 'observe' | 'enforce';

/** Default is `observe`. Enforcement is opt-in, and only Sean opts in. */
export function payAuthMode(env: Record<string, string | undefined>): PayAuthMode {
  return env.PAY_AUTH_MODE === 'enforce' ? 'enforce' : 'observe';
}

export type PayAuthOutcome = 'VERIFIED' | 'NOT_CHECKED' | 'FAILED';

export interface PayAuthVerdict {
  outcome: PayAuthOutcome;
  /** Why, in one line the response can carry. */
  detail: string;
}

/** The window a signed request stays valid for. Five minutes, in milliseconds. */
export const SIGNATURE_WINDOW_MS = 5 * 60 * 1000;

export const SIGNATURE_HEADER = 'x-trustrails-signature';
export const TIMESTAMP_HEADER = 'x-trustrails-timestamp';

/**
 * Is this secret usable at all?
 *
 * Order matters and is not arbitrary — the same order `classifySecret` uses in
 * `config-readiness.ts`. The abandoned default is checked BEFORE the length
 * bound because it is long enough to pass it, so a length-first test reports the
 * one known-forgeable value as fine.
 */
export function secretUsable(secret: string | undefined): PayAuthVerdict | null {
  if (!secret || secret.trim().length === 0) {
    return { outcome: 'NOT_CHECKED', detail: 'TRUSTRAILS_HMAC_SECRET is not set' };
  }
  if (secret === ABANDONED_DEFAULT_SECRET) {
    return {
      outcome: 'NOT_CHECKED',
      detail:
        'TRUSTRAILS_HMAC_SECRET is the published abandoned default — anyone can forge a ' +
        'signature with it, so verifying against it would be worse than not verifying',
    };
  }
  if (secret.trim().length < MIN_AUDIT_SECRET_LENGTH) {
    return {
      outcome: 'NOT_CHECKED',
      detail: `TRUSTRAILS_HMAC_SECRET is shorter than ${MIN_AUDIT_SECRET_LENGTH} characters`,
    };
  }
  return null;
}

/**
 * Compare two hex digests without leaking where they differ.
 *
 * `a === b` on a digest returns as soon as it finds a mismatched byte, and the
 * time it takes is a function of how many leading bytes were right. That is
 * enough to recover a signature one byte at a time over enough requests. Length
 * is compared first and separately because it is not secret.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** `sha256=<hex>`, or the bare hex. Returns null when the header is unusable. */
export function parseSignatureHeader(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  const hex = value.startsWith('sha256=') ? value.slice('sha256='.length) : value;
  return /^[0-9a-f]{64}$/i.test(hex) ? hex.toLowerCase() : null;
}

/**
 * Is the timestamp inside the replay window?
 *
 * A signature with no expiry authorises its payment forever, so a single
 * captured request could be resubmitted indefinitely. Note this bounds REPLAY of
 * a signed request; it does not make the payment itself idempotent — that is
 * `reward-idempotency.ts` and the receipt's unique key, a separate mechanism for
 * a separate failure.
 *
 * A timestamp in the FUTURE beyond the window is rejected too. Allowing it would
 * let a caller mint a signature valid long after the secret is rotated.
 */
export function timestampFresh(raw: string | null | undefined, now: number): boolean {
  if (!raw) return false;
  const ts = Number(raw);
  if (!Number.isFinite(ts)) return false;
  return Math.abs(now - ts) <= SIGNATURE_WINDOW_MS;
}

/** What gets signed. Timestamp first so a body cannot forge one by containing a dot. */
export function signingPayload(timestamp: string, body: string): string {
  return `${timestamp}.${body}`;
}

/**
 * Verify the request signature.
 *
 * Returns a verdict, never a boolean — the three outcomes are the point. A
 * missing signature is FAILED rather than NOT_CHECKED: the check ran, the
 * caller simply presented nothing. NOT_CHECKED is reserved for "we could not
 * evaluate", which here means the SERVER is misconfigured, not the client.
 */
export async function verifyPaySignature(input: {
  rawBody: string;
  signature: string | null | undefined;
  timestamp: string | null | undefined;
  secret: string | undefined;
  now: number;
  /** Injected so the suite can drive this without a WebCrypto polyfill. */
  hmac?: (secret: string, message: string) => Promise<string>;
}): Promise<PayAuthVerdict> {
  const unusable = secretUsable(input.secret);
  if (unusable) return unusable;

  const provided = parseSignatureHeader(input.signature);
  if (!provided) {
    return {
      outcome: 'FAILED',
      detail: `${SIGNATURE_HEADER} is missing or is not a 64-character hex digest`,
    };
  }
  if (!timestampFresh(input.timestamp, input.now)) {
    return {
      outcome: 'FAILED',
      detail:
        `${TIMESTAMP_HEADER} is missing, unparseable, or outside the ` +
        `${SIGNATURE_WINDOW_MS / 1000}s window`,
    };
  }

  const compute = input.hmac ?? hmacSha256Hex;
  const expected = await compute(
    input.secret as string,
    signingPayload(String(input.timestamp), input.rawBody)
  );

  return constantTimeEqual(provided, expected.toLowerCase())
    ? { outcome: 'VERIFIED', detail: 'signature matches' }
    : { outcome: 'FAILED', detail: 'signature does not match the body and timestamp' };
}

/** HMAC-SHA256 as lowercase hex, via WebCrypto — available in the Next runtime. */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface PayAuthDecision {
  /** May the request proceed? True for every verdict while mode is `observe`. */
  allow: boolean;
  mode: PayAuthMode;
  outcome: PayAuthOutcome;
  /** True when observe mode is the only reason this was allowed. THE measurement. */
  wouldDenyUnderEnforcement: boolean;
  detail: string;
}

/**
 * Apply the mode to the verdict.
 *
 * `wouldDenyUnderEnforcement` is the field this whole module exists to produce.
 * It is what answers "how many live callers would enforcement break", and until
 * someone can answer that from real traffic, flipping the switch is a guess.
 */
export function payAuthDecision(verdict: PayAuthVerdict, mode: PayAuthMode): PayAuthDecision {
  const wouldDeny = verdict.outcome !== 'VERIFIED';
  return {
    allow: mode === 'observe' ? true : !wouldDeny,
    mode,
    outcome: verdict.outcome,
    wouldDenyUnderEnforcement: wouldDeny,
    detail:
      mode === 'observe' && wouldDeny
        ? `${verdict.detail} — ALLOWED because PAY_AUTH_MODE is observe; this would be denied under enforce`
        : verdict.detail,
  };
}
