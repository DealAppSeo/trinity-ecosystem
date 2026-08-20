// PAY-001 — is the dual-signature gate a signature check, or a string check?
//
// THREAT. The payment route promises that a transfer above 50,000 USDC needs
// two co-signatures from distinct institutional roles ("CFO and CTO"). That is
// the strongest control on the highest-value path in the product, it is what
// `app/api/trustrails/demo/route.ts` describes to a prospect in those words,
// and the whole claim rests on the word "signature" meaning something.
//
// The attack is the cheapest one there is: send the shape without the substance.
//
//   { "agentName": "...", "amountUSDC": 75000, "recipientAddress": "...",
//     "signatures": [ { "role": "CFO" }, { "role": "CTO" } ] }
//
// No key. No payload. No signature bytes at all. If the gate is counting
// distinct strings, that request satisfies a control described to institutions
// as dual authorization.
//
// WHY THIS PROBE IS SOURCE-DERIVED AND WHAT THAT COSTS.
//
// The honest route would be to POST the payload at a running server and read
// the status code. That is NOT available from an agent session — both custom
// domains are proxy-denied (CLAUDE.md § Network) and a local `next dev` needs
// credentials this session does not hold. So this probe proves the weaker but
// still decisive statement: **no signature verification primitive is reachable
// from this route at all.** The repo HAS such primitives — `verifyControlProof`,
// `verifySignature`, `verifyWorkContract`, all Ed25519 over canonical bytes —
// and the finding is that none of them is on this path.
//
// That distinction matters for the report. This probe can establish "the code
// contains no verification"; it does NOT establish an observed 200 from a live
// host. The live confirmation is named in `howToRun` so the gap is visible
// rather than papered over.

import { readFileSync } from 'node:fs';
import { held, breached, notChecked } from '../harness.mjs';

const ROUTE = 'app/api/trustrails/pay/route.ts';

/**
 * Every verification primitive this repo actually ships. If the payment route
 * were checking signatures, one of these — or a Web Crypto `verify` — would
 * have to appear on the path.
 *
 * Kept as a list rather than a regex so a NEW primitive that lands later is an
 * obvious edit, not a silent miss.
 */
const VERIFIERS = [
  'verifyControlProof', 'verifyDelegationChain', 'verifyWorkContract',
  'verifySignature', 'verifyVerdict', 'verifyHarness', 'countersignContract',
  'subtle.verify', 'crypto.verify', 'ed25519', 'nacl',
];

export default {
  id: 'PAY-001',
  title: 'Dual-signature gate accepts unauthenticated role strings',
  component: 'TrustShell / payment path (x402-adjacent)',
  severity: 'High',
  threat: 'A caller who can reach the pay endpoint mints its own institutional approval by naming two roles.',

  async run() {
    let src;
    try {
      src = readFileSync(ROUTE, 'utf8');
    } catch {
      return notChecked(`${ROUTE} not readable`, `run from the repo root; expected ${ROUTE}`);
    }

    // Locate the gate rather than scanning the whole file, so a verifier used
    // somewhere unrelated cannot make this probe report HELD by accident.
    const gate = src.match(/dual_signature_gate[\s\S]{0,1200}/);
    if (!gate) {
      return notChecked(
        'no `dual_signature_gate` stage found in the route — it may have been renamed or removed',
        `re-read ${ROUTE} and re-point this probe at the current gate identifier`
      );
    }

    // Search the GATE WINDOW, not the whole file: a verifier referenced in some
    // unrelated stage of the route must not let this probe report HELD while the
    // dual_signature_gate stage itself verifies nothing. `gate[0]` is the matched
    // stage text; this makes the search match the intent the comment above states.
    const found = VERIFIERS.filter((v) => gate[0].includes(v));
    if (found.length > 0) {
      return held(
        `the route references ${found.join(', ')} — the gate has cryptographic material to check`,
        `${ROUTE}: ${found.join(', ')}`
      );
    }

    // What IS read off each element? If it is only `.role`, the "signature" is
    // a label. Capture the exact lines so the finding carries its own proof.
    const usages = [...src.matchAll(/^.*\bsignatures\b.*$/gm)].map((m) => m[0].trim());
    const fields = new Set([...src.matchAll(/\bs\.(\w+)/g)].map((m) => m[1]));

    return breached(
      'no signature verification primitive appears anywhere in the payment route; ' +
      `the gate reads only ${[...fields].map((f) => `\`.${f}\``).join(', ') || '`.role`'} ` +
      'off caller-supplied objects and counts distinct values',
      [
        `${ROUTE} — every line mentioning \`signatures\`:`,
        ...usages.map((u) => `    ${u}`),
        '',
        'searched for and did NOT find any of:',
        `    ${VERIFIERS.join(', ')}`,
        '',
        'payload that satisfies the gate with zero cryptographic material:',
        '    {"agentName":"<registered>","amountUSDC":75000,"recipientAddress":"<addr>",',
        '     "purpose":"x","signatures":[{"role":"CFO"},{"role":"CTO"}]}',
      ].join('\n')
    );
  },

  // Stated on the probe itself so the report cannot overclaim: this is a
  // reachability finding over source, not an observed live bypass.
  liveConfirmation:
    'POST the payload above at https://app.aitrinitysymphony.com/api/trustrails/pay ' +
    'with a registered agentName and read the status. 403 at stage dual_signature_gate ' +
    'would refute this probe; anything past that stage confirms it. Not runnable from ' +
    'an agent session — the host is proxy-denied (CLAUDE.md § Network).',
};
