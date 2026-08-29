// app/api/trustrails/receipts/verify/route.ts
//
// Hand out everything needed to verify a receipt WITHOUT us.
//
// ── WHY THIS IS A SEPARATE ROUTE FROM THE FEED ──────────────────────────────
//
// `../route.ts` deliberately narrowed `select('*')` down to the ten columns the
// live feed renders, and dropped `recipient_address` because the feed has no
// reason to hand it out. That decision is correct and is NOT reversed here.
//
// But verification needs the opposite thing. `commitment_hash` is a hash of
// nine fields, and a hash cannot be checked without its inputs — four of which
// (`recipient_address`, `bft_consensus_weight`, `rule_hash`, plus the exact
// three-state `bft_passed`) the feed does not carry. Publishing the commitment
// on the feed and withholding its preimage would be the worst of both: a
// verification mechanism wired at one end, which is harder to notice than one
// that is simply absent.
//
// So: the feed stays minimal, and disclosure lives on the route whose entire
// purpose is disclosure, one receipt at a time, by id.
//
// ── THE TRADE THIS ROUTE MAKES, STATED RATHER THAN HIDDEN ───────────────────
//
// A verifiable receipt necessarily discloses `recipient_address` to whoever
// verifies it. That is inherent to hashing — not a leak introduced here — and
// it is why this is by-id rather than a listing: a caller must already hold the
// receipt id, which is an unguessable UUID. Sharing the id is sharing the
// receipt. That is what a receipt is.
//
// ── PUBLIC OR NOT IS SEAN'S CALL, NOT THIS FILE'S ───────────────────────────
//
// Authenticated by default. `RECEIPT_VERIFY_PUBLIC=1` opens it, following the
// pattern this repo already uses for exactly this situation (`PAY_AUTH_MODE`,
// `bftEnforcementMode`): ship the mechanism, leave the policy switch to the
// person who owns the policy. Third-party verification does not WAIT on that
// flag — `scripts/verify-receipt.mjs --file` verifies a receipt JSON handed
// over by any means at all, with no credential and no call to this route.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { authenticate, authErrorResponse } from '@/lib/auth';
import {
  paymentCommitmentPreimage,
  paymentAuditInputFromRow,
  PAYMENT_COMMITMENT_DOMAIN,
  NULL_COMMITMENT_IS_NOT_CHECKED,
} from '@/lib/trustshell/receipt-audit';

/**
 * Exactly the nine fields the commitment covers, plus the commitment itself and
 * the signature pair. Nothing else.
 *
 * Kept as a literal list rather than derived, so that adding a column to the
 * table cannot silently widen what this route discloses.
 */
const VERIFY_COLUMNS = [
  'receipt_id',
  'agent_name',
  'agent_repid_score',
  'payment_amount_usdc',
  'recipient_address',
  'bft_passed',
  'bft_consensus_weight',
  'solana_tx_hash',
  'rule_hash',
  // The commitment and its optional attestation.
  'commitment_hash',
  'signer_did',
  'signature',
  // Context a verifier will want, explicitly NOT covered by the commitment.
  'created_at',
  'base_sepolia_tx_hash',
  'tx_verification_status',
  'on_chain_verified',
].join(', ');

/** The commitment binds these. Everything else in the response does not. */
const COVERED = [
  'receipt_id',
  'agent_name',
  'agent_repid_score',
  'payment_amount_usdc',
  'recipient_address',
  'bft_passed',
  'bft_consensus_weight',
  'solana_tx_hash',
  'rule_hash',
];

export async function GET(req: NextRequest) {
  try {
    if (process.env.RECEIPT_VERIFY_PUBLIC !== '1') {
      await authenticate(req);
    }

    const id = req.nextUrl.searchParams.get('receipt_id');
    if (!id) {
      return NextResponse.json(
        { error: 'receipt_id is required' },
        { status: 400 }
      );
    }

    const { data, error } = await getSupabaseAdmin()
      .from('kya_compliance_receipts')
      .select(VERIFY_COLUMNS)
      .eq('receipt_id', id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: `no receipt with id ${id}` }, { status: 404 });
    }

    const row = data as unknown as Parameters<typeof paymentAuditInputFromRow>[0] &
      Record<string, unknown>;

    // The preimage is returned, not just the fields. A verifier who rebuilds it
    // from the fields and disagrees with us has found something; a verifier who
    // cannot see what we hashed has only our word for the encoding, which is
    // the failure this whole change exists to remove.
    const preimage =
      row.commitment_hash === null || row.commitment_hash === undefined
        ? null
        : paymentCommitmentPreimage(paymentAuditInputFromRow(row));

    return NextResponse.json({
      receipt: data,
      verification: {
        domain: PAYMENT_COMMITMENT_DOMAIN,
        algorithm: 'sha256',
        // Keyless. Said out loud because it is the entire point: a caller does
        // not have to trust us, ask us, or hold anything of ours.
        keyed: false,
        preimage,
        covered_fields: COVERED,
        // NOT_CHECKED is an absence, and rendering it as a failure would assert
        // something nobody measured.
        outcome: preimage === null ? 'NOT_CHECKED' : 'VERIFIABLE',
        note:
          preimage === null
            ? NULL_COMMITMENT_IS_NOT_CHECKED
            : 'sha256 of `preimage` must equal `receipt.commitment_hash`. This proves the ' +
              'covered fields are unchanged since minting. It does NOT prove the payment ' +
              'occurred — that is the on-chain transaction, not a hash of our own claims. ' +
              'Fields outside covered_fields are not bound by the commitment.',
        how: 'node scripts/verify-receipt.mjs --file <this response\'s `receipt` object>',
      },
    });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
