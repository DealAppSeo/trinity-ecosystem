// PAY-002 — can a hostile `amountUSDC` make a spending limit evaluate to "fine"?
//
// THREAT. `amountUSDC` arrives from `await req.json()` with no schema, no cast
// and no validation, and flows straight into the limit checks. JSON can carry
// things a limit comparison was never written for, and the classic outcome is
// not a crash but a SILENT PASS, because every comparison against NaN is false:
//
//   NaN > limit          → false   "within the limit"
//   NaN > 50000          → false   skips the dual-signature gate entirely
//   -1e9 > limit         → false   "within the limit", and it is a withdrawal
//   "60000" > 50000      → true    string coerces; comparisons still "work"
//   1e309 → Infinity     → true    but Infinity in arithmetic poisons the rest
//
// A fail-open reached through the type system rather than through a credential
// is the highest-value thing to probe on a payment path, because no log shows
// an attack: the request looks ordinary and the answer is yes.
//
// This probe EXECUTES the real limit functions from `lib/trustshell/repid-scoring.ts`
// over that corpus. It does not reason about them. The contract it holds them
// to is the repo's own: a limit that could not be evaluated must return
// NOT_CHECKED, never VERIFIED — "unavailable is not checked", and a limit
// nobody could evaluate is not a limit that passed.

import { compileAndImport } from '../compile.mjs';
import { held, breached, notChecked } from '../harness.mjs';

/**
 * Hostile amounts, each with the reason it is dangerous. JSON.parse can produce
 * every one of these from a request body — `NaN`/`Infinity` arrive via
 * arithmetic on a large literal rather than as literals, which is why 1e309 is
 * in the list alongside them.
 */
const HOSTILE = [
  { value: NaN,                why: 'every comparison against NaN is false, so a limit "passes"' },
  { value: -1,                 why: 'a negative transfer inverts the direction of value' },
  { value: -1e9,               why: 'a large negative slips under every ceiling' },
  { value: Infinity,           why: 'exceeds any finite limit, but poisons arithmetic downstream' },
  { value: -Infinity,          why: 'under every limit by construction' },
  { value: 1e309,              why: 'a JSON number literal that parses to Infinity' },
  { value: '60000',            why: 'a string that coerces in `>` but not in Number.isFinite' },
  { value: '0',                why: 'a falsy string; truthiness checks read it as absent' },
  { value: null,               why: 'Number(null) is 0, so a null amount can read as a free transfer' },
  { value: undefined,          why: 'an absent field' },
  { value: {},                 why: 'an object; `{} > n` is false for all n' },
  { value: [],                 why: 'Number([]) is 0' },
  { value: [50],               why: 'Number([50]) is 50 — an array that coerces to a number' },
  { value: 0.1 + 0.2,          why: 'float representation, sanity anchor (must behave normally)' },
];

/** A limit that is itself unusable — the other half of the same failure. */
const HOSTILE_LIMITS = [NaN, -1, Infinity, null, undefined, '1000'];

export default {
  id: 'PAY-002',
  title: 'Spending-limit checks under hostile amount and limit types',
  component: 'TrustShell / KYA spending limits',
  severity: 'Critical',
  threat: 'An unvalidated JSON number makes a spending limit evaluate to "within limit" without any credential.',

  async run() {
    const c = await compileAndImport(['lib/trustshell/repid-scoring.ts']);
    if (!c.ok) return notChecked(c.reason, c.howToRun);

    const { checkPerTxLimit, checkDailyLimit } = c.modules[0];
    if (!checkPerTxLimit || !checkDailyLimit) {
      c.cleanup();
      return notChecked(
        'repid-scoring.ts no longer exports checkPerTxLimit / checkDailyLimit',
        're-point this probe at the current limit-check exports'
      );
    }

    const breaches = [];
    const transcript = [];

    // ── per-transaction limit, hostile amount, sane limit ────────────────────
    for (const { value, why } of HOSTILE) {
      const r = checkPerTxLimit(value, 100);
      transcript.push(`checkPerTxLimit(${fmt(value)}, 100) -> ${r.outcome} withinLimit=${r.withinLimit}`);
      // 0.1+0.2 is the anchor: it IS a usable number under a limit of 100, so
      // VERIFIED is correct for it. Without an anchor a probe that reported
      // BREACHED on everything would look identical to one that worked.
      const isAnchor = value === 0.1 + 0.2;
      if (isAnchor) {
        if (r.outcome !== 'VERIFIED') {
          breaches.push(`ANCHOR BROKEN: a legitimate amount ${fmt(value)} was not VERIFIED (${r.outcome}) — the probe's own baseline is wrong`);
        }
        continue;
      }
      if (r.outcome === 'VERIFIED' || r.withinLimit === true) {
        breaches.push(`checkPerTxLimit(${fmt(value)}, 100) -> ${r.outcome}/withinLimit=${r.withinLimit} — ${why}`);
      }
    }

    // ── per-transaction limit, sane amount, hostile LIMIT ────────────────────
    // The mirror case, and the one more likely to be missed: an institution's
    // stored limit is data too, and an unreadable or garbage limit must not
    // silently become permissive.
    for (const limit of HOSTILE_LIMITS) {
      const r = checkPerTxLimit(1_000_000, limit);
      transcript.push(`checkPerTxLimit(1000000, ${fmt(limit)}) -> ${r.outcome} withinLimit=${r.withinLimit}`);
      if (r.outcome === 'VERIFIED' || r.withinLimit === true) {
        breaches.push(`checkPerTxLimit(1000000, ${fmt(limit)}) -> ${r.outcome}/withinLimit=${r.withinLimit} — an unusable limit approved a 1,000,000 transfer`);
      }
    }

    // ── daily limit, including the unknown-spend case ────────────────────────
    // `spentSoFar === null` means the history could not be read. An unreadable
    // history is not an empty one; approving here is a fail-open reached by an
    // outage rather than by any input.
    const daily = [
      { amount: 100, spent: null, limit: 1000, must: 'NOT_CHECKED', why: 'unreadable spend history must not approve' },
      { amount: NaN, spent: 0, limit: 1000, must: 'NOT_CHECKED', why: 'NaN amount must not approve' },
      { amount: 100, spent: NaN, limit: 1000, must: 'NOT_CHECKED', why: 'NaN spend-so-far must not approve' },
      { amount: 100, spent: 0, limit: NaN, must: 'NOT_CHECKED', why: 'NaN limit must not approve' },
      { amount: -500, spent: 999, limit: 1000, must: 'NOT_CHECKED', why: 'a negative amount must not buy headroom' },
      { amount: 100, spent: 0, limit: 1000, must: 'VERIFIED', why: 'anchor: an ordinary payment must still be approved' },
    ];
    for (const t of daily) {
      const r = checkDailyLimit(t.amount, t.spent, t.limit);
      transcript.push(`checkDailyLimit(${fmt(t.amount)}, ${fmt(t.spent)}, ${fmt(t.limit)}) -> ${r.outcome} withinLimit=${r.withinLimit}`);
      if (t.must === 'VERIFIED') {
        if (r.outcome !== 'VERIFIED') breaches.push(`ANCHOR BROKEN: ${t.why} — got ${r.outcome}`);
      } else if (r.outcome === 'VERIFIED' || r.withinLimit === true) {
        breaches.push(`checkDailyLimit(${fmt(t.amount)}, ${fmt(t.spent)}, ${fmt(t.limit)}) -> ${r.outcome}/withinLimit=${r.withinLimit} — ${t.why}`);
      }
    }

    c.cleanup();

    if (breaches.length > 0) {
      return breached(
        `${breaches.length} of ${HOSTILE.length + HOSTILE_LIMITS.length + daily.length} hostile inputs were approved or mis-classified`,
        [...breaches.map((b) => `  BREACH  ${b}`), '', 'full transcript:', ...transcript.map((t) => `    ${t}`)].join('\n')
      );
    }

    return held(
      `all ${HOSTILE.length + HOSTILE_LIMITS.length} hostile amount/limit inputs returned NOT_CHECKED or FAILED, ` +
      'and both anchors still returned VERIFIED — the limit checks are type-fail-closed',
      transcript.join('\n')
    );
  },
};

/** Render a value unambiguously — `NaN`, `"0"` and `0` must not print alike. */
function fmt(v) {
  if (typeof v === 'number' && Number.isNaN(v)) return 'NaN';
  if (v === Infinity) return 'Infinity';
  if (v === -Infinity) return '-Infinity';
  if (v === undefined) return 'undefined';
  return JSON.stringify(v);
}
