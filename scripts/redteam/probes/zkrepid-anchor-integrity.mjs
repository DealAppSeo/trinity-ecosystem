// ANCHOR-001 — an "EAS-attested" zk proof must resolve to a real anchored batch that covers it.
//
// THREAT. zkRepID's headline is "22,360 real proofs, 100% EAS-attested." That
// number is what makes a RepID tier CHECKABLE on-chain instead of trusted. But
// "attested" is recorded as a single column — `repid_zkp_proofs.eas_attestation_uid`
// is non-null — and a non-null string is not an on-chain guarantee. The real
// anchor lives one table over: `eas_anchor_batches` holds, per attestation UID,
// the `merkle_root`, the `tx_hash` (the base-sepolia anchoring transaction), the
// `status`, and the `[proof_id_min, proof_id_max]` range of proofs it commits to.
// A proof whose UID does NOT resolve to an anchored batch is "attested" in name
// only — its on-chain claim points at nothing. That is this repo's signature
// defect (a system reporting success it has not earned) wearing an on-chain
// costume, and it is precisely what "100% attested" hides if the column is trusted.
//
// COMPLEMENTS XVAL-001, does not overlap it. XVAL-001 guards the SCHEME-level
// discriminator: a `sha256-stub` is never is_real or attested, and a real attested
// scheme exists so a verdict can require is_real=true. It reads the aggregate
// integrity view. This guards the ROW-level BINDING underneath that %: every
// attested proof's UID must resolve to a batch that is actually anchored
// (merkle_root + tx_hash + status='anchored') and whose id-range covers the proof.
// A scheme can be "100% attested" by the view while individual rows carry a UID
// that anchors nothing — the gap this closes.
//
// WHAT THIS JUDGES (from scripts/redteam/evidence/zkrepid-anchor-integrity.json):
//
//   HELD        every attested real proof resolves to a fully-anchored batch
//               (merkle_root + tx_hash + status='anchored') whose id-range covers
//               it — the on-chain attestation claim is backed for every row.
//   BREACHED    ≥1 attested proof carries a UID with no batch, or resolves to a
//               batch missing its merkle_root or tx_hash, or a non-anchored batch,
//               or falls outside its batch's id-range — an on-chain claim that
//               points at nothing, or at a batch that does not commit to it.
//   NOT_CHECKED the evidence is missing or stale (the anchor state changes as new
//               batches are written, so a stale snapshot can neither hold nor breach).
//
// DEEPER, OFF-CHAIN CHECKS (recipe): the in-DB id-range test proves the batch
// CLAIMS to cover the proof; confirming the proof's poseidon2_leaf is a member of
// the batch's merkle_root, and that tx_hash resolves on base-sepolia to an EAS
// attestation of that root, are the cryptographic/on-chain steps a collector with
// chain reach performs. Named, not asserted — chain RPC is proxy-denied here.
//
// Read-only: judges recorded aggregate counts. No proof bytes, no UIDs, no agent ids.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { held, breached, notChecked } from '../harness.mjs';

const EVIDENCE_DIR = 'scripts/redteam/evidence';
const EVIDENCE_FILE = 'zkrepid-anchor-integrity.json';
const MAX_AGE_DAYS = 30; // anchoring state changes only as batches are written; a month-old snapshot is still indicative but not fresh

export default {
  id: 'ANCHOR-001',
  title: 'An EAS-attested zk proof must resolve to a real anchored batch that covers it',
  component: 'zkRepID / on-chain proof anchoring',
  severity: 'Medium',
  threat:
    'If a proof counted as EAS-attested carries an attestation UID that resolves to no anchored batch (no merkle_root, no tx_hash), its on-chain claim points at nothing — "100% attested" overstates the guarantee and a RepID tier reads as chain-proven when it is not.',

  async run() {
    const path = join(EVIDENCE_DIR, EVIDENCE_FILE);
    if (!existsSync(path)) return notChecked(`no evidence at ${path}`, howToCollect());

    let ev;
    try {
      ev = JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
      return notChecked(`${EVIDENCE_FILE} is not valid JSON: ${e.message}`, howToCollect());
    }

    const collectedAt = Date.parse(ev.collectedAt ?? '');
    if (!Number.isFinite(collectedAt)) return notChecked(`${EVIDENCE_FILE} has no parseable collectedAt`, howToCollect());
    const ageDays = (Date.now() - collectedAt) / 86_400_000;
    if (ageDays > MAX_AGE_DAYS) return notChecked(`evidence is ${Math.round(ageDays)}d old (> ${MAX_AGE_DAYS}d)`, howToCollect());

    const agg = ev.observations?.aggregate;
    if (!agg || typeof agg.attested_real_proofs !== 'number') {
      return notChecked(`${EVIDENCE_FILE} has no observations.aggregate.attested_real_proofs to judge`, howToCollect());
    }

    // Each of these five is a distinct way the on-chain attestation claim is hollow.
    // The invariant holds only when all are zero.
    const failures = [
      ['carry an attestation UID with NO anchored batch', agg.proofs_no_batch],
      ['resolve to a batch missing its merkle_root', agg.batch_missing_root],
      ['resolve to a batch missing its tx_hash (no on-chain anchor)', agg.batch_missing_txhash],
      ['resolve to a batch that is not anchored (status != anchored)', agg.batch_not_anchored],
      ['fall outside their batch\'s committed id-range', agg.proof_outside_batch_range],
    ].filter(([, n]) => Number(n) > 0);

    const total = agg.attested_real_proofs;

    if (failures.length > 0) {
      const bad = failures.reduce((n, [, c]) => n + Number(c), 0);
      const detail = failures.map(([label, c]) => `  BREACH  ${c} attested proof(s) ${label}`);
      // Context on the most likely benign-looking case, so a reader does not mistake
      // "bounded and historical" for "fine" — hollow is hollow.
      const window =
        agg.no_batch_oldest && agg.no_batch_newest
          ? ` The un-anchored UID population spans ${String(agg.no_batch_oldest).slice(0, 10)}..${String(agg.no_batch_newest).slice(0, 10)}` +
            `${agg.no_batch_created_last_24h === 0 ? ' with none in the last 24h (bounded/historical, not recurring)' : ` including ${agg.no_batch_created_last_24h} in the last 24h (RECURRING)`}.`
          : '';
      return breached(
        `on-chain attestation is hollow for ${bad} of ${total} attested proof(s): the UID resolves to no anchored batch that covers them`,
        [
          ...detail,
          '',
          `${total - bad}/${total} attested proofs DO resolve to a fully-anchored batch (${agg.batches_fully_anchored ?? '?'}/${agg.total_batches ?? '?'} batches anchored) — the binding is sound for those.${window}`,
          "'100% EAS-attested' should read as \"100% carry a UID\", which is not the same as \"100% anchored on-chain\". This probe is the difference.",
        ].join('\n')
      );
    }

    return held(
      `every one of ${total} attested real proof(s) resolves to a fully-anchored batch (merkle_root + tx_hash + status='anchored') whose id-range covers it`,
      `${agg.batches_fully_anchored ?? '?'}/${agg.total_batches ?? '?'} batches fully anchored. Deeper off-chain check (recipe): confirm each proof's poseidon2_leaf is a member of its batch merkle_root, and that tx_hash resolves on base-sepolia.`
    );
  },
};

function howToCollect() {
  return (
    'From a host with Supabase access (the MCP tools reach the DB; curl is proxy-denied), refresh ' +
    `${EVIDENCE_DIR}/${EVIDENCE_FILE} by LEFT JOINing repid_zkp_proofs (is_real=true, eas_attestation_uid not null) ` +
    'to eas_anchor_batches ON eas_attestation_uid = eas_uid, and counting: proofs with no matching batch; ' +
    'proofs whose batch has a null/empty merkle_root or tx_hash; proofs whose batch status <> \'anchored\'; ' +
    'and proofs whose id is outside [proof_id_min, proof_id_max]. Store the counts (not the UIDs or proof bytes). ' +
    'DEEPER off-chain check with chain reach: resolve each batch tx_hash on base-sepolia and verify the EAS ' +
    'attestation commits to the batch merkle_root, and that each proof poseidon2_leaf is a member of that root.'
  );
}
