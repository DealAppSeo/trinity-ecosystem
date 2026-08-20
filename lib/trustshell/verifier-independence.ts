// lib/trustshell/verifier-independence.ts
//
// Is the grader disjoint from the author?
//
// ZERO IMPORTS. This decides whether a piece of evidence counts, and evidence
// that cannot be checked standalone is the thing this whole harness exists to
// refuse.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// On 2026-08-19 the implementation lane authored GA's two contract files, then
// ran the harness that graded them. Both rows went SOFT-LIVE. That was measured
// honestly — the assertion count did not move, proving the gate was empty — but
// the deeper problem survived the fix: after content gates were added, the
// author of the artifacts was still the author of the gates.
//
// Grading `docs/contracts/*.json` against `authority-policy.v0.5.yaml` was the
// mitigation, and it is a real one: a transcription error now fails the build.
// But it is a FLOOR, not independence. One process, one model, one set of blind
// spots. It catches drift between two artifacts; it cannot catch a wrong
// assumption both artifacts share, and it cannot ask whether the contract is the
// right contract.
//
// ── FAMILY, NOT VENDOR ──────────────────────────────────────────────────────
//
// `lib/trust/cross-llm-verifier.ts` already got this right and its reasoning is
// adopted here verbatim: it pairs `llama-3.1-8b-instant` with `gpt-oss-20b`
// specifically for **training-data diversity**, and records that both run behind
// one provider — "provider redundancy is reduced; training-data diversity is
// preserved".
//
// So the unit of independence is the TRAINING LINEAGE, not the API you bought it
// through. Two models from one lineage agreeing is one opinion stated twice.
// Shared infrastructure is a weaker, separate concern: it is a correlated
// AVAILABILITY risk rather than a correlated JUDGEMENT risk, so it is reported
// rather than disqualifying.
//
// ── WHAT IS NOT CLAIMED ─────────────────────────────────────────────────────
//
// **No second family runs today.** This module is the seam and the refusal — it
// decides what would count. Actually obtaining a disjoint verdict needs
// credentials and network, and where those are absent the answer is NOT_CHECKED,
// never a pass. A seam that silently self-satisfied would be a worse version of
// the problem it was built for.

/**
 * A training lineage. Deliberately coarse — the question is "would these two
 * make the same mistake", and fine-grained versions of one lineage would not.
 */
export type ModelFamily =
  | 'claude'
  | 'gpt'
  | 'llama'
  | 'gemini'
  | 'mistral'
  | 'qwen'
  | 'deepseek'
  | 'grok'
  | 'human'
  | 'unknown';

export interface Attribution {
  /** The lineage. `unknown` never counts as disjoint from anything. */
  family: ModelFamily;
  /** Specific model, for the record. Not used for the disjointness decision. */
  model?: string;
  /** API vendor. Shared providers are REPORTED, never disqualifying. */
  provider?: string;
}

export type Independence =
  /** Different lineages. This is the only value that lets evidence count. */
  | 'DISJOINT'
  /** Same lineage — one opinion stated twice. */
  | 'SHARED_FAMILY'
  /** Attribution is missing or unknown. Not a pass. */
  | 'NOT_CHECKED';

export interface IndependenceVerdict {
  independence: Independence;
  /** True when families differ but the API vendor does not. Reported, not fatal. */
  sharedProvider: boolean;
  /** True only for DISJOINT. Nothing else may be counted as independent evidence. */
  counts: boolean;
  detail: string;
}

/**
 * May a verdict from `verifier` count as independent evidence about work by
 * `author`?
 *
 * `unknown` on either side yields NOT_CHECKED. That is the load-bearing case: an
 * unattributed verdict is the default state of every gate in this repo today,
 * and treating "we did not record who checked this" as "someone independent
 * checked this" is precisely the substitution the harness exists to prevent.
 */
export function assessIndependence(
  author: Attribution | null | undefined,
  verifier: Attribution | null | undefined
): IndependenceVerdict {
  const sharedProvider =
    !!author?.provider && !!verifier?.provider && author.provider === verifier.provider;

  if (!author || !verifier || author.family === 'unknown' || verifier.family === 'unknown') {
    return {
      independence: 'NOT_CHECKED',
      sharedProvider,
      counts: false,
      detail:
        'attribution is missing or unknown on at least one side — an unattributed verdict is ' +
        'not an independent one, and "nobody recorded who checked" must not read as "someone did"',
    };
  }

  if (author.family === verifier.family) {
    return {
      independence: 'SHARED_FAMILY',
      sharedProvider,
      counts: false,
      detail:
        `both sides are ${author.family} — two models from one training lineage agreeing is ` +
        'one opinion stated twice, not a second opinion',
    };
  }

  return {
    independence: 'DISJOINT',
    sharedProvider,
    counts: true,
    detail:
      `${author.family} authored, ${verifier.family} verified` +
      (sharedProvider
        ? ` — NOTE: both behind provider "${author.provider}". Training lineages differ, so the ` +
          'judgement is independent; the availability is not.'
        : ''),
  };
}

/**
 * The strongest independent verdict among several verifiers.
 *
 * Returns NOT_CHECKED when none is disjoint. Takes the best rather than a
 * majority on purpose: this answers "did anyone independent look", which is a
 * different question from "did they agree", and conflating them would let a
 * panel of same-family verifiers outvote the one disjoint dissenter.
 */
export function bestIndependence(
  author: Attribution | null | undefined,
  verifiers: readonly (Attribution | null | undefined)[]
): IndependenceVerdict {
  const verdicts = verifiers.map((v) => assessIndependence(author, v));
  const disjoint = verdicts.find((v) => v.independence === 'DISJOINT');
  if (disjoint) return disjoint;
  const shared = verdicts.find((v) => v.independence === 'SHARED_FAMILY');
  if (shared) return shared;
  return (
    verdicts[0] ?? {
      independence: 'NOT_CHECKED',
      sharedProvider: false,
      counts: false,
      detail: 'no verifier was supplied',
    }
  );
}

/** Families that actually produced a verdict. For the record line, not the decision. */
export function familiesInvolved(
  author: Attribution | null | undefined,
  verifiers: readonly (Attribution | null | undefined)[]
): ModelFamily[] {
  const set = new Set<ModelFamily>();
  if (author?.family) set.add(author.family);
  for (const v of verifiers) if (v?.family) set.add(v.family);
  return [...set].sort();
}
