// RCPT-001 — which secrets does the receipt-minting path accept?
//
// THREAT. A compliance receipt's `audit_hash` is an HMAC, and its entire value
// is that a third party cannot produce one. That value evaporated once here
// already: `TRUSTRAILS_HMAC_SECRET` fell back to a literal printed in the
// source, so every receipt ever minted was forgeable by anyone with read access
// to the repository. `requireAuditSecret` now throws rather than falling back.
//
// The guard is the control. So the question a red team asks is not "is there a
// guard" but "what gets past it" — and the specific worry the guard's own
// author wrote down is the one to test hardest:
//
//     "the most likely way this weakness comes back is somebody 'fixing' the
//      missing variable by pasting the constant the old fallback used."
//
// An operator doing exactly that does not paste it once. They paste it from a
// comment, from a shell history, from a dashboard field that upper-cases, from
// a copy that picked up whitespace. Every one of those is the SAME publicly
// known value, and a guard built on a single exact-string comparison catches
// only the spelling it was written against.
//
// SEVERITY IS LOW ON PURPOSE, and the reasoning belongs in the finding rather
// than in a reviewer's head: no live surface currently holds a variant (see
// LIVE-001), and a bypass here does not by itself forge anything — it produces
// receipts under a key an attacker must still know to exploit. It is Low
// because it is a defence-in-depth gap in a control that is otherwise doing its
// job, not because a forged compliance receipt would be a small problem.

import { compileAndImport } from '../compile.mjs';
import { held, breached, notChecked } from '../harness.mjs';

export default {
  id: 'RCPT-001',
  title: 'Receipt secret guard is an exact-string match against a published constant',
  component: 'TrustShell / compliance receipts',
  severity: 'Low',
  threat: 'An operator sets a case- or whitespace-variant of the abandoned default and the guard waves it through.',

  async run() {
    const c = await compileAndImport(['lib/trustshell/receipt-audit.ts']);
    if (!c.ok) return notChecked(c.reason, c.howToRun);

    const { requireAuditSecret, ABANDONED_DEFAULT_SECRET, MIN_AUDIT_SECRET_LENGTH } = c.modules[0];
    if (!requireAuditSecret || !ABANDONED_DEFAULT_SECRET) {
      c.cleanup();
      return notChecked('receipt-audit.ts no longer exports requireAuditSecret / ABANDONED_DEFAULT_SECRET', 're-point this probe');
    }

    const D = String(ABANDONED_DEFAULT_SECRET);
    const cases = [
      { value: undefined, label: 'unset', safe: false },
      { value: '', label: 'empty string', safe: false },
      { value: '   ', label: 'whitespace only', safe: false },
      { value: 'x'.repeat(Math.max(1, MIN_AUDIT_SECRET_LENGTH - 1)), label: 'one char under the length floor', safe: false },
      { value: D, label: 'the abandoned default, exactly', safe: false },
      { value: ` ${D} `, label: 'the abandoned default, space-padded', safe: false },
      { value: `\t${D}\n`, label: 'the abandoned default, tab/newline-padded', safe: false },
      { value: D.toUpperCase(), label: 'the abandoned default, UPPER-CASED', safe: false },
      { value: D.replace(/^t/, 'T'), label: 'the abandoned default, first letter capitalised', safe: false },
      // The anchor. Without one, a guard hard-wired to throw would score a
      // perfect result while making the product unable to mint anything.
      { value: 'k7Qw2ZpL9mXvT4aB6nR1sYcE', label: 'a real 24-char secret (ANCHOR: must be accepted)', safe: true },
    ];

    const transcript = [];
    const breaches = [];

    for (const { value, label, safe } of cases) {
      let accepted = true;
      let err = '';
      try { requireAuditSecret({ TRUSTRAILS_HMAC_SECRET: value }); } catch (e) { accepted = false; err = e.message; }
      transcript.push(`requireAuditSecret(${label.padEnd(48)}) -> ${accepted ? 'ACCEPTED' : 'refused'}`);
      if (safe && !accepted) {
        breaches.push(`ANCHOR BROKEN: a legitimate secret was refused (${err.split('.')[0]}) — the probe's baseline is wrong`);
      } else if (!safe && accepted) {
        breaches.push(
          `${label} was ACCEPTED. It is the same published constant, and the guard's own comment names ` +
          'this paste as the way the weakness returns.'
        );
      }
    }

    c.cleanup();

    if (breaches.length > 0) {
      return breached(
        `${breaches.length} of ${cases.length} secret variants got past the guard`,
        [...breaches.map((b) => `  BREACH  ${b}`), '', 'full transcript:', ...transcript.map((t) => `    ${t}`)].join('\n')
      );
    }
    return held(
      `all ${cases.length - 1} weak variants refused, a real secret accepted`,
      transcript.join('\n')
    );
  },
};
