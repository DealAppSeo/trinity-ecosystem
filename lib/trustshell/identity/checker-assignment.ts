// checker-assignment.ts — the examinee may not pick the judge.
//
// ── THE HOLE THIS CLOSES ─────────────────────────────────────────────────────
//
// `checker_must_not_be_doer` stops an agent grading itself. It does not stop an
// agent **choosing** its grader: `proposeContract` is called by the doer, and
// the unsigned contract it signs already names `checkerDid`. Every signature in
// a shopped contract verifies. Under models trained to optimise their own
// scaffold, picking a lenient judge is a higher-yield strategy than writing
// better code.
//
// ── THE PRECEDENT, AND WHY IT IS THE RIGHT ONE ───────────────────────────────
//
// After the 2008 mortgage crisis, US appraisal ordering was restructured for
// exactly this failure. A broker or lender could previously choose the
// appraiser, which produced the "MAI appraisal" — Made As Instructed. The fix
// was not better appraisers or stricter rules about influence. It was
// STRUCTURAL: the request goes to a queue that draws from a panel of qualified
// appraisers, and the party with an interest in the number does not get to pick
// who produces it.
//
// The load-bearing detail is that the draw is **random within a qualified
// pool**, not "best available". That distinction is the whole mechanism:
//
//   * QUALIFICATION IS A FILTER. Tier, expertise, licence — a predicate that
//     answers yes or no, applied before the draw.
//   * SELECTION IS UNIFORM. Never "nearest", "fastest", or "highest score".
//
// **Any preference ordering is a bias channel.** If the draw prefers the
// fastest, an examinee that controls when it submits controls who is free; if
// it prefers the nearest, it steers by choosing where to run; if it prefers the
// highest reputation, the top checker becomes predictable and therefore
// groomable. Ranking may DEFINE the pool — "top tier only" is a legitimate
// filter — but it must never PICK inside it. Reintroducing preference at the
// selection step reintroduces the conflict of interest the panel exists to
// remove.
//
// ── WHY A COMMITMENT AND A BEACON, RATHER THAN Math.random() ─────────────────
//
// A random pick nobody can recompute is indistinguishable from a chosen one. A
// third party holding the result must be able to redo the draw and get the same
// answer, or "randomly assigned" is a claim rather than a property. So the draw
// is DETERMINISTIC given public inputs, and unpredictable to both parties:
//
//     seed  = H(requestCommitment ‖ beacon ‖ poolCommitment)
//     index = uniform(seed, pool.length)
//
// Two grinding attacks, and how the ordering defeats both:
//
//   * THE DOER GRINDS ITS INPUTS. Vary `taskId` or a nonce, recompute, keep the
//     draw that lands on a friendly checker. Defeated because the doer must fix
//     `requestCommitment` BEFORE the beacon exists — with the beacon unknown,
//     every candidate commitment is a blind draw.
//   * THE ASSIGNER RE-DRAWS. Run it again until a preferred name appears.
//     Defeated because nothing is free: seed is fully determined by three
//     committed values, so re-running returns the same checker forever.
//
// **The beacon is what supplies ordering, and this file is the first place in
// the repo that has any.** `work-contract.ts` states plainly that signatures
// carry no ordering and a backdated timestamp is the same bytes. A commitment
// that feeds a beacon which did not exist when it was made is evidence of
// sequence that a signature cannot give. The beacon is therefore load-bearing
// and NOT decorative: pass a value nobody in the transaction controls (a
// drand round, a block hash, an epoch digest). See `verifyAssignment` — this
// module cannot check that for you, and says so rather than pretending.
//
// ── WHAT IS DELIBERATELY NOT HERE ────────────────────────────────────────────
//
// No zero-knowledge membership proof. `buildGroup` in `nullifier.ts` builds a
// Merkle tree, but only over `IBindingScheme`, whose sole implementation throws
// `MISSING_PARAMETERS` pending Poseidon2 from the other lane. It would also
// solve a problem we do not have: an appraiser panel is public on purpose, and
// a pool nobody can see is a pool nobody can audit. The zk upgrade belongs to
// the case where a checker proves *"I hold a tier-3 security badge"* without
// revealing which checker it is — that is a zkRepID feature, and it needs the
// parameters.
//
// No marketplace, no pricing, no queue. Those are policy on top of a draw. The
// draw is the part that must be right first, because a marketplace over a
// biased draw launders the bias.

import type { Did } from './did';

export const ASSIGNMENT_DOMAIN = 'zkrepid:checker-assignment:v1';

const TAG = {
  request: `${ASSIGNMENT_DOMAIN}:request`,
  pool: `${ASSIGNMENT_DOMAIN}:pool`,
  seed: `${ASSIGNMENT_DOMAIN}:seed`,
  draw: `${ASSIGNMENT_DOMAIN}:draw`,
} as const;

/** Field separator. Escape, never a raw byte — see work-contract.ts. */
const SEP = '\u001f';

/**
 * A pool smaller than this is not an assignment, it is a named checker wearing
 * a lottery's clothes.
 *
 * The same reasoning as `MIN_MEANINGFUL_GROUP` in `nullifier.ts`, on a
 * different axis: there, a root over one commitment identifies the holder
 * exactly; here, a draw from one candidate identifies the checker exactly. Both
 * are "the mechanism ran and proved nothing".
 */
export const MIN_MEANINGFUL_POOL = 2;

/** What a candidate must show to be eligible. Ranking may define this; never the pick. */
export interface Qualification {
  /** zkRepID tier. Higher is more trusted; the requirement is a floor. */
  tier: number;
  /**
   * Expertise credentials — `security-audit`, `pen-test`, `solvency`.
   *
   * Held as opaque strings on purpose. This module decides ELIGIBILITY, not
   * what a badge means or who may issue one; conflating the two would put
   * credential policy inside a draw.
   */
  badges: readonly string[];
}

export interface CheckerCandidate {
  did: Did;
  qualification: Qualification;
}

export interface QualificationRequirement {
  /** Minimum tier. A risk-adjusted job demands a higher floor. */
  minTier: number;
  /** Every badge here must be held. Empty means expertise is not required. */
  requiredBadges: readonly string[];
}

// ---------------------------------------------------------------------------

async function digestHex(value: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(d))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function refuseSeparator(name: string, value: string): void {
  if (value.includes(SEP)) {
    throw new Error(
      `${name} contains the field separator (U+001F), which would let two different ` +
        'inputs produce one commitment'
    );
  }
}

/**
 * What the doer commits to BEFORE the beacon exists.
 *
 * `nonce` is the doer's own; it is not secret and does not need to be. It
 * exists so two identical tasks do not collapse to one commitment and therefore
 * one checker.
 */
export async function commitAssignmentRequest(input: {
  taskId: string;
  doerDid: Did;
  /** Binds the assignment to the criteria, so the exam cannot change after the draw. */
  criteriaHash: string;
  requirement: QualificationRequirement;
  nonce: string;
}): Promise<string> {
  const fields = [
    TAG.request,
    input.taskId,
    input.doerDid,
    input.criteriaHash,
    String(input.requirement.minTier),
    [...input.requirement.requiredBadges].sort().join(','),
    input.nonce,
  ];
  fields.forEach((f, i) => refuseSeparator(`request field ${i}`, f));
  return `sha256:${await digestHex(fields.join(SEP))}`;
}

export interface EligiblePool {
  /** Canonically ordered — sorted by DID, so the pool is order-independent. */
  pool: readonly CheckerCandidate[];
  /** Who was dropped and why. Auditable rather than silent. */
  excluded: readonly { did: Did; reason: string }[];
}

/**
 * Filter to the qualified, then order canonically.
 *
 * THE DOER IS REMOVED HERE, BEFORE THE DRAW, not after. Excluding a drawn
 * checker and re-drawing would skew the distribution toward whoever follows the
 * doer in the ordering, which is a bias with a signature on it.
 */
export function eligiblePool(input: {
  candidates: readonly CheckerCandidate[];
  requirement: QualificationRequirement;
  /** Excluded unconditionally. `checker_must_not_be_doer`, applied at selection. */
  doerDid: Did;
}): EligiblePool {
  const excluded: { did: Did; reason: string }[] = [];
  const pool: CheckerCandidate[] = [];

  for (const c of input.candidates) {
    if (c.did.trim() === input.doerDid.trim()) {
      excluded.push({ did: c.did, reason: 'is the doer' });
      continue;
    }
    if (c.qualification.tier < input.requirement.minTier) {
      excluded.push({
        did: c.did,
        reason: `tier ${c.qualification.tier} is below the required ${input.requirement.minTier}`,
      });
      continue;
    }
    const held = new Set(c.qualification.badges);
    const missing = input.requirement.requiredBadges.filter((b) => !held.has(b));
    if (missing.length > 0) {
      excluded.push({ did: c.did, reason: `lacks ${missing.join(', ')}` });
      continue;
    }
    pool.push(c);
  }

  pool.sort((a, b) => (a.did < b.did ? -1 : a.did > b.did ? 1 : 0));
  return { pool, excluded };
}

/** Commit to exactly the pool that was drawn from, so it cannot change after the fact. */
export async function commitPool(pool: readonly CheckerCandidate[]): Promise<string> {
  const fields = [TAG.pool, String(pool.length), ...pool.map((c) => c.did)];
  fields.forEach((f, i) => refuseSeparator(`pool field ${i}`, f));
  return `sha256:${await digestHex(fields.join(SEP))}`;
}

/**
 * A uniform index, by rejection sampling rather than modulo.
 *
 * `seed % n` is biased whenever `n` does not divide 2^32: the low indices get
 * one extra chance each. Values at or above the largest multiple of `n` are
 * rejected and the counter advances.
 *
 * HOW BIG IS THE BIAS WE ARE REMOVING — measured, because an unquantified
 * defence is decoration. 2^32 = 4,294,967,296. For a 5-member panel the
 * remainder is 1, so one value in 4.29 BILLION is the excess: a relative tilt
 * of ~2e-10. Even a 1,000-member panel leaves a remainder of 296, a tilt of
 * ~7e-8.
 *
 * **So `check:checker-assignment` does NOT detect this, and cannot.** Swapping
 * this for plain modulo leaves the whole suite green — verified by mutation
 * 2026-08-15. It is kept anyway, for two honest reasons: it costs one
 * comparison, and it makes the draw provably uniform BY READING rather than
 * by sampling, which is what an auditor of a fairness claim actually wants.
 * The bias only becomes measurable at pool sizes we will never reach, and a
 * defence that only pays at scale is still cheaper than the day it does.
 */
async function uniformIndex(seed: string, n: number): Promise<{ index: number; rejected: number }> {
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  for (let counter = 0; counter < 64; counter += 1) {
    const hex = await digestHex(`${TAG.draw}${SEP}${seed}${SEP}${counter}`);
    const v = Number.parseInt(hex.slice(0, 8), 16);
    if (v < limit) return { index: v % n, rejected: counter };
  }
  // 64 consecutive rejections is astronomically improbable; refusing beats
  // silently falling back to a biased modulo.
  throw new Error(`could not draw a uniform index over ${n} candidates in 64 attempts`);
}

export interface AssignmentProof {
  version: typeof ASSIGNMENT_DOMAIN;
  requestCommitment: string;
  /** Public randomness neither party controls. See the header. */
  beacon: string;
  poolCommitment: string;
  poolSize: number;
  seed: string;
  index: number;
  checkerDid: Did;
}

/**
 * Draw the checker. Deterministic, and recomputable by anyone.
 *
 * Refuses a pool below `MIN_MEANINGFUL_POOL`, and refuses an empty beacon —
 * with no beacon the seed is a function of values the doer already knows, which
 * is exactly the grinding attack the beacon exists to stop.
 */
export async function assignChecker(input: {
  requestCommitment: string;
  beacon: string;
  pool: readonly CheckerCandidate[];
}): Promise<AssignmentProof> {
  const { requestCommitment, beacon, pool } = input;

  if (beacon.trim() === '') {
    throw new Error(
      'refusing to draw with an empty beacon. Without public randomness the seed is a ' +
        'function of values the doer chose, so it can grind its commitment until a ' +
        'friendly checker comes up — the attack this module exists to prevent.'
    );
  }
  if (pool.length < MIN_MEANINGFUL_POOL) {
    throw new Error(
      `refusing to draw from a pool of ${pool.length}. Below ${MIN_MEANINGFUL_POOL} the ` +
        'result is a named checker wearing a lottery\'s clothes, and reporting it as ' +
        '"randomly assigned" would be false.'
    );
  }

  const poolCommitment = await commitPool(pool);
  refuseSeparator('requestCommitment', requestCommitment);
  refuseSeparator('beacon', beacon);

  const seed = `sha256:${await digestHex([TAG.seed, requestCommitment, beacon, poolCommitment].join(SEP))}`;
  const { index } = await uniformIndex(seed, pool.length);

  return {
    version: ASSIGNMENT_DOMAIN,
    requestCommitment,
    beacon,
    poolCommitment,
    poolSize: pool.length,
    seed,
    index,
    checkerDid: pool[index].did,
  };
}

export interface AssignmentVerification {
  outcome: 'VERIFIED' | 'NOT_CHECKED' | 'FAILED';
  /** Whether the draw recomputes to the same checker. */
  drawReproduced: boolean;
  /** Whether the supplied pool is the pool that was committed to. */
  poolMatches: boolean;
  detail: string;
}

/**
 * Recompute the draw from the pool a verifier holds.
 *
 * WHAT THIS CANNOT TELL YOU, and it is the honest limit: **it cannot know
 * whether the beacon was genuinely unpredictable.** A caller that passes its
 * own chosen string gets a proof that verifies and means nothing. Beacon
 * provenance — a drand round, a block hash — is an input to this design, not an
 * output of it, and treating a reproducible draw as a fair one without checking
 * where the beacon came from is the mistake this note exists to prevent.
 */
export async function verifyAssignment(input: {
  proof: AssignmentProof;
  pool: readonly CheckerCandidate[];
}): Promise<AssignmentVerification> {
  const { proof, pool } = input;

  if (proof.version !== ASSIGNMENT_DOMAIN) {
    return {
      outcome: 'NOT_CHECKED',
      drawReproduced: false,
      poolMatches: false,
      detail: `unknown assignment version ${JSON.stringify(proof.version)}`,
    };
  }

  const poolCommitment = await commitPool(pool);
  const poolMatches = poolCommitment === proof.poolCommitment && pool.length === proof.poolSize;
  if (!poolMatches) {
    return {
      outcome: 'FAILED',
      drawReproduced: false,
      poolMatches: false,
      detail:
        'the pool supplied is not the pool that was drawn from, so the draw cannot be ' +
        'rechecked — a changed panel is how a shopped checker is made to look assigned',
    };
  }

  const seed = `sha256:${await digestHex([TAG.seed, proof.requestCommitment, proof.beacon, proof.poolCommitment].join(SEP))}`;
  const { index } = await uniformIndex(seed, pool.length);
  const drawReproduced =
    seed === proof.seed && index === proof.index && pool[index].did === proof.checkerDid;

  if (!drawReproduced) {
    return {
      outcome: 'FAILED',
      drawReproduced: false,
      poolMatches: true,
      detail: `the draw does not reproduce: this pool and beacon select ${pool[index].did}, not ${proof.checkerDid}`,
    };
  }

  return {
    outcome: 'VERIFIED',
    drawReproduced: true,
    poolMatches: true,
    detail:
      `${proof.checkerDid} is index ${index} of ${pool.length} under this beacon. ` +
      'Whether the beacon itself was unpredictable is NOT CHECKED here.',
  };
}
