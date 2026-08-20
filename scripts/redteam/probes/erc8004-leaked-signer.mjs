// ERC8004-001 — is a known-leaked signer key LIVE on the chain the identities use?
//
// THREAT. The ERC-8004 identity + reputation layer anchors RepID on-chain. Its
// integrity rests on WHO can sign against the registries. Two deployer/attestor
// keys are in this repo's git history: `0xf6eE1768…` (committed 2026-05-11 in
// repid-attestation.ts, fallback removed 2026-07-31) and `0xdf6b8215…`
// (CLAUDE.md's DEPLOYER_KEY). A leaked key that is DEAD on the operative chain is
// an inert incident; a leaked key that is ACTIVE and FUNDED there — and that
// minted the identities — is a live identity-control exposure.
//
// CLAUDE.md judged the exposure inert on the strength of MAINNET state ("balance
// 0, nonce 0"). This probe judges the OPERATIVE chain (Base Sepolia 84532), where
// the identities and reputation actually live, from recorded on-chain reads.
//
//   BREACHED  a known-leaked address is active (nonce > 0) on the operative chain
//   HELD      every known-leaked address is inert there (nonce 0, unfunded)
//
// ANCHOR: the current reputation writer must NOT be a leaked address. If the
// evidence shows the live writer IS one of the leaked keys, the rotation did not
// happen and this is worse than the base finding — the anchor catches an evidence
// set that has the rotation story backwards.
//
// Read-only: this judges recorded eth_getTransactionCount / balances. No key is
// stored — addresses are public identifiers.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { held, breached, notChecked } from '../harness.mjs';

const EVIDENCE_DIR = 'scripts/redteam/evidence';
const MAX_AGE_DAYS = 90; // on-chain key state changes slowly; rotation is the event

export default {
  id: 'ERC8004-001',
  title: 'Leaked deployer/attestor keys are live and funded on the ERC-8004 operative chain',
  component: 'ERC-8004 / on-chain identity + reputation',
  severity: 'Medium',
  threat: 'A key in git history is active on Base Sepolia and minted the agent identities — anyone with repo history holds identity-anchor authority.',

  async run() {
    if (!existsSync(EVIDENCE_DIR)) return notChecked(`no evidence directory at ${EVIDENCE_DIR}`, howToCollect());
    const files = readdirSync(EVIDENCE_DIR).filter((f) => f.startsWith('erc8004-onchain') && f.endsWith('.json'));
    if (files.length === 0) return notChecked(`no erc8004-onchain evidence in ${EVIDENCE_DIR}`, howToCollect());

    const transcript = [];
    const breaches = [];
    let judged = 0;

    for (const file of files) {
      let ev;
      try { ev = JSON.parse(readFileSync(join(EVIDENCE_DIR, file), 'utf8')); }
      catch (e) { return notChecked(`${file} is not valid JSON: ${e.message}`, howToCollect()); }

      for (const need of ['collectedAt', 'collectedBy', 'collectedVia', 'leaked_keys_live_state_base_sepolia', 'on_chain_writers_observed']) {
        if (ev[need] === undefined) return notChecked(`${file} missing \`${need}\``, howToCollect());
      }
      const ageDays = (Date.now() - Date.parse(ev.collectedAt)) / 86_400_000;
      if (!Number.isFinite(ageDays)) return notChecked(`${file}: unparseable collectedAt`, howToCollect());
      if (ageDays > MAX_AGE_DAYS) return notChecked(`${file}: collected ${ageDays.toFixed(0)}d ago (limit ${MAX_AGE_DAYS}) — re-read the chain`, howToCollect());

      const leaked = ev.leaked_keys_live_state_base_sepolia;
      const leakedAddrs = Object.keys(leaked).map((a) => a.toLowerCase());

      // ANCHOR: the live reputation writer must not be a leaked key.
      const repWriter = String(ev.on_chain_writers_observed?.reputation_write?.from ?? '').toLowerCase();
      if (repWriter && leakedAddrs.includes(repWriter)) {
        return breached(
          `the LIVE reputation writer ${repWriter} is a known-leaked key — the reputation-write authority was NOT rotated`,
          `evidence: on_chain_writers_observed.reputation_write.from is in the leaked set`
        );
      }
      if (repWriter) transcript.push(`anchor: live reputation writer ${repWriter} is NOT a leaked key (rotation held) — OK`);

      judged += 1;
      for (const [addr, st] of Object.entries(leaked)) {
        const nonce = Number(st.nonce);
        const funded = Number(st.balance_eth) > 0;
        transcript.push(`${addr}: nonce=${nonce} balance=${st.balance_eth}ETH role=${st.role ?? '?'}`);
        if (Number.isFinite(nonce) && nonce > 0) {
          breaches.push(
            `${addr} is ACTIVE on the operative chain (nonce ${nonce}${funded ? `, funded ${st.balance_eth} ETH` : ''}) — ` +
            `${st.role ?? 'a leaked key'}. Leak: ${st.leak ?? 'in git history'}. Rotation is BLOCKED_FOR_SEAN.`
          );
        }
      }
    }

    if (judged === 0) return notChecked('no judgeable erc8004 evidence', howToCollect());
    if (breaches.length > 0) {
      return breached(
        `${breaches.length} leaked key(s) active on the ERC-8004 operative chain`,
        [...breaches.map((b) => `  BREACH  ${b}`), '', 'transcript:', ...transcript.map((t) => `    ${t}`),
         '', 'NOTE: value at risk is testnet ETH; the reputation writer is rotated. Escalates to High/Critical on mainnet.'].join('\n')
      );
    }
    return held('every known-leaked key is inert on the operative chain', transcript.join('\n'));
  },
};

function howToCollect() {
  return (
    'Read Base Sepolia (https://sepolia.base.org) via JSON-RPC: eth_getTransactionCount + eth_getBalance for each known-leaked ' +
    'address, and eth_getTransactionByHash on a real reputation-write and mint tx to recover the current writers. Record ' +
    `addresses + nonces + balances (NOT private keys) to ${EVIDENCE_DIR}/erc8004-onchain.json. pg_net reaches the RPC.`
  );
}
