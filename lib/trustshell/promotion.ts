// lib/trustshell/promotion.ts
//
// What a surface is allowed to CLAIM about itself, and what it must show first.
//
// ZERO IMPORTS. Every decision here ends up in a table someone reads as a status
// report, and a status report that cannot be run standalone is one nobody checks.
//
// ── WHY THIS EXISTS: A18, GENERALISED ───────────────────────────────────────
//
// LESSONS A18: three commits sat on a PR with `npm run check` never having
// executed against them in CI, behind a green tick that was describing Vercel's
// preview-comments check. Nobody lied. The page showed passing checks, the
// author saw passing checks, and the honest status of those commits was NOT
// CHECKED — with nothing anywhere surfacing the absence.
//
// A promotion table has exactly the same failure available to it. "Live" in a
// row is a green tick; the evidence behind it is off-screen. So this module
// refuses to let a caller *assert* a stage. A stage is DERIVED from evidence, and
// the derivation treats a missing gate as NOT CHECKED rather than as a pass.
//
// ── THE FOUR STAGES ARE NOT A CONFIDENCE SCALE ──────────────────────────────
//
// They answer two independent questions, which is why "it mostly works" has no
// row of its own:
//
//              did a gate RUN against this exact artifact?   what did it say?
//   live       yes                                           VERIFIED
//   soft-live  yes                                           VERIFIED, but the
//                                                            gate does not cover
//                                                            the whole claim
//   observe    yes                                           ran, did not gate
//   blocked    yes                                           FAILED
//   (none)     NO  -> NOT CHECKED, and it is not a stage at all
//
// A surface with no gate does not get a stage. `stageFor` returns null and the
// caller must render it as NOT CHECKED. That is the A18 property: absence is
// visible, never silently folded into the lowest good-looking row.

/** Three outcomes, never two. NOT_CHECKED is not a pass and not a failure. */
export type GateOutcome = 'VERIFIED' | 'NOT_CHECKED' | 'FAILED';

export type Stage = 'live' | 'soft-live' | 'observe' | 'blocked';

export interface GateRun {
  /** The npm script or job that produced this. Empty means no gate exists. */
  gate: string;
  /**
   * The artifact the gate actually ran against — a commit sha, a corpus id, a
   * deployment id. A18 in one field: a run against something ELSE is not
   * evidence for this thing, however green it was.
   */
  ranAgainst: string;
  outcome: GateOutcome;
  /**
   * Does the gate cover the WHOLE claim, or a part of it?
   *
   * False is the honest default for most gates and is what separates `live`
   * from `soft-live`. `check:zk-cost` proves the hash counts are optimal; it
   * proves nothing about Poseidon2, because no scheme executes. That surface is
   * verified AND partial, which is exactly soft-live.
   */
  coversWholeClaim: boolean;
  /** True when the gate observes and reports but cannot fail the build. */
  gatesTheBuild: boolean;
  detail: string;
  /**
   * WHO produced the artifact and WHO checked it.
   *
   * Optional, and absent on every gate in this repo today — which is the point:
   * absence resolves to NOT_CHECKED, never to "someone independent looked".
   * `verifier-independence.ts` holds the decision; this field is the record it
   * decides over.
   *
   * The unit is the TRAINING LINEAGE, not the API vendor. Two models from one
   * lineage agreeing is one opinion stated twice — the reasoning
   * `lib/trust/cross-llm-verifier.ts` already applies when it pairs a Llama
   * model with a GPT one behind a single provider.
   */
  attribution?: {
    authoredBy?: { family: string; model?: string; provider?: string };
    verifiedBy?: { family: string; model?: string; provider?: string };
  };
}

export interface SurfaceClaim {
  /** What is being claimed, in the terms the table will show. */
  surface: string;
  /** The artifact this claim is about — compared against every run's `ranAgainst`. */
  artifact: string;
  runs: readonly GateRun[];
}

export class StageAsserted extends Error {
  constructor(surface: string) {
    super(
      `refusing an asserted stage for "${surface}": a stage is DERIVED from gate runs, ` +
        'never supplied. A18 is a green tick that described something else — the only ' +
        'defence is that nothing can write the tick directly.'
    );
    this.name = 'StageAsserted';
  }
}

/**
 * Runs that are evidence FOR THIS ARTIFACT.
 *
 * A run against a different artifact is discarded rather than downgraded. This
 * is the A18 case exactly: the checks on that PR were real runs with real green
 * results, against `refs/pull/N/merge` for a merge that did not exist.
 */
export function evidenceFor(claim: SurfaceClaim): GateRun[] {
  return claim.runs.filter((r) => r.gate.length > 0 && r.ranAgainst === claim.artifact);
}

/** Runs that exist but describe something else. Reported, never counted. */
export function staleEvidence(claim: SurfaceClaim): GateRun[] {
  return claim.runs.filter((r) => r.gate.length > 0 && r.ranAgainst !== claim.artifact);
}

/**
 * The stage this claim has EARNED, or null for NOT CHECKED.
 *
 * Null is a first-class answer. Returning `observe` for an unmeasured surface
 * would put it in the table looking like a deliberate posture.
 */
export function stageFor(claim: SurfaceClaim): Stage | null {
  const runs = evidenceFor(claim);
  if (runs.length === 0) return null;

  // A failure anywhere blocks, regardless of what else passed. The floor, not
  // the ceiling — the same rule `checkReceipt` takes across its parts.
  if (runs.some((r) => r.outcome === 'FAILED')) return 'blocked';

  // Anything still NOT_CHECKED means the claim is not fully evidenced.
  if (runs.some((r) => r.outcome === 'NOT_CHECKED')) return 'observe';

  const gating = runs.filter((r) => r.gatesTheBuild);
  if (gating.length === 0) return 'observe';

  return gating.every((r) => r.coversWholeClaim) ? 'live' : 'soft-live';
}

export interface StageReport {
  surface: string;
  artifact: string;
  /** null renders as NOT CHECKED. */
  stage: Stage | null;
  outcome: GateOutcome;
  gates: string[];
  /** Non-empty when runs exist that describe a DIFFERENT artifact. The A18 tell. */
  staleGates: string[];
  reason: string;
}

export function report(claim: SurfaceClaim): StageReport {
  const stage = stageFor(claim);
  const runs = evidenceFor(claim);
  const stale = staleEvidence(claim);
  const outcome: GateOutcome =
    stage === null ? 'NOT_CHECKED' : stage === 'blocked' ? 'FAILED' : 'VERIFIED';

  const reason =
    stage === null
      ? stale.length > 0
        ? `NOT CHECKED — ${stale.length} run(s) exist but describe another artifact ` +
          `(${stale.map((s) => s.ranAgainst).join(', ')}), not ${claim.artifact}`
        : 'NOT CHECKED — no gate ran against this artifact'
      : stage === 'blocked'
        ? runs.find((r) => r.outcome === 'FAILED')!.detail
        : stage === 'observe'
          ? runs.some((r) => r.outcome === 'NOT_CHECKED')
            ? 'a gate ran but could not complete its check'
            : 'gates run and report, none can fail the build'
          : stage === 'soft-live'
            ? 'gated and passing, but the gate does not cover the whole claim'
            : 'gated, passing, and the gate covers the claim';

  return {
    surface: claim.surface,
    artifact: claim.artifact,
    stage,
    outcome,
    gates: runs.map((r) => r.gate),
    staleGates: stale.map((r) => r.gate),
    reason,
  };
}

/**
 * May this claim be promoted to `live`?
 *
 * Separate from `stageFor` because promotion is the moment the mistake gets
 * made. It answers with the reason it cannot, so the answer is actionable
 * rather than a refusal.
 */
export function canPromoteToLive(claim: SurfaceClaim): { ok: boolean; blockers: string[] } {
  const blockers: string[] = [];
  const runs = evidenceFor(claim);

  if (runs.length === 0) blockers.push('no gate has run against this artifact');
  if (runs.some((r) => r.outcome === 'FAILED')) blockers.push('a gate FAILED');
  if (runs.some((r) => r.outcome === 'NOT_CHECKED')) blockers.push('a gate reported NOT_CHECKED');
  if (runs.length > 0 && !runs.some((r) => r.gatesTheBuild))
    blockers.push('no gate can fail the build — observation is not enforcement');
  if (runs.some((r) => r.gatesTheBuild && !r.coversWholeClaim))
    blockers.push('a gating check covers only part of the claim (soft-live)');

  // The grader must not be the author. Nothing in this repo satisfies this yet —
  // no gate records attribution — so promotion to `live` is blocked on it by
  // design, and the blocker names what is missing rather than what is wrong.
  if (runs.length > 0 && independentEvidenceFor(claim).length === 0) {
    const selfChecked = selfVerifiedEvidence(claim).length;
    blockers.push(
      selfChecked > 0
        ? `${selfChecked} run(s) were verified by the SAME training lineage that authored the ` +
          'artifact — one opinion stated twice is not a second opinion'
        : 'no run records a verifier disjoint from the author; unattributed evidence is not ' +
          'independent evidence'
    );
  }

  const stale = staleEvidence(claim);
  if (stale.length > 0)
    blockers.push(
      `${stale.length} run(s) describe a different artifact and were not counted — ` +
        'this is the A18 shape; confirm the gate ran against what is being promoted'
    );

  return { ok: blockers.length === 0, blockers };
}

/**
 * Runs whose VERIFIER is from a different training lineage than the author.
 *
 * Deliberately NOT folded into `stageFor`. Doing that would re-grade every
 * existing claim as blocked in one commit, and a gate that turns everything red
 * teaches people to ignore it. Independence tightens PROMOTION — the moment the
 * mistake actually gets made — and is REPORTED everywhere else.
 *
 * A run with no attribution does not count. That is the load-bearing case:
 * unattributed is the default state of every gate here today, and reading
 * "nobody recorded who checked this" as "someone independent did" is the exact
 * substitution this module exists to refuse.
 */
export function independentEvidenceFor(claim: SurfaceClaim): GateRun[] {
  return evidenceFor(claim).filter((r) => {
    const a = r.attribution?.authoredBy;
    const v = r.attribution?.verifiedBy;
    if (!a || !v) return false;
    if (a.family === 'unknown' || v.family === 'unknown') return false;
    return a.family !== v.family;
  });
}

/** Runs that were checked by the SAME lineage that authored them. Reported. */
export function selfVerifiedEvidence(claim: SurfaceClaim): GateRun[] {
  return evidenceFor(claim).filter((r) => {
    const a = r.attribution?.authoredBy;
    const v = r.attribution?.verifiedBy;
    return !!a && !!v && a.family === v.family;
  });
}

/** Render the DoD table. Ordered worst-first: the rows needing work read first. */
export function statusTable(claims: readonly SurfaceClaim[]): StageReport[] {
  const rank: Record<string, number> = { blocked: 0, NOT_CHECKED: 1, observe: 2, 'soft-live': 3, live: 4 };
  return claims
    .map(report)
    .sort((a, b) => (rank[a.stage ?? 'NOT_CHECKED'] ?? 1) - (rank[b.stage ?? 'NOT_CHECKED'] ?? 1));
}
