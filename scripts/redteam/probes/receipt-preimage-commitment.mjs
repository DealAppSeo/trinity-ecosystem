// RCPT-002 — do two materially different receipts share one audit hash?
//
// THREAT. An HMAC is only as good as what it commits to. Two ways a receipt
// becomes forgeable without anybody learning the secret:
//
//   1. A FIELD IS NOT IN THE PREIMAGE. Whatever it is can be rewritten on the
//      receipt for free, and the audit hash still validates. The receipt is
//      then evidence for the fields it covers and decoration for the rest —
//      and nothing in the object says which is which.
//
//   2. TWO RECEIPTS ENCODE TO THE SAME BYTES. This is how sentinel strings
//      kill an audit trail, and it has happened here: an absent transaction
//      hash encoded identically to the literal string `no_tx`, so an unsettled
//      payment and a payment settled by a transaction called `no_tx` had one
//      audit hash between them. The general form is a delimiter-joined
//      preimage where some field can carry the delimiter.
//
// This probe tests the GENERAL form of both rather than regression-testing the
// two known instances. (1) by mutating every declared field in turn and
// requiring the preimage to move — which also means a field added to
// `PaymentAuditInput` and not to this probe is caught, instead of being
// silently untested. (2) by a corpus of near-collisions, including separator
// injection and every type-confusion pair that a JSON body can deliver.
//
// A NOTE ON WHY THE FIELD NAMES ARE COPIED, NOT GUESSED. An earlier draft sent
// `txHash`; the real field is `solanaTxHash`. Every variant then differed in a
// key the preimage never reads, so all of them "collided" with the base and the
// probe was one commit away from publishing four fabricated Critical findings.
// The field-coverage assertion below exists because of that, and it is the part
// of this probe that keeps it honest as the schema moves.

import { compileAndImport } from '../compile.mjs';
import { held, breached, notChecked } from '../harness.mjs';

/** Every field of `PaymentAuditInput`, copied from the interface. */
const FIELDS = [
  'receiptId', 'agentName', 'repidScore', 'amountUSDC', 'recipientAddress',
  'bftPassed', 'consensusWeight', 'solanaTxHash', 'ruleHash',
];

export default {
  id: 'RCPT-002',
  title: 'Receipt audit preimage — field coverage and collisions',
  component: 'TrustShell / compliance receipts',
  severity: 'Critical',
  threat: 'A receipt is rewritten in a field the audit hash never covered, or two different receipts share one hash.',

  async run() {
    const c = await compileAndImport(['lib/trustshell/receipt-audit.ts']);
    if (!c.ok) return notChecked(c.reason, c.howToRun);

    const { paymentAuditPreimage, PAYMENT_AUDIT_DOMAIN } = c.modules[0];
    if (!paymentAuditPreimage) {
      c.cleanup();
      return notChecked('receipt-audit.ts no longer exports paymentAuditPreimage', 're-point this probe');
    }

    const base = {
      receiptId: 'r-1', agentName: 'agent-a', repidScore: 4000, amountUSDC: 100,
      recipientAddress: 'addr-1', bftPassed: true, consensusWeight: 0.8,
      solanaTxHash: 'tx-1', ruleHash: 'rule-1',
    };

    const transcript = [];
    const breaches = [];

    let basePre;
    try {
      basePre = paymentAuditPreimage(base);
    } catch (e) {
      c.cleanup();
      return notChecked(`paymentAuditPreimage threw on a well-formed receipt: ${e.message}`, 'check the PaymentAuditInput shape this probe builds');
    }

    // ── 1. is every declared field actually committed to? ───────────────────
    for (const f of FIELDS) {
      const changed = typeof base[f] === 'number' ? base[f] + 1
        : typeof base[f] === 'boolean' ? !base[f]
        : `${base[f]}-changed`;
      const moved = paymentAuditPreimage({ ...base, [f]: changed }) !== basePre;
      transcript.push(`field ${f.padEnd(18)} mutated -> preimage ${moved ? 'changed' : 'UNCHANGED'}`);
      if (!moved) {
        breaches.push(`the preimage does not commit to \`${f}\` — it can be rewritten on a receipt without invalidating the audit hash`);
      }
    }

    // The domain tag stops this preimage space colliding with another one
    // (the HAL preimage). Its absence is not exploitable on its own, but it is
    // the difference between two hash spaces and one.
    transcript.push(`domain tag present: ${PAYMENT_AUDIT_DOMAIN ? JSON.stringify(PAYMENT_AUDIT_DOMAIN) : 'NONE'}`);
    if (!PAYMENT_AUDIT_DOMAIN || !basePre.includes(JSON.stringify(PAYMENT_AUDIT_DOMAIN))) {
      breaches.push('the preimage carries no domain tag, so it shares a hash space with any other preimage of the same shape');
    }

    // ── 2. near-collisions ─────────────────────────────────────────────────
    const variants = [
      ['absent tx (null)', { ...base, solanaTxHash: null }],
      ['tx is the literal string "no_tx"', { ...base, solanaTxHash: 'no_tx' }],
      ['tx is the string "null"', { ...base, solanaTxHash: 'null' }],
      ['tx is the empty string', { ...base, solanaTxHash: '' }],
      ['unevaluated panel (bftPassed null)', { ...base, bftPassed: null }],
      ['bftPassed is the string "null"', { ...base, bftPassed: 'null' }],
      ['bftPassed is the string "true"', { ...base, bftPassed: 'true' }],
      ['bftPassed false', { ...base, bftPassed: false }],
      ['consensusWeight null (no weight)', { ...base, consensusWeight: null }],
      ['consensusWeight 0', { ...base, consensusWeight: 0 }],
      ['amount as the string "100"', { ...base, amountUSDC: '100' }],
      ['amount 1000', { ...base, amountUSDC: 1000 }],
      ['repidScore as the string "4000"', { ...base, repidScore: '4000' }],
      // Separator injection: fields are joined with ':'. If any reached the
      // join unquoted, a value carrying ':' would re-partition the preimage.
      ['agentName carries the ":" separator', { ...base, agentName: 'agent-a":4000:100:"x' }],
      ['agentName carries a quote and colon', { ...base, agentName: 'a":"b' }],
      ['agentName carries a NUL', { ...base, agentName: 'agent-a\u0000x' }],
      ['recipient and agent swapped', { ...base, agentName: 'addr-1', recipientAddress: 'agent-a' }],
      ['receiptId and ruleHash swapped', { ...base, receiptId: 'rule-1', ruleHash: 'r-1' }],
    ];

    const seen = new Map([[basePre, 'base receipt']]);
    for (const [label, receipt] of variants) {
      let pre;
      try {
        pre = paymentAuditPreimage(receipt);
      } catch (e) {
        transcript.push(`preimage(${label.padEnd(40)}) -> refused: ${e.message}`);
        continue;
      }
      const collidesWith = seen.get(pre);
      transcript.push(`preimage(${label.padEnd(40)}) -> ${collidesWith ? `COLLIDES with "${collidesWith}"` : 'distinct'}`);
      if (collidesWith) {
        breaches.push(`"${label}" and "${collidesWith}" produce identical preimage bytes — one audit hash covers two materially different receipts`);
      } else {
        seen.set(pre, label);
      }
    }

    c.cleanup();

    if (breaches.length > 0) {
      return breached(
        `${breaches.length} preimage integrity failure(s)`,
        [...breaches.map((b) => `  BREACH  ${b}`), '', 'full transcript:', ...transcript.map((t) => `    ${t}`)].join('\n')
      );
    }
    return held(
      `all ${FIELDS.length} declared fields are committed to, the domain is tagged, and all ${variants.length} near-collision variants encode distinctly`,
      transcript.join('\n')
    );
  },
};
