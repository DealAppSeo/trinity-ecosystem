#!/usr/bin/env node
// scripts/check-receipt-audit.mjs — the PAYMENT receipt's audit preimage and
// the secret its tamper-evidence rests on.
//
// Run: node scripts/check-receipt-audit.mjs
//
// `hal-receipt.ts` predicted this file. Its header says of ComplianceReceipt:
// "the payment preimage, built inline in that file, has never had a test." It
// was right, and both defects it had already fixed for the HAL preimage were
// still live in the payment one.
//
// The two that carry this suite:
//
//   * 'AN ABSENT TX HASH IS NOT THE STRING "no_tx"' — the old encoding rendered
//     a payment that was never broadcast and one whose tx hash IS "no_tx" to
//     byte-identical preimages, so two materially different receipts carried
//     one audit hash. Demonstrated against the old construction before this was
//     written, not inferred.
//   * 'A MISSING SECRET REFUSES TO MINT' — audit_hash is an HMAC described as
//     "tamper-evident proof of entire receipt", and the secret fell back to a
//     constant printed in the source. TRUSTRAILS_HMAC_SECRET was unset, so
//     every audit hash was forgeable by anyone holding the repository. Its own
//     caveat sat in SHIP-CHECKLIST.md, written down and relied on.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.receipt-audit-check-'));
let m;
try {
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/receipt-audit.ts',
      '--outDir', outDir,
      '--rootDir', 'lib',          // pinned; see work-contract-test.mjs
      '--module', 'commonjs', '--target', 'es2022',
      '--lib', 'es2022,dom', '--moduleResolution', 'node',
      '--esModuleInterop', '--strict',
    ],
    { stdio: 'pipe' }
  );
  m = await import(pathToFileURL(join(outDir, 'trustshell', 'receipt-audit.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('receipt-audit compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

const {
  paymentAuditPreimage, requireAuditSecret, isAbandonedDefaultSecret,
  ABANDONED_DEFAULT_SECRET, MIN_AUDIT_SECRET_LENGTH, PAYMENT_AUDIT_DOMAIN,
} = m;

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed += 1; } catch (e) { failures.push(`${name}\n    ${e.message}`); }
};
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const truthy = (v, what) => { if (!v) throw new Error(`${what}: expected truthy, got ${JSON.stringify(v)}`); };
const match = (s, re, what) => { if (!re.test(String(s))) throw new Error(`${what}: ${JSON.stringify(String(s))} !~ ${re}`); };
const throws = (fn, re, what) => {
  try { fn(); } catch (e) { if (!re.test(e.message)) throw new Error(`${what}: wrong error ${JSON.stringify(e.message)}`); return; }
  throw new Error(`${what}: expected a throw, got none`);
};

const BASE = {
  receiptId: 'r-1', agentName: 'alice', repidScore: 9307, amountUSDC: 50,
  recipientAddress: 'RCPT', bftPassed: true, consensusWeight: 0.9,
  solanaTxHash: null, ruleHash: 'rule-1',
};
const p = (over = {}) => paymentAuditPreimage({ ...BASE, ...over });

/** The construction this replaces, for collision comparisons. */
const oldPreimage = (o = {}) => {
  const v = { ...BASE, ...o };
  return [
    v.receiptId, v.agentName, String(v.repidScore), String(v.amountUSDC), v.recipientAddress,
    v.bftPassed === null ? 'not_evaluated' : String(v.bftPassed),
    v.consensusWeight?.toFixed(4) ?? 'null',
    v.solanaTxHash ?? 'no_tx',
    v.ruleHash,
  ].join(':');
};

// ── the collisions ──────────────────────────────────────────────────────────

check('AN ABSENT TX HASH IS NOT THE STRING "no_tx"', () => {
  // The old encoding made these byte-identical: a payment never broadcast and
  // one whose tx hash is literally "no_tx" carried the same audit hash.
  eq(oldPreimage({ solanaTxHash: null }), oldPreimage({ solanaTxHash: 'no_tx' }),
     'precondition: the OLD construction really did collide');
  truthy(p({ solanaTxHash: null }) !== p({ solanaTxHash: 'no_tx' }),
     'the new encoding must distinguish them');
});

check('an absent consensus weight is not the string "null"', () => {
  // Same shape, via `?? 'null'`. Unreachable in practice because the weight is
  // numeric, but the encoding must not depend on that coincidence.
  truthy(p({ consensusWeight: null }) !== p({ consensusWeight: 0, bftPassed: true }),
     'null and 0 must differ');
  // Found by mutation: /:null:/ matches the JSON token AND the old bare
  // sentinel, so it could not tell them apart. Pin the encoding of a PRESENT
  // weight instead — JSON renders 0.9, the old construction rendered 0.9000.
  match(p({ consensusWeight: 0.9 }), /:0\.9:/, 'a weight is JSON-encoded, not toFixed(4)');
  truthy(!p({ consensusWeight: 0.9 }).includes('0.9000'), 'the old fixed-point form must be gone');
});

check('an UNEVALUATED panel is not a failed one', () => {
  // Three states in the preimage, matching what `bft_passed` stores.
  const three = [p({ bftPassed: null }), p({ bftPassed: false }), p({ bftPassed: true })];
  eq(new Set(three).size, 3, 'null, false and true must all differ');
});

check('a COLON inside a field cannot forge a boundary', () => {
  // The class the old ':'-join was exposed to. JSON-encoding keeps any colon
  // inside its own quoted span.
  truthy(p({ agentName: 'a:b', ruleHash: 'c' }) !== p({ agentName: 'a', ruleHash: 'b:c' }),
     'a moved colon must not produce one preimage');
  truthy(p({ recipientAddress: 'R:X' }) !== p({ recipientAddress: 'R', ruleHash: 'X:rule-1' }),
     'nor across other free-text fields');
});

check('a QUOTE inside a field cannot forge a boundary either', () => {
  // JSON-encoding is the fix, so the adversarial input is a quote, not a colon.
  truthy(p({ agentName: 'a"b' }) !== p({ agentName: 'a\\"b' }), 'escaped and raw quotes differ');
  truthy(p({ agentName: '","' }) !== p({ agentName: ',' }), 'a quoted comma is not a separator');
});

check('THE DOMAIN TAG separates payment preimages from HAL ones', () => {
  // Without it the two spaces could in principle collide and one audit hash
  // would cover two different kinds of event.
  match(p(), new RegExp(`^"${PAYMENT_AUDIT_DOMAIN}"`), 'the tag must lead the preimage');
  eq(PAYMENT_AUDIT_DOMAIN, 'payment_receipt/v1', 'and be versioned');
});

check('every field is committed — changing any one changes the preimage', () => {
  // The generic check: a field in the type but not in the encoding is a field
  // the audit hash does not bind.
  const variants = {
    receiptId: 'r-2', agentName: 'bob', repidScore: 1, amountUSDC: 51,
    recipientAddress: 'OTHER', bftPassed: false, consensusWeight: 0.1,
    solanaTxHash: 'tx', ruleHash: 'rule-2',
  };
  const baseline = p();
  for (const [field, value] of Object.entries(variants)) {
    truthy(p({ [field]: value }) !== baseline, `changing ${field} must change the preimage`);
  }
});

// ── the secret ──────────────────────────────────────────────────────────────

check('A MISSING SECRET REFUSES TO MINT', () => {
  // It used to fall back to a constant printed in ComplianceReceipt.ts, so the
  // audit hash was forgeable by anyone holding the repo — tamper-evident to
  // nobody, while looking perfectly well-formed at every layer above.
  throws(() => requireAuditSecret({}), /TRUSTRAILS_HMAC_SECRET is not set/, 'absent must throw');
  throws(() => requireAuditSecret({ TRUSTRAILS_HMAC_SECRET: '' }), /is not set/, 'empty must throw');
  throws(() => requireAuditSecret({ TRUSTRAILS_HMAC_SECRET: '   ' }), /is not set/, 'whitespace must throw');
});

check('the throw NAMES the variable and says why', () => {
  // lib/CLAUDE.md: "Missing configuration must throw and name the variable."
  throws(() => requireAuditSecret({}), /TRUSTRAILS_HMAC_SECRET/, 'names the variable');
  throws(() => requireAuditSecret({}), /forge/, 'and says what the absence costs');
});

check('THE ABANDONED DEFAULT IS REFUSED BY NAME', () => {
  // It is 26 characters, so it clears the length rule. The most likely way this
  // weakness returns is somebody "fixing" the missing variable by pasting the
  // constant the old fallback used.
  truthy(ABANDONED_DEFAULT_SECRET.length >= MIN_AUDIT_SECRET_LENGTH,
     'precondition: the default is long enough to pass the length check');
  throws(() => requireAuditSecret({ TRUSTRAILS_HMAC_SECRET: ABANDONED_DEFAULT_SECRET }),
     /abandoned default/, 'and must still be refused');
  eq(isAbandonedDefaultSecret(ABANDONED_DEFAULT_SECRET), true, 'recognised');
  eq(isAbandonedDefaultSecret(` ${ABANDONED_DEFAULT_SECRET} `), true, 'even padded');
  eq(isAbandonedDefaultSecret('something-else-entirely'), false, 'and nothing else is');
});

check('a SHORT secret is refused — a weak key is invisible in the output', () => {
  throws(() => requireAuditSecret({ TRUSTRAILS_HMAC_SECRET: 'x' }), /at least/, 'one char');
  throws(() => requireAuditSecret({ TRUSTRAILS_HMAC_SECRET: 'x'.repeat(MIN_AUDIT_SECRET_LENGTH - 1) }),
     /at least/, 'one below the floor');
  eq(requireAuditSecret({ TRUSTRAILS_HMAC_SECRET: 'x'.repeat(MIN_AUDIT_SECRET_LENGTH) }),
     'x'.repeat(MIN_AUDIT_SECRET_LENGTH), 'exactly at the floor is accepted');
});

check('a usable secret is returned unchanged', () => {
  // Including its surrounding whitespace: trimming for the length check is not
  // the same as trimming the key, and silently altering a secret would produce
  // hashes nobody else can reproduce.
  const s = 'a-real-looking-secret-value';
  eq(requireAuditSecret({ TRUSTRAILS_HMAC_SECRET: s }), s, 'returned verbatim');
  // Found by mutation: the previous fixture had no surrounding whitespace, so
  // a trim() on the return path was invisible. Trimming for the LENGTH check is
  // not the same as trimming the key — silently altering a secret produces
  // audit hashes nobody else can reproduce.
  const padded = `  ${s}  `;
  eq(requireAuditSecret({ TRUSTRAILS_HMAC_SECRET: padded }), padded,
     'whitespace is significant in the key and must survive');
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\nreceipt-audit: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('All receipt-audit checks passed.');
