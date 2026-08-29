// lib/trustshell/receipt-audit.ts
//
// The pure half of a PAYMENT receipt's audit hash: the preimage, and the rule
// that the signing secret must exist.
//
// ZERO IMPORTS, deliberately — the third file in this directory to make that
// split, and it exists because `hal-receipt.ts` predicted this one. Its header
// says, of `ComplianceReceipt.ts`:
//
//   "the payment preimage, built inline in that file, has never had a test.
//    Same shape of mistake as the one probe-before-cite closes: the thing
//    nobody could run is the thing nobody checked."
//
// It was right. Both defects it had already fixed for the HAL preimage were
// still live in the payment one.
//
// ── DEFECT 1: ABSENT AND PRESENT-BUT-EQUAL COLLIDED ─────────────────────────
//
// The old preimage joined nine fields with ':' and rendered a missing
// transaction hash as the literal string `'no_tx'`. So:
//
//   receipt for a payment that was never broadcast   -> …:no_tx:rule-1
//   receipt whose tx hash IS the string "no_tx"      -> …:no_tx:rule-1
//
// Identical bytes, identical audit hash, two materially different receipts.
// Demonstrated before this file was written, not inferred. `consensusWeight`
// carried the same shape with `?? 'null'`.
//
// JSON-encoding each field closes it: `null` and `"no_tx"` differ by their
// quotes, and any ':' inside a value stays inside its own quoted span. An audit
// hash that is not injective over its inputs does not bind them, and a receipt
// whose hash cannot distinguish two different payments is not evidence.
//
// A colon inside a field was ALSO checked and, with this particular field
// ordering, could not be made to collide — the numeric fields between the free
// text ones prevent the boundary shift from landing. Recorded because it was
// tested and came back negative, not because it was assumed safe; the encoding
// below removes the class regardless.
//
// ── DEFECT 2: THE AUDIT HASH WAS FORGEABLE BY ANYONE HOLDING THE REPO ───────
//
// `audit_hash` is an **HMAC**, described in the source as "tamper-evident proof
// of entire receipt". Its tamper-evidence rests entirely on the secret. The old
// code read:
//
//   process.env.TRUSTRAILS_HMAC_SECRET || 'trinity-default-sbt-secret'
//
// `TRUSTRAILS_HMAC_SECRET` is unset in this environment — verified — so the
// audit hash was computed under a constant printed in the source, and anyone
// with the repository could mint a valid one for any receipt they liked. It was
// tamper-evident to nobody.
//
// `docs/SHIP-CHECKLIST.md` already carried the caveat — *"Falls back to a shared
// default if unset — set it"* — which is the debt CLAUDE.md warns about: a
// caveat written down and then relied on. Nothing enforced it, and it was not
// set. `requireAuditSecret` enforces it, because the alternative to a loud
// configuration error here is a silent security one.
//
// **THIS THROWS WHERE THE OLD CODE SILENTLY SUCCEEDED.** That is the intended
// change and it needs the variable set wherever receipts are minted. It
// converts an already-worthless audit hash into a refusal to mint one, which is
// the trade this codebase makes everywhere else.

/** Domain tag. Present so this preimage space cannot collide with the HAL one. */
export const PAYMENT_AUDIT_DOMAIN = 'payment_receipt/v1';

/**
 * The fields a payment receipt's audit hash commits to.
 *
 * `null` is a first-class value here rather than a sentinel string, which is
 * the whole point — see defect 1.
 */
export interface PaymentAuditInput {
  receiptId: string;
  agentName: string;
  repidScore: number;
  amountUSDC: number;
  recipientAddress: string;
  /** Null when the panel did not evaluate. NOT the same as `false`. */
  bftPassed: boolean | null;
  /** Null when there is no weight, e.g. an unevaluated panel. */
  consensusWeight: number | null;
  /** Null when nothing was broadcast. NOT the string 'no_tx'. */
  solanaTxHash: string | null;
  ruleHash: string;
}

/**
 * The exact string a payment receipt's audit hash is taken over.
 *
 * Exported as a pure function so it can be asserted directly — which is the
 * thing that was impossible while it lived inline in a Supabase-importing class.
 *
 * VERSION-TAGGED, and the tag is v1 because **no receipt has been minted under
 * this encoding yet**. The old inline construction produced different bytes, so
 * audit hashes already in `kya_compliance_receipts` were computed under the old
 * rule and will not reproduce under this one. That is a migration question, not
 * a silent reinterpretation: see `PRE_V1_HASHES_DO_NOT_REPRODUCE`.
 */
export function paymentAuditPreimage(input: PaymentAuditInput): string {
  return [
    JSON.stringify(PAYMENT_AUDIT_DOMAIN),
    JSON.stringify(input.receiptId),
    JSON.stringify(input.agentName),
    JSON.stringify(input.repidScore),
    JSON.stringify(input.amountUSDC),
    JSON.stringify(input.recipientAddress),
    // null / true / false are three distinct JSON tokens. The old encoding
    // rendered the unevaluated case as the string 'not_evaluated', which was
    // safe only because 'true' and 'false' cannot equal it — a coincidence, not
    // a design.
    JSON.stringify(input.bftPassed),
    JSON.stringify(input.consensusWeight),
    JSON.stringify(input.solanaTxHash),
    JSON.stringify(input.ruleHash),
  ].join(':');
}

/**
 * Audit hashes written before this encoding will NOT reproduce under it.
 *
 * Stated as an exported constant rather than a comment so a verifier can read
 * it, because the failure it prevents is somebody re-hashing an old receipt,
 * getting a mismatch, and concluding the row was tampered with.
 */
export const PRE_V1_HASHES_DO_NOT_REPRODUCE =
  'Receipts minted before payment_receipt/v1 used an inline colon-join with ' +
  "sentinel strings ('no_tx', 'null', 'not_evaluated') and no domain tag. Their " +
  'audit hashes do not reproduce under paymentAuditPreimage and a mismatch on ' +
  'such a row is an encoding change, NOT evidence of tampering.';

/**
 * The HMAC secret, or a throw that names the variable.
 *
 * NO FALLBACK. `lib/CLAUDE.md` is explicit — *"Do not add a dummy fallback…
 * Missing configuration must throw and name the variable"* — and the reason is
 * sharper here than for a database URL: a wrong URL fails visibly, whereas a
 * default HMAC secret produces a perfectly well-formed audit hash that proves
 * nothing. The failure is indistinguishable from success at every layer above.
 *
 * A short secret is refused too. A one-character key produces a valid-looking
 * HMAC, so length is the only thing standing between "configured" and
 * "configured badly", and neither is visible in the output.
 */
export const MIN_AUDIT_SECRET_LENGTH = 16;

/** The constant the old fallback used. Published here and in git history. */
export const ABANDONED_DEFAULT_SECRET = 'trinity-default-sbt-secret';

export function isAbandonedDefaultSecret(secret: string): boolean {
  return secret.trim() === ABANDONED_DEFAULT_SECRET;
}

export function requireAuditSecret(env: Record<string, string | undefined>): string {
  const secret = env.TRUSTRAILS_HMAC_SECRET;
  if (secret === undefined || secret.trim() === '') {
    throw new Error(
      'TRUSTRAILS_HMAC_SECRET is not set. The receipt audit hash is an HMAC, so ' +
        'without it the hash is computed under a constant and anyone holding this ' +
        'repository can forge one — the receipt would be tamper-evident to nobody. ' +
        'Refusing to mint. Set TRUSTRAILS_HMAC_SECRET wherever receipts are minted.'
    );
  }
  // Refused explicitly. It is 26 characters, so it clears the length rule, and
  // the most likely way this weakness comes back is somebody "fixing" the
  // missing variable by pasting the constant the old fallback used.
  if (isAbandonedDefaultSecret(secret)) {
    throw new Error(
      'TRUSTRAILS_HMAC_SECRET is set to the abandoned default that used to be ' +
        'hardcoded in ComplianceReceipt.ts. It is published in this repository and ' +
        'in git history, so every audit hash under it is forgeable. Refusing to mint.'
    );
  }
  if (secret.trim().length < MIN_AUDIT_SECRET_LENGTH) {
    throw new Error(
      `TRUSTRAILS_HMAC_SECRET is ${secret.trim().length} characters; at least ` +
        `${MIN_AUDIT_SECRET_LENGTH} are required. A short key yields a valid-looking ` +
        'HMAC, so nothing downstream would reveal that it is weak.'
    );
  }
  return secret;
}


// ── THE AUDIT HASH IS NOT VERIFIABLE BY ANYONE BUT THE ISSUER ───────────────
//
// Found 2026-08-29 by `trinity-nexus` in a threat-modelling pass, and confirmed
// against this file rather than relayed: `audit_hash` is an HMAC keyed by
// `TRUSTRAILS_HMAC_SECRET`, so re-deriving it requires the secret, so only the
// issuer can check it. A receipt exists to be shown to somebody else. "The
// receipt is authentic" therefore collapses to "the issuer says it is", which
// is the trust relationship the receipt was supposed to remove.
//
// The HMAC is not useless and is NOT being removed — it is what makes the row
// tamper-EVIDENT to the issuer, who is the party that would have to be the
// forger for silent modification to matter. What it cannot do is travel.
//
// **THE FIX IS ADDITIVE, AND THAT IS THE WHOLE DESIGN.** A second hash over the
// same fields with NO KEY. Every field in the preimage is a stored column, so a
// third party holding nothing but the row and this function reproduces it
// exactly — no secret, no API call, no trust in us. Existing `audit_hash`
// consumers are untouched; nothing reinterprets an old row.
//
// The two live in separate hash spaces by domain tag, so a value from one can
// never be presented as a value from the other.
//
// What this deliberately does NOT claim: re-deriving the commitment proves the
// row has not changed since it was written. It does not prove the row was ever
// TRUE — that the payment happened, that BFT really passed. Binding a receipt
// to reality is the on-chain tx hash and the attestation, not a hash of our own
// assertions. A commitment over a lie reproduces perfectly.

/** Domain tag for the keyless commitment. Distinct from the HMAC's by design. */
export const PAYMENT_COMMITMENT_DOMAIN = 'payment_receipt_commitment/v1';

/**
 * The exact string a payment receipt's KEYLESS commitment is taken over.
 *
 * Same fields and same order as `paymentAuditPreimage` — deliberately, so the
 * two answer questions about identical content and a reader comparing them has
 * only the domain tag to account for. It is a separate function rather than a
 * parameter on that one because the domain tag must not be caller-supplied:
 * a caller who could pass it could compute a commitment in the HMAC's space.
 */
export function paymentCommitmentPreimage(input: PaymentAuditInput): string {
  return [
    JSON.stringify(PAYMENT_COMMITMENT_DOMAIN),
    JSON.stringify(input.receiptId),
    JSON.stringify(input.agentName),
    JSON.stringify(input.repidScore),
    JSON.stringify(input.amountUSDC),
    JSON.stringify(input.recipientAddress),
    JSON.stringify(input.bftPassed),
    JSON.stringify(input.consensusWeight),
    JSON.stringify(input.solanaTxHash),
    JSON.stringify(input.ruleHash),
  ].join(':');
}

/**
 * Reconstruct the commitment input from a stored row.
 *
 * This is the function a third-party verifier actually needs, and it is the
 * reason the commitment is worth anything: it names, in one place, exactly
 * which columns the commitment covers and how a raw row maps onto them. Without
 * it every verifier re-derives that mapping by reading the mint path, and any
 * one of them getting `bft_passed`'s three states wrong reports tampering.
 *
 * Numeric columns come back from PostgREST as strings (`numeric` is not a JS
 * number), so they are coerced here rather than at each call site. A verifier
 * that skipped this would hash "5" where the mint hashed 5 and report FAILED on
 * an untouched row.
 */
export function paymentAuditInputFromRow(row: {
  receipt_id: string;
  agent_name: string;
  agent_repid_score: number | string | null;
  payment_amount_usdc: number | string | null;
  recipient_address: string | null;
  bft_passed: boolean | null;
  bft_consensus_weight: number | string | null;
  solana_tx_hash: string | null;
  rule_hash: string | null;
}): PaymentAuditInput {
  const num = (v: number | string | null): number => (v === null ? 0 : Number(v));
  return {
    receiptId: row.receipt_id,
    agentName: row.agent_name,
    repidScore: num(row.agent_repid_score),
    amountUSDC: num(row.payment_amount_usdc),
    recipientAddress: row.recipient_address ?? '',
    // Three states. `null` is "the panel did not evaluate", NOT `false`.
    bftPassed: row.bft_passed,
    consensusWeight: row.bft_consensus_weight === null ? null : num(row.bft_consensus_weight),
    solanaTxHash: row.solana_tx_hash,
    ruleHash: row.rule_hash ?? '',
  };
}

/**
 * Commitments written before this encoding do not exist.
 *
 * Unlike `PRE_V1_HASHES_DO_NOT_REPRODUCE`, there is no ambiguity to warn about:
 * `commitment_hash` is NULL on every row minted before this column, and NULL
 * means NOT CHECKED — no commitment was computed. It does not mean the row
 * failed verification, and a verifier that renders it as a failure is asserting
 * something nobody measured.
 */
export const NULL_COMMITMENT_IS_NOT_CHECKED =
  'commitment_hash is NULL on receipts minted before payment_receipt_commitment/v1. ' +
  'That is NOT_CHECKED — no keyless commitment was written — and it is not evidence ' +
  'of tampering. Such a row can only be verified by the issuer, via audit_hash.';
