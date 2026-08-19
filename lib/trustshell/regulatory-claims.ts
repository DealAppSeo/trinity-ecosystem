// lib/trustshell/regulatory-claims.ts
//
// What may a public endpoint say about regulatory compliance?
//
// ZERO IMPORTS, like `reward.ts` and `promotion.ts`. Every value here goes
// straight into an HTTP response that names real regulations, and a claim you
// cannot run standalone is a claim nobody checks.
//
// ── WHAT WAS BEING PUBLISHED ────────────────────────────────────────────────
//
// `app/api/trustrails/system-trust/route.ts` returned, on a live public route:
//
//     regulatoryStatus: {
//       micaCompliant:     true,
//       geniusActReady:    true,
//       fatfAligned:       true,
//       fireblocksPreAuth: true,
//       aminaPilotReady:   systemScore >= 7500,
//     }
//
// Four hardcoded `true` literals. Nothing computed them, nothing verified them,
// and they name actual instruments — MiCA, the GENIUS Act, FATF Recommendation
// 16. This is the repo's defining defect at its most consequential: a system
// reporting compliance it has not earned, in the one place an outside reader
// would take at face value.
//
// The fifth was at least derived, from a plain mean of stored RepID scores. That
// is a score threshold, not a readiness assessment, and it now says so.
//
// ── AND THE RATE BESIDE THEM ────────────────────────────────────────────────
//
// The same response carried `complianceRate`, computed as
// `passed / (passed + blocked)` with a fallback of `'100%'` when the denominator
// is zero. MEASURED 2026-08-19 against the live table: **0 receipts in the last
// 24 hours; 12 all time, newest 2026-04-01; all 12 with `bft_passed = null`.**
// So the denominator has never been anything but zero, and that endpoint has
// always published **100% compliance from no data at all**.
//
// A rate over an empty set is undefined. It is not 100%, and it is not 0%. This
// module returns null and the caller renders NOT CHECKED — the same rule
// `hal/accuracy.ts` applies to AUC with an absent class, for the same reason.
//
// ── THE DESIGN RULE ─────────────────────────────────────────────────────────
//
// A claim cannot be constructed as met. `resolveClaim` takes the evidence and
// derives the status; there is no field a caller can set to `true`. That is the
// same refusal `promotion.ts` makes about stages, applied to the statement with
// the highest cost of being wrong.
//
// **This module does not assess compliance.** It cannot — that is a legal
// judgement made by people with evidence this process does not have. What it
// does is narrower and is the honest half: for each claim it names the concrete,
// checkable condition that would be NECESSARY, and reports NOT CHECKED whenever
// that condition cannot be evaluated here. Necessary is not sufficient, and the
// type says so.

/** Three outcomes. NOT_CHECKED is not a pass and not a failure. */
export type ClaimStatus = 'MET' | 'NOT_MET' | 'NOT_CHECKED';

/**
 * What this process can actually observe. Every field is a count or a flag the
 * caller already holds — nothing is fetched here, and nothing defaults.
 */
export interface ClaimEvidence {
  /** Receipts in the window whose BFT consensus actually ran. */
  evaluatedConsensusCount: number;
  /** Receipts in the window, evaluated or not. */
  receiptCount: number;
  /** Agents with `human_custody_verified`. */
  humanCustodyVerifiedCount: number;
  agentCount: number;
  /**
   * Does a real Fireblocks integration exist, or only a generated pre-auth
   * object? `FireblocksPreAuth.generatePreAuth` builds a local structure; it
   * does not call Fireblocks.
   */
  fireblocksIntegrationLive: boolean;
  /**
   * Do receipts carry VERIFIED counterparty identity? `recipient_address` is an
   * address, not an identification — FATF Rec. 16 is about the latter.
   */
  verifiedCounterpartyIdentity: boolean;
}

export interface RegulatoryClaim {
  id: string;
  /** The instrument, named exactly. */
  framework: string;
  /** The concrete condition that is NECESSARY for the claim. Not sufficient. */
  necessaryCondition: string;
  status: ClaimStatus;
  /** Why it resolved that way, in one line the response can carry. */
  detail: string;
}

/**
 * The claims this endpoint is allowed to speak about, and what each needs.
 *
 * Written as conditions rather than as verdicts, so the resolver compares the
 * system against a stated bar instead of against itself.
 */
export const CLAIM_SPECS = Object.freeze([
  {
    id: 'micaCompliant',
    framework: 'MiCA Art. 68',
    necessaryCondition:
      'compliance controls demonstrably prevent unauthorized transactions — which requires ' +
      'that the authorization control has RUN on the transactions being counted',
  },
  {
    id: 'geniusActReady',
    framework: 'GENIUS Act',
    necessaryCondition:
      'human custody is verified for the agents transacting, and that verification is recorded',
  },
  {
    id: 'fatfAligned',
    framework: 'FATF Rec. 16 (Travel Rule)',
    necessaryCondition:
      'verified counterparty IDENTIFICATION accompanies each transfer — a destination address ' +
      'is not an identification',
  },
  {
    id: 'fireblocksPreAuth',
    framework: 'Fireblocks pre-authorization',
    necessaryCondition: 'a live Fireblocks integration, not a locally generated pre-auth object',
  },
] as const);

/**
 * Derive one claim's status from evidence.
 *
 * There is deliberately no way to pass in a status. The four literals this
 * module replaces were `true` because someone typed `true`.
 */
export function resolveClaim(
  spec: (typeof CLAIM_SPECS)[number],
  e: ClaimEvidence
): RegulatoryClaim {
  const base = { id: spec.id, framework: spec.framework, necessaryCondition: spec.necessaryCondition };

  switch (spec.id) {
    case 'micaCompliant': {
      if (e.receiptCount === 0) {
        return {
          ...base,
          status: 'NOT_CHECKED',
          detail: 'no transactions in the window — a control cannot be shown to work on nothing',
        };
      }
      if (e.evaluatedConsensusCount === 0) {
        return {
          ...base,
          status: 'NOT_CHECKED',
          detail:
            `${e.receiptCount} transaction(s), 0 with an evaluated consensus — the authorization ` +
            'control did not run, so nothing here shows it preventing anything',
        };
      }
      return {
        ...base,
        status: 'MET',
        detail: `${e.evaluatedConsensusCount} of ${e.receiptCount} transaction(s) had consensus evaluated`,
      };
    }
    case 'geniusActReady': {
      if (e.agentCount === 0) {
        return { ...base, status: 'NOT_CHECKED', detail: 'no agents registered' };
      }
      if (e.humanCustodyVerifiedCount < e.agentCount) {
        return {
          ...base,
          status: 'NOT_MET',
          detail: `${e.humanCustodyVerifiedCount} of ${e.agentCount} agents have verified human custody`,
        };
      }
      return {
        ...base,
        status: 'MET',
        detail: `all ${e.agentCount} agents have verified human custody`,
      };
    }
    case 'fatfAligned': {
      return e.verifiedCounterpartyIdentity
        ? { ...base, status: 'MET', detail: 'receipts carry verified counterparty identification' }
        : {
            ...base,
            status: 'NOT_MET',
            detail:
              'receipts carry a destination address only; no verified counterparty identity is ' +
              'recorded anywhere in this system',
          };
    }
    case 'fireblocksPreAuth': {
      return e.fireblocksIntegrationLive
        ? { ...base, status: 'MET', detail: 'a live Fireblocks integration is configured' }
        : {
            ...base,
            status: 'NOT_MET',
            detail:
              'the pre-auth object is generated locally — no request is made to Fireblocks, so ' +
              'nothing has been pre-authorized by anyone',
          };
    }
  }
}

export function resolveAllClaims(e: ClaimEvidence): RegulatoryClaim[] {
  return CLAIM_SPECS.map((spec) => resolveClaim(spec, e));
}

/**
 * True only when EVERY claim is MET.
 *
 * Named for what it is. A summary that reported "mostly compliant" would be the
 * two-outcome collapse wearing a percentage.
 */
export function allClaimsMet(claims: readonly RegulatoryClaim[]): boolean {
  return claims.length > 0 && claims.every((c) => c.status === 'MET');
}

export interface ComplianceRate {
  /** Null when undefined. NOT 1, NOT 0. */
  rate: number | null;
  passed: number;
  blocked: number;
  detail: string;
}

/**
 * The share of transactions that passed, over those with a verdict.
 *
 * Returns null on an empty denominator. The previous implementation fell back to
 * `'100%'`, and the denominator has never been anything else: measured
 * 2026-08-19, 0 receipts in 24 hours and 12 all time, every one of them with
 * `bft_passed = null`. So that endpoint published perfect compliance, from no
 * data, for its entire existence.
 *
 * Unevaluated receipts are excluded from BOTH sides rather than counted as
 * passes. Folding them in is the same error as `!r.bft_passed`, which the route
 * already fixed one field above — this is that fix, finished.
 */
export function complianceRate(passed: number, blocked: number): ComplianceRate {
  const total = passed + blocked;
  if (total <= 0) {
    return {
      rate: null,
      passed,
      blocked,
      detail:
        'NOT CHECKED — no transaction in this window has a consensus verdict, so there is no ' +
        'denominator. A rate over an empty set is undefined; it is not 100%',
    };
  }
  return {
    rate: passed / total,
    passed,
    blocked,
    detail: `${passed} passed of ${total} with a verdict`,
  };
}

/** Format for display. Null renders as the words, never as a number. */
export function formatRate(r: ComplianceRate): string {
  return r.rate === null ? 'NOT CHECKED' : `${(r.rate * 100).toFixed(1)}%`;
}
