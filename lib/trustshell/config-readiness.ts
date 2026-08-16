// lib/trustshell/config-readiness.ts
//
// "Is the required configuration actually present on THIS surface?" — answered
// by a fixed allowlist, in status words, never in values.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// PR #54 made receipt minting THROW without `TRUSTRAILS_HMAC_SECRET`, which is
// correct: the audit hash is an HMAC, and without a secret it was computed under
// a constant printed in the source, so anyone holding the repository could forge
// one. Refusing to mint beats minting evidence that proves nothing.
//
// That PR shipped with a stated blocker — set the variable on both surfaces
// before merging — and it merged on 2026-08-16 while the blocker was still open.
// Within a minute `www` was serving the merge commit while `app` was still on the
// previous one [VERIFIED via pg_net /api/version, both platforms]. So the two
// surfaces were running different code with separate environment variables, and
// there was NO WAY TO ASK EITHER ONE whether the secret was set.
//
// The only available check was to POST a payment to production and see whether
// it threw. That is not a check, that is an incident.
//
// ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────
//
// `app/api/version/route.ts` states its own rule: it "exposes a fixed set of
// named fields and never enumerates the environment, so a new platform variable
// cannot leak through it by accident." This honours that exactly.
//
//   * NEVER a value, a prefix, or a suffix. Status words only.
//   * NEVER `Object.keys(process.env)`. A hardcoded allowlist, so adding a
//     variable to a platform cannot make it appear here.
//   * NEVER a length. `too_short` says a bound was missed; it does not say by
//     how much.
//
// What an operator gains is the difference between "configured" and
// "configured badly" — which is exactly what an HMAC hides, because both
// produce a perfectly well-formed hash.
//
// ── WHY `abandoned_default` IS ITS OWN STATUS ───────────────────────────────
//
// The likeliest repair for "the variable is missing" is to paste the constant
// the old fallback used. It is 26 characters, so it clears the length rule, and
// it is published in this repository and in git history — every audit hash under
// it is forgeable. A set-but-abandoned secret is as bad as no secret and looks
// strictly better, so it gets its own word rather than folding into `ok`.
//
// Reporting it leaks nothing: the value is already public.

import { ABANDONED_DEFAULT_SECRET, MIN_AUDIT_SECRET_LENGTH } from './receipt-audit';

/**
 * Four states, because two would collapse "badly configured" into "fine" —
 * which is this codebase's defining defect, in the one place whose whole job is
 * to report configuration honestly.
 */
export type ConfigStatus = 'ok' | 'missing' | 'abandoned_default' | 'too_short';

export interface ConfigReadiness {
  /** Per-variable status. Names are fixed; see `REQUIRED_SECRETS`. */
  secrets: Record<string, ConfigStatus>;
  /** True only when every allowlisted variable is `ok`. */
  ready: boolean;
  /** The variables that are not `ok`, so a caller need not diff the map. */
  blocking: string[];
}

/**
 * The allowlist. HARDCODED, never derived from `process.env`.
 *
 * `minLength` is the same bound `requireAuditSecret` enforces, imported rather
 * than repeated — one rule, one implementation. Two copies of a threshold is
 * the defect this branch found four times.
 */
export const REQUIRED_SECRETS: readonly {
  name: string;
  minLength: number;
  rejectValue?: string;
}[] = [
  {
    name: 'TRUSTRAILS_HMAC_SECRET',
    minLength: MIN_AUDIT_SECRET_LENGTH,
    rejectValue: ABANDONED_DEFAULT_SECRET,
  },
];

/**
 * Classify one secret. Pure, so it can be asserted directly.
 *
 * The order matters and is not arbitrary: the abandoned default is checked
 * BEFORE the length bound, because it is long enough to pass that bound. A
 * length-first order would report `ok` for the one value that is known-forgeable.
 */
export function classifySecret(
  value: string | undefined,
  rule: { minLength: number; rejectValue?: string }
): ConfigStatus {
  if (value === undefined || value.trim() === '') return 'missing';
  if (rule.rejectValue !== undefined && value.trim() === rule.rejectValue) {
    return 'abandoned_default';
  }
  if (value.trim().length < rule.minLength) return 'too_short';
  return 'ok';
}

/**
 * Read the allowlist out of an environment.
 *
 * Takes the environment as an argument rather than reaching for `process.env`,
 * so a test can drive every branch without mutating global state — and so this
 * module has no side effects at import time (lib/CLAUDE.md: nothing that runs at
 * module scope).
 */
export function describeConfigReadiness(
  env: Record<string, string | undefined>
): ConfigReadiness {
  const secrets: Record<string, ConfigStatus> = {};
  const blocking: string[] = [];

  for (const rule of REQUIRED_SECRETS) {
    const status = classifySecret(env[rule.name], rule);
    secrets[rule.name] = status;
    if (status !== 'ok') blocking.push(rule.name);
  }

  return { secrets, ready: blocking.length === 0, blocking };
}
