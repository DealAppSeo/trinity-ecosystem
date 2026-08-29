#!/usr/bin/env node
// scripts/verify-receipt.mjs — check a TrustRails payment receipt WITHOUT
// holding any secret of ours.
//
//   node scripts/verify-receipt.mjs --file receipt.json
//   node scripts/verify-receipt.mjs --stdin  < receipt.json
//   node scripts/verify-receipt.mjs --id <receipt_id>      (convenience; needs DB access)
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// `audit_hash` is an HMAC keyed by TRUSTRAILS_HMAC_SECRET. Re-deriving it needs
// the secret, so only we can check it. A receipt exists to be shown to somebody
// else, and "the receipt is authentic" was therefore resolving to "the issuer
// says it is" — the exact trust relationship a receipt is supposed to remove.
// Found 2026-08-29 in a threat-modelling pass and confirmed against the source.
//
// `commitment_hash` is the half that travels: plain SHA-256 over the same nine
// fields, every one of them a column on the row. THIS SCRIPT NEEDS NO SECRET,
// and the first thing it does is prove that by refusing to read one.
//
// ── WHAT A PASS DOES AND DOES NOT MEAN ──────────────────────────────────────
//
// This section said "VERIFIED means these bytes have not changed since the
// commitment was written." **That was overstated, and `trinity-hdm` caught it
// adversarially reviewing this very file on 2026-08-29.** Its argument holds:
// the commitment and the fields it covers live in the SAME ROW. Anyone who can
// write that row rewrites both, and this script still prints VERIFIED. The
// prover is the database itself, and there is no external anchor.
//
// So the accurate claim is narrower, and it is worth stating exactly:
//
//   VERIFIED means the covered fields still agree with the commitment column.
//   That detects modification by anyone who could change the fields but NOT
//   also the commitment -- a partial edit, a bad migration, corruption in
//   transit -- and it lets ANY HOLDER OF A COPY detect alteration by comparing
//   commitments. It does NOT defend against whoever holds write access to the
//   row, because they change both together.
//
// Closing that gap needs the commitment ANCHORED somewhere the database cannot
// reach -- on chain, or in an attestation -- so a rewrite has to contradict a
// record it does not control. That is not built. Saying so is the point: an
// unanchored commitment is a real improvement over an issuer-only HMAC and is
// not the same thing as proof.
//
// And under any reading it does NOT mean the receipt was ever TRUE. A
// commitment over a false claim reproduces perfectly. Whether the payment
// happened is the on-chain tx hash; whether BFT really passed is the panel's
// own record. Reporting integrity as "receipt valid" would be the collapse
// this codebase keeps writing checks to prevent.
//
// Exit codes carry the verdict, per the repo convention:
//   0 VERIFIED   2 NOT_CHECKED   1 FAILED

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const PAYMENT_COMMITMENT_DOMAIN = 'payment_receipt_commitment/v1';

// Duplicated from lib/trustshell/receipt-audit.ts ON PURPOSE. A third party
// running this has our repo but not our build; more importantly, an independent
// verifier that imports the mint's own code proves only that the code agrees
// with itself. The suite `check-receipt-audit.mjs` pins the two together — if
// they ever diverge, the round-trip test there goes red.
function commitmentPreimage(i) {
  return [
    JSON.stringify(PAYMENT_COMMITMENT_DOMAIN),
    JSON.stringify(i.receiptId),
    JSON.stringify(i.agentName),
    JSON.stringify(i.repidScore),
    JSON.stringify(i.amountUSDC),
    JSON.stringify(i.recipientAddress),
    JSON.stringify(i.bftPassed),
    JSON.stringify(i.consensusWeight),
    JSON.stringify(i.solanaTxHash),
    JSON.stringify(i.ruleHash),
  ].join(':');
}

// `numeric` comes back from PostgREST as a STRING. Hashing "50" where the mint
// hashed 50 reports tampering on an untouched row — an accusation, not a miss.
const num = (v) => (v === null || v === undefined ? 0 : Number(v));

function inputFromRow(row) {
  return {
    receiptId: row.receipt_id,
    agentName: row.agent_name,
    repidScore: num(row.agent_repid_score),
    amountUSDC: num(row.payment_amount_usdc),
    recipientAddress: row.recipient_address ?? '',
    // Three states. null is "the panel did not evaluate", NOT false.
    bftPassed: row.bft_passed === undefined ? null : row.bft_passed,
    consensusWeight:
      row.bft_consensus_weight === null || row.bft_consensus_weight === undefined
        ? null
        : num(row.bft_consensus_weight),
    solanaTxHash: row.solana_tx_hash ?? null,
    ruleHash: row.rule_hash ?? '',
  };
}

function done(outcome, lines) {
  console.log(`\n${outcome}`);
  for (const l of lines) console.log(`  ${l}`);
  console.log('');
  process.exit(outcome === 'VERIFIED' ? 0 : outcome === 'NOT_CHECKED' ? 2 : 1);
}

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1] ?? null;
};

async function loadRow() {
  if (argv.includes('--stdin')) {
    return JSON.parse(readFileSync(0, 'utf8'));
  }
  const file = arg('--file');
  if (file) return JSON.parse(readFileSync(file, 'utf8'));

  const id = arg('--id');
  if (!id) {
    console.error(
      'usage: verify-receipt.mjs (--file <path> | --stdin | --id <receipt_id>)\n\n' +
      '--file and --stdin are the third-party path and need no credentials.\n' +
      '--id is a convenience for whoever can already read the table.'
    );
    process.exit(2);
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    done('NOT_CHECKED', [
      '--id needs SUPABASE_URL and a secret key to read the row.',
      'That is a convenience path only. The verification itself needs no secret —',
      'obtain the receipt row by any means and pass it with --file or --stdin.',
    ]);
  }
  const res = await fetch(
    `${url}/rest/v1/kya_compliance_receipts?receipt_id=eq.${encodeURIComponent(id)}&select=*`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  if (!res.ok) done('NOT_CHECKED', [`could not read the row: HTTP ${res.status}`]);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) done('NOT_CHECKED', [`no receipt with id ${id}`]);
  return rows[0];
}

const row = await loadRow();

// The claim this script makes about itself, asserted rather than stated. If a
// secret were ever needed here, the third-party path would be gone and this
// file would be lying in its own header.
if (process.env.TRUSTRAILS_HMAC_SECRET) {
  console.log('note: TRUSTRAILS_HMAC_SECRET is set in this environment and is NOT read.');
}

const stored = row.commitment_hash ?? null;

if (stored === null) {
  done('NOT_CHECKED', [
    `receipt ${row.receipt_id}: commitment_hash is absent.`,
    'This receipt predates payment_receipt_commitment/v1, so no keyless commitment',
    'was ever written. That is an absence, NOT evidence of tampering — the row can',
    'still be checked by the issuer via audit_hash, and only by the issuer.',
  ]);
}

// ── WHAT THE COMMITMENT DOES NOT COVER ──────────────────────────────────────
//
// Raised 2026-08-29 by `trinity-apm` as "unbound fields", and it is right: the
// commitment binds NINE fields, and this table has forty-three columns. Every
// column outside the nine can be edited freely and this script still prints
// VERIFIED, because they were never hashed.
//
// That set is named here rather than left implicit — "the core's field set is
// unstated" was the other half of the same finding. A verifier that prints a
// green line without saying what it did not check invites the reader to assume
// the whole row is bound.
//
// Several of these matter a great deal: `on_chain_verified` and
// `tx_verification_status` are the fields that say whether the money moved.
const COVERED = [
  'receipt_id', 'agent_name', 'agent_repid_score', 'payment_amount_usdc',
  'recipient_address', 'bft_passed', 'bft_consensus_weight', 'solana_tx_hash',
  'rule_hash',
];

function uncoveredFields(r) {
  const skip = new Set([...COVERED, 'commitment_hash', 'audit_hash', 'signer_did', 'signature', 'id']);
  return Object.keys(r).filter((k) => !skip.has(k) && r[k] !== null && r[k] !== undefined);
}

const preimage = commitmentPreimage(inputFromRow(row));
const computed = createHash('sha256').update(preimage).digest('hex');

if (computed === stored) {
  done('VERIFIED', [
    `receipt ${row.receipt_id}: the row still hashes to its stored commitment.`,
    `commitment ${computed}`,
    'Computed with no secret. The covered fields still agree with the stored',
    'commitment. NOTE both live in the same row and nothing anchors the commitment',
    'externally, so this does NOT bind whoever holds write access to that row —',
    'they would rewrite both. Compare against your own copy to close that gap.',
    'It does not prove the payment happened either — that is the on-chain tx hash.',
    row.solana_tx_hash || row.base_sepolia_tx_hash
      ? `tx on record: ${row.base_sepolia_tx_hash || row.solana_tx_hash}`
      : 'no transaction hash on this receipt — nothing was broadcast.',
    '',
    `NOT covered by this commitment (${uncoveredFields(row).length} populated field(s)):`,
    `  ${uncoveredFields(row).join(', ') || '(none populated on this row)'}`,
    'Those can be changed without breaking the commitment. They were never hashed.',
  ]);
}

done('FAILED', [
  `receipt ${row.receipt_id}: the row does NOT hash to its stored commitment.`,
  `stored   ${stored}`,
  `computed ${computed}`,
  'One of the nine covered fields changed after the receipt was minted, or the row',
  'was written by a different encoding version. Check the domain tag before',
  'concluding tampering.',
]);
