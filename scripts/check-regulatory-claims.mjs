// scripts/check-regulatory-claims.mjs
//
// A public endpoint was asserting compliance with named regulations, from
// nothing.
//
// `app/api/trustrails/system-trust/route.ts` returned:
//
//     regulatoryStatus: { micaCompliant: true, geniusActReady: true,
//                         fatfAligned: true, fireblocksPreAuth: true, … }
//
// Four hardcoded `true` literals naming MiCA Art. 68, the GENIUS Act and FATF
// Recommendation 16. Nothing computed them and nothing verified them. This is
// the repo's defining defect — a system reporting success it has not earned —
// in the one place an outside reader takes at face value.
//
// ── AND THE RATE BESIDE THEM, MEASURED ──────────────────────────────────────
//
// `complianceRate` was `passed / (passed + blocked)` with a `'100%'` fallback on
// a zero denominator. Against the live table on 2026-08-19:
//
//     receipts in the last 24 hours ...........  0
//     receipts all time .......................  12   (newest 2026-04-01)
//     with bft_passed = true ..................  0
//     with bft_passed = false .................  0
//     with bft_passed = null (unevaluated) ....  12
//
// The denominator has NEVER been anything but zero. That endpoint published
// 100% compliance, from no data, for its entire existence — and it would have
// kept doing so as the number aged, because a fallback does not age.
//
// ── WHAT THIS SUITE PINS ────────────────────────────────────────────────────
//
// The strongest assertion is that a status CANNOT BE CONSTRUCTED. `resolveClaim`
// takes evidence and derives; there is no parameter a caller can set to `true`.
// That is the same refusal `promotion.ts` makes about stages, applied to the
// statement with the highest cost of being wrong.
//
// The suite also pins the modesty of the claim itself. The module reports
// whether a NECESSARY condition is observable — it does not assess compliance,
// which is a legal judgement made by people with evidence this process does not
// have. Deleting that disclaimer turns a narrow true statement into a broad
// false one, so it is asserted.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';
import { stripComments } from './lib/module-specifiers.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.regulatory-check-'));
let R;
try {
  const tsconfigPath = join(outDir, 'tsconfig.json');
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        outDir, rootDir: process.cwd(), module: 'commonjs', target: 'es2022',
        lib: ['es2022'], moduleResolution: 'node', esModuleInterop: true,
        skipLibCheck: true, strict: true,
      },
      files: [join(process.cwd(), 'lib/trustshell/regulatory-claims.ts')],
    })
  );
  execFileSync(localTsc(), ['-p', tsconfigPath], { stdio: 'pipe' });
  R = await import(pathToFileURL(join(outDir, 'lib/trustshell/regulatory-claims.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('FAILED: could not compile lib/trustshell/regulatory-claims.ts');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

let pass = 0;
const failures = [];
function check(name, fn) {
  try {
    const r = fn();
    if (r === true) { pass++; return; }
    failures.push(`${name}: ${r}`);
  } catch (e) {
    failures.push(`${name}: threw ${e.message}`);
  }
}

/** The system as it ACTUALLY is, measured 2026-08-19. */
const LIVE = {
  evaluatedConsensusCount: 0,
  receiptCount: 0,
  humanCustodyVerifiedCount: 0,
  agentCount: 12,
  fireblocksIntegrationLive: false,
  verifiedCounterpartyIdentity: false,
};

// ── 1. The live system claims NOTHING ───────────────────────────────────────
//
// The assertion that would have caught the original defect, stated first.

check('against the REAL system, not one claim is MET', () => {
  const met = R.resolveAllClaims(LIVE).filter((c) => c.status === 'MET');
  return met.length === 0
    ? true
    : `${met.map((c) => c.id).join(', ')} reported MET on a system with 0 evaluated ` +
      'transactions, no Fireblocks integration and no counterparty identification';
});

check('allClaimsMet is false for the real system', () =>
  !R.allClaimsMet(R.resolveAllClaims(LIVE)) ? true : 'the system reported full compliance');

check('NOT_CHECKED does not count toward full compliance', () => {
  // The case the LIVE fixture cannot reach: the two conditions this system CAN
  // evaluate are satisfied, and the two it cannot are unmeasured. Nothing is
  // NOT_MET, and the honest answer is still no.
  //
  // The `regulatory-all-met-ignores-not-checked` mutation SURVIVED against the
  // live fixture for exactly this reason — under it, `every(status !== 'NOT_MET')`
  // was still false because two claims were NOT_MET. Cause 2 in the manifest's
  // list: an invariant asserted over a situation no input reached.
  const claims = R.resolveAllClaims({
    evaluatedConsensusCount: 0,
    receiptCount: 0,            // -> MiCA NOT_CHECKED
    humanCustodyVerifiedCount: 0,
    agentCount: 0,              // -> GENIUS NOT_CHECKED
    fireblocksIntegrationLive: true,     // -> MET
    verifiedCounterpartyIdentity: true,  // -> MET
  });
  const notMet = claims.filter((c) => c.status === 'NOT_MET');
  const notChecked = claims.filter((c) => c.status === 'NOT_CHECKED');
  if (notMet.length !== 0) return `fixture is wrong: ${notMet.length} claims are NOT_MET`;
  if (notChecked.length !== 2) return `fixture is wrong: ${notChecked.length} claims are NOT_CHECKED`;
  return !R.allClaimsMet(claims)
    ? true
    : 'a system that measured half its claims and checked neither of the others reported ' +
      'FULL compliance — NOT_CHECKED was folded into a pass';
});

check('every claim names the instrument and the condition it needs', () => {
  for (const c of R.resolveAllClaims(LIVE)) {
    if (!c.framework || c.framework.length < 4) return `${c.id} has no framework named`;
    if (!c.necessaryCondition || c.necessaryCondition.length < 20)
      return `${c.id} does not state what would be necessary`;
    if (!c.detail || c.detail.length < 10) return `${c.id} gives no reason for its status`;
  }
  return true;
});

// ── 2. A status cannot be constructed ───────────────────────────────────────

check('resolveClaim exposes no way to SET a status', () => {
  // The original defect was literally `micaCompliant: true`. If a status could
  // be supplied, the same line comes back wearing a function call.
  const src = stripComments(readFileSync('lib/trustshell/regulatory-claims.ts', 'utf8'));
  const sig = src.slice(src.indexOf('export function resolveClaim'), src.indexOf('): RegulatoryClaim {'));
  return !/status/i.test(sig)
    ? true
    : 'resolveClaim accepts a status in its parameters — a caller can assert compliance again';
});

check('no CLAIM_SPEC carries a status of its own', () => {
  for (const spec of R.CLAIM_SPECS) {
    if ('status' in spec) return `${spec.id} carries a status in its spec`;
  }
  return true;
});

// ── 3. Each claim's condition actually gates it ────────────────────────────

check('MiCA is NOT CHECKED with zero transactions — a control cannot work on nothing', () => {
  const c = R.resolveAllClaims({ ...LIVE, receiptCount: 0 }).find((x) => x.id === 'micaCompliant');
  return c.status === 'NOT_CHECKED' ? true : `status ${c.status}`;
});

check('MiCA is NOT CHECKED when transactions exist but consensus never ran', () => {
  // The live shape exactly: 12 receipts, all bft_passed = null.
  const c = R.resolveAllClaims({ ...LIVE, receiptCount: 12, evaluatedConsensusCount: 0 })
    .find((x) => x.id === 'micaCompliant');
  return c.status === 'NOT_CHECKED' && /did not run/.test(c.detail)
    ? true
    : `${c.status}: ${c.detail}`;
});

check('MiCA becomes MET only once a consensus has actually been evaluated', () => {
  const c = R.resolveAllClaims({ ...LIVE, receiptCount: 5, evaluatedConsensusCount: 5 })
    .find((x) => x.id === 'micaCompliant');
  return c.status === 'MET' ? true : `${c.status}: ${c.detail}`;
});

check('GENIUS Act is NOT MET on partial custody, and MET only on all of it', () => {
  const partial = R.resolveAllClaims({ ...LIVE, humanCustodyVerifiedCount: 11, agentCount: 12 })
    .find((x) => x.id === 'geniusActReady');
  const full = R.resolveAllClaims({ ...LIVE, humanCustodyVerifiedCount: 12, agentCount: 12 })
    .find((x) => x.id === 'geniusActReady');
  if (partial.status !== 'NOT_MET') return `11 of 12 reported ${partial.status}`;
  return full.status === 'MET' ? true : `12 of 12 reported ${full.status}`;
});

check('FATF is NOT MET without verified counterparty IDENTIFICATION', () => {
  const c = R.resolveAllClaims(LIVE).find((x) => x.id === 'fatfAligned');
  return c.status === 'NOT_MET' && /address/.test(c.detail)
    ? true
    : `${c.status}: ${c.detail} — an address is not an identification`;
});

check('Fireblocks is NOT MET while the pre-auth is generated locally', () => {
  const c = R.resolveAllClaims(LIVE).find((x) => x.id === 'fireblocksPreAuth');
  return c.status === 'NOT_MET' && /nothing has been pre-authorized/.test(c.detail)
    ? true
    : `${c.status}: ${c.detail}`;
});

// ── 4. The rate ────────────────────────────────────────────────────────────

check('an empty denominator yields NULL, not 100%', () => {
  const r = R.complianceRate(0, 0);
  return r.rate === null ? true : `reported ${r.rate} over an empty set`;
});

check('null renders as words, never as a number', () => {
  const s = R.formatRate(R.complianceRate(0, 0));
  return s === 'NOT CHECKED' ? true : `an undefined rate rendered as "${s}"`;
});

check('a real rate is computed correctly and rendered as a percentage', () => {
  const r = R.complianceRate(3, 1);
  return r.rate === 0.75 && R.formatRate(r) === '75.0%' ? true : `${r.rate} / ${R.formatRate(r)}`;
});

check('an all-blocked window is 0%, and 0% is NOT the same as NOT CHECKED', () => {
  const zero = R.complianceRate(0, 5);
  const none = R.complianceRate(0, 0);
  return zero.rate === 0 && none.rate === null && R.formatRate(zero) !== R.formatRate(none)
    ? true
    : 'a genuinely failing window is indistinguishable from an empty one';
});

// ── 5. The route uses it, and no literal survives ──────────────────────────

const route = stripComments(readFileSync('app/api/trustrails/system-trust/route.ts', 'utf8'));

check('no hardcoded regulatory literal remains on the route', () => {
  const banned = [
    /micaCompliant:\s*true/,
    /geniusActReady:\s*true/,
    /fatfAligned:\s*true/,
    /fireblocksPreAuth:\s*true/,
  ];
  const back = banned.filter((re) => re.test(route));
  return back.length === 0
    ? true
    : `${back.length} hardcoded regulatory claim(s) are back in the route`;
});

check("the route no longer falls back to '100%'", () =>
  !/:\s*'100%'/.test(route)
    ? true
    : "the '100%' fallback is back — it publishes perfect compliance from an empty set");

check('the route derives its claims from resolveAllClaims', () =>
  /resolveAllClaims\(\{/.test(route) && /claims: regulatoryClaims/.test(route)
    ? true
    : 'the route does not derive regulatoryStatus from the resolver');

check('the response carries the disclaimer that this is not a compliance assessment', () =>
  /disclaimer:/.test(route) && /NECESSARY condition/.test(route)
    ? true
    : 'the disclaimer is gone — without it, "necessary condition observable" reads as ' +
      '"compliant", which is a broader claim than anything here can support');

rmSync(outDir, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} of ${pass + failures.length} assertions`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`VERIFIED: ${pass} assertions — no regulatory claim is published without evidence`);
