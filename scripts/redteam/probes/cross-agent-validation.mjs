// XVAL-001 — a cross-agent validation verdict may only be backed by a REAL, attested zk proof.
//
// THREAT. The ecosystem's checks-and-balances rests on agents validating each
// other's work (lanes: CC/XC/GA author, a non-author VERIFY lane grades; T12 is
// the runtime fleet). zkRepID is meant to make a validation verdict CHECKABLE
// rather than trusted — a validator cites a proof of the peer's standing instead
// of a self-reported number. That only holds if "a proof" means a real one.
//
// The hazard is concrete and already in the data: of 79,179 proof rows, 56,823
// are `sha256-stub`, is_real=false, 0% on-chain-attested — leftovers from the
// pre-June migration. 22,356 are `plonky3_range_check`, is_real=true, 100%
// EAS-attested. A verdict that cited row-count, or cited a stub as if real, would
// be "backed by zk" and mean nothing — the exact defect this repo exists to
// catch, wearing a cryptographic costume.
//
// WHAT THIS JUDGES. Not the circuit maths (that lives in check:zkp / check:zk-cost).
// The INVARIANT that makes zk-backing meaningful: the integrity view must keep a
// working discriminator between real, attested proofs and stubs, so a verdict can
// require is_real=true. Judged from recorded evidence (v_repid_zkp_proof_integrity).
//
//   HELD      a real, on-chain-attested scheme exists AND is cleanly separable
//             from any stub (is_real flag present, real scheme attested, stub not) —
//             so "cite only is_real=true, attested proofs" is enforceable
//   BREACHED  a stub scheme is is_real=true or attested, OR no real attested scheme
//             exists at all — the discriminator has collapsed and a zk-backed
//             verdict cannot be trusted
//   NOT_CHECKED  the integrity evidence is missing or stale
//
// READINESS IS SEPARATE FROM THIS INVARIANT, AND STATED, NOT ASSERTED. Two
// preconditions for a LIVE zk-backed cross-validation loop are, as measured,
// FALSE today: the T12 fleet is 0/12 live, and the zk queue is frozen (40,300
// pending, 32 days). This probe does NOT hold those against the invariant — the
// discriminator can be sound while the loop is idle. It surfaces them in its
// detail so no reader mistakes "the invariant holds" for "the loop is running".
// See docs/CROSS-AGENT-VALIDATION.md; a claim that the loop is OPERATIONAL while
// the fleet is dead is the thing that would be false, and it is called out there.
//
// Read-only: judges recorded aggregate view output. No proof bytes, no agent ids.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { held, breached, notChecked } from '../harness.mjs';

const EVIDENCE_DIR = 'scripts/redteam/evidence';
const EVIDENCE_FILE = 'cross-agent-validation.json';
const MAX_AGE_DAYS = 30; // proof-scheme realness changes slowly; a stalled pipeline does not flip overnight

export default {
  id: 'XVAL-001',
  title: 'A cross-agent validation verdict may only be backed by a real, attested zk proof',
  component: 'zkRepID / cross-agent validation',
  severity: 'High',
  threat:
    'If the real/stub discriminator collapses, a validation verdict "backed by zk" can cite one of 56,823 unattested stub proofs and mean nothing — a trust claim with no cryptographic content.',

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

    const schemes = ev.observations?.zkRepID_integrity?.schemes ?? [];
    if (schemes.length === 0) return notChecked(`${EVIDENCE_FILE} has no zkRepID_integrity.schemes to judge`, howToCollect());

    const breaches = [];
    // A stub must never be marked real or carry attestation — that is the discriminator failing.
    for (const s of schemes) {
      if (s.is_real === false && (s.eas_attested_pct ?? 0) > 0) {
        breaches.push(`scheme '${s.scheme}' is is_real=false but shows ${s.eas_attested_pct}% attested — a stub is being attested`);
      }
    }
    const real = schemes.filter((s) => s.is_real === true);
    const realAttested = real.filter((s) => (s.eas_attested_pct ?? 0) >= 99);
    if (real.length === 0) {
      breaches.push('no is_real=true scheme exists — there is nothing real to back a verdict with');
    } else if (realAttested.length === 0) {
      breaches.push(`a real scheme exists but none is on-chain attested (best: ${Math.max(...real.map((s) => s.eas_attested_pct ?? 0))}%) — "attested" cannot be required`);
    }

    // Readiness context — reported, not judged against the invariant (see header).
    const fleet = ev.observations?.fleet ?? {};
    const pipe = ev.observations?.zkRepID_pipeline ?? {};
    const readiness =
      `readiness (NOT part of this verdict): fleet ${fleet.live ?? '?'}/${fleet.total ?? '?'} live; ` +
      `zk queue pending ${pipe.queue_pending ?? '?'}, frozen ${pipe.pending_frozen_days ?? '?'}d. ` +
      `A LIVE zk-backed loop needs both cleared; the discriminator invariant below holds independently.`;

    if (breaches.length > 0) {
      return breached(
        `the real/stub discriminator has collapsed: ${breaches.length} problem(s)`,
        [...breaches.map((b) => `  BREACH  ${b}`), '', readiness].join('\n')
      );
    }

    const realScheme = realAttested[0];
    return held(
      `a zk-backed verdict is enforceable: '${realScheme.scheme}' is is_real=true and ${realScheme.eas_attested_pct}% attested ` +
        `(${realScheme.proofs} proofs), cleanly separable from ${schemes.filter((s) => s.is_real === false).reduce((n, s) => n + (s.proofs ?? 0), 0)} flagged stub proofs`,
      readiness
    );
  },
};

function howToCollect() {
  return (
    'From a host with Supabase access (the MCP tools reach the DB; curl is proxy-denied), read the three aggregate ' +
    'views into ' + `${EVIDENCE_DIR}/${EVIDENCE_FILE}` + ' in the shape already there: `select * from ' +
    'v_repid_zkp_proof_integrity` (per-scheme is_real, proofs, eas_attested_pct), `select count(*) filter (where ' +
    'is_live), count(*) from v_fleet_truth` (fleet), and `select * from v_repid_zkp_pipeline_truth` (queue freshness). ' +
    'Read-only aggregates — store no proof bytes or agent ids.'
  );
}
