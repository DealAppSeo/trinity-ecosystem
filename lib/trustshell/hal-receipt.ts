// lib/trustshell/hal-receipt.ts
//
// The pure half of minting a compliance receipt from a HAL classification.
//
// ZERO IMPORTS, deliberately. Everything here is a decision about what a receipt
// does and does not claim, and each one is worth asserting directly. Its sibling
// `ComplianceReceipt.ts` reaches Supabase through the `@/` path alias, so a check
// suite cannot compile it standalone — which is exactly why the payment
// preimage, built inline in that file, has never had a test. Same shape of
// mistake as the one probe-before-cite closes: the thing nobody could run is the
// thing nobody checked.

/** The subset of a `hal_classifications` row a receipt commits to. */
export interface HalClassificationInput {
  id: number;
  prompt_hash: string;
  category: string | null;
  confidence: string | null;
  provider: string | null;
  model: string | null;
  previous_entry_hash: string | null;
}

/**
 * The exact string a HAL receipt's audit hash is taken over.
 *
 * Exported as a pure function so it can be asserted directly. The payment
 * preimage is built inline inside `generate()` and therefore cannot be tested
 * without a database; that is the mistake not being repeated here.
 *
 * Domain-tagged. The payment preimage is an untagged join of payment fields, so
 * without a tag the two preimage spaces could in principle collide and two
 * different events would carry one audit hash. The payment tag is NOT
 * retrofitted — doing so would invalidate every audit hash already issued.
 */
export function halReceiptAuditPreimage(c: HalClassificationInput, receiptId: string): string {
  // Each field is JSON-encoded rather than interpolated raw. The first draft of
  // this function used `?? 'null'` joined on ':' and its own test suite caught
  // two ways that is ambiguous — both on the first run:
  //
  //   1. An ABSENT field and the literal four-character string "null" produced
  //      the same preimage. A classification with no category hashed
  //      identically to one categorised "null".
  //   2. A field CONTAINING a colon shifts every later boundary. `model` is a
  //      provider-qualified string, so this is a live shape, not a contrivance:
  //      {model: "a:b", previous_entry_hash: "c"} and
  //      {model: "a", previous_entry_hash: "b:c"} joined to the same string.
  //
  // JSON.stringify closes both: `null` and `"null"` differ by the quotes, and
  // any ':' inside a value stays inside its own quoted span. An audit hash that
  // is not injective over its inputs does not bind them, and a receipt whose
  // hash does not distinguish two different classifications is not evidence.
  //
  // The version tag is part of the preimage precisely so this encoding can be
  // changed later without silently reinterpreting hashes already issued. It is
  // still v1 because no HAL receipt has been minted yet — this was fixed before
  // the first row, not after.
  return [
    '"hal_classification/v1"',
    JSON.stringify(receiptId),
    JSON.stringify(c.id),
    JSON.stringify(c.prompt_hash),
    JSON.stringify(c.category),
    JSON.stringify(c.confidence),
    JSON.stringify(c.provider),
    JSON.stringify(c.model),
    // Binding the chain link means the receipt commits to HAL's own
    // tamper-evident ordering, not merely to this row's contents.
    JSON.stringify(c.previous_entry_hash),
  ].join(':');
}

/**
 * The exact string a HAL receipt's KEYLESS commitment is taken over.
 *
 * ── WHY A SECOND HASH ───────────────────────────────────────────────────────
 *
 * `audit_hash` above is an HMAC keyed by the issuer's secret, so only the
 * issuer can re-derive it. A receipt exists to be shown to somebody else, and
 * that somebody has no secret. The same defect was found and fixed on the
 * payment path first (`receipt-audit.ts`); this is the HAL half, and it is the
 * half that matters more, because the replay writes 147,704 rows at once.
 *
 * ── THE IRREVERSIBILITY TRAP THIS PARTLY DEFUSES ────────────────────────────
 *
 * `docs/PRIOR-WORK-INDEX.md` records it: `audit_hash` is nullable and
 * `kya_receipts_hal_classification_uniq` is a partial UNIQUE index, so a replay
 * run under a BAD secret writes unverifiable receipts that idempotency then
 * refuses to let anyone re-mint.
 *
 * The commitment takes NO secret, so it is correct on those same rows whatever
 * the secret was. A botched replay would still leave every row third-party
 * verifiable. **It does not make the trap safe** -- `audit_hash` stays
 * permanently unverifiable and un-re-mintable, so the checklist still applies
 * in full. It bounds the damage; it does not remove it.
 *
 * Same fields, same order as the audit preimage, so the two answer questions
 * about identical content and only the domain tag differs. Separate function
 * rather than a parameter because a caller who could pass the tag could compute
 * a commitment inside the HMAC's space.
 */
export function halCommitmentPreimage(c: HalClassificationInput, receiptId: string): string {
  return [
    '"hal_receipt_commitment/v1"',
    JSON.stringify(receiptId),
    JSON.stringify(c.id),
    JSON.stringify(c.prompt_hash),
    JSON.stringify(c.category),
    JSON.stringify(c.confidence),
    JSON.stringify(c.provider),
    JSON.stringify(c.model),
    JSON.stringify(c.previous_entry_hash),
  ].join(':');
}

/**
 * The row a HAL receipt writes. Pure, so every "we do not claim this" decision
 * below is assertable without touching Supabase.
 */
export function halReceiptRow(
  c: HalClassificationInput,
  receiptId: string,
  auditHash: string,
  /**
   * The keyless commitment. REQUIRED, not optional, deliberately: an optional
   * parameter would let a caller omit it and still mint a row, and a row minted
   * without it is verifiable only by us -- the exact defect this closes. The
   * type system is the enforcement, so a future writer cannot forget.
   */
  commitmentHash: string
): Record<string, unknown> {
  return {
    receipt_id:   receiptId,
    receipt_kind: 'hal_classification',
    // `agent_name` is NOT NULL and predates the discriminator. The provider is
    // the closest true answer; inventing an agent identity would put a fiction
    // in a column other code reads as identity.
    agent_name:   c.provider ?? 'unknown',

    hal_classification_id:   c.id,
    hal_prompt_hash:         c.prompt_hash,
    hal_category:            c.category,
    hal_confidence:          c.confidence,
    hal_provider:            c.provider,
    hal_model:               c.model,
    hal_previous_entry_hash: c.previous_entry_hash,

    // No KYA check runs on this path; true would assert a check nobody did.
    kya_verified: false,
    // NULL, not false. The panel did not vote. Three outcomes, never two — all
    // 12 pre-existing rows were retracted because a placeholder recorded a pass
    // for a vote that never happened.
    bft_passed:   null,
    audit_hash:   auditHash,
    // Keyless. This is the one a third party can check. See halCommitmentPreimage.
    commitment_hash: commitmentHash,

    // `not_applicable` rather than the column default `pending`: pending
    // asserts a chain write is coming, and none is. No CHECK constrains this
    // column, and the value is deliberately one no existing reader matches, so
    // HAL receipts stay visible in a group-by instead of joining the payment
    // population unnoticed.
    tx_verification_status: 'not_applicable',
    on_chain_verified: false,
    // The column defaults to 'base-sepolia'. A HAL classification touches no
    // chain, so accepting the default would write a network name that is simply
    // untrue — the same class of error as a placeholder BFT pass.
    on_chain_network: null,
  };
}
