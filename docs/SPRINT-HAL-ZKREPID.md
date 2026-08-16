# HAL + zkRepID sprint loop

**Read `docs/PRIOR-WORK-INDEX.md` first.** This file is the *backlog*; the index
is the record of what is already closed and which numbers are retracted.

Standing shape of each sprint, because both of this branch's worst findings came
from skipping step 1:

1. **Measure the ceiling / the population before tuning toward it.** Compute what
   the system *can* do before optimising. Two of the three RepID defects were
   invisible until something was simulated rather than reasoned about.
2. **Drive the production module, never a reimplementation.** Every sim in
   `scripts/sim/` compiles the real `.ts` and calls it. A sim of a copy proves
   nothing about production.
3. **Turn each finding into a gate that can go red on its own.** A measurement in
   a commit message rots. `check:repid-calibration` flipped NOT_CHECKED →
   VERIFIED with no edit when the fix landed; that is the shape to copy.
4. **Report NOT_CHECKED for anything blocked on an operator decision.** A gate
   that fails the build over a pending product call makes the build permanently
   red, which is how a gate gets ignored.

---

## CLOSED this sprint (all measured, all in the index)

| finding | how it was found |
|---|---|
| The RepID gate never OPENED — flawless agent 4008 vs threshold 5000 | computing the ceiling |
| The gate then never CLOSED — a weak fleet was 99% Platinum | population simulation |
| Silver cost 2.16% of maximum; the self-asserted custody flag alone cleared it | adversarial sim |
| `weightedSumRequiredFor(2500)` returned a sum scoring **2499** | round-trip over the whole domain |
| The coherence check graded a threshold the gate does not use (`??` vs `||`) | reading two call sites against each other |
| A negative stored threshold opened the payment gate for everyone | live column inspection (no CHECK constraint) |
| `verifyHalChain` had only ever run on its own fixtures | driving it over live rows |
| The mutation gate was green over a set excluding all new code | reading the manifest against the diff |

---

## Sprint C — HAL, open

**C1. The producer's hash formula is still unknown.** 568 constructions tried
against a real adjacent pair; none reproduced a stored link. Until it is supplied
the chain is NOT_CHECKED and `EntryHasher` stays a port. **Blocked** on the
Trinity fleet / repid-engine lane. *Do not brute-force further without a new
idea* — 568 attempts is already evidence that guessing is the wrong method.

**C2. HAL vetoes TRUE claims about internals** — settled fact, reproduced 4/4,
recorded in `settled_facts_DO_NOT_REPEAT`. **Do not re-derive it.** The open
question is whether that false-positive mode propagates into RepID:
`veritasCatchRate` is `measureRate(bySignal('integrity'))`, so the linkage runs
through observation rows rather than directly from HAL. **NOT ESTABLISHED** —
trace it before claiming it. If it holds, agents doing internal work are
systematically under-scored, which is a cross-cutting HAL↔RepID defect.

**C3. No table records fact-check quorum vetoes.** `hal_quorum_receipts` and
`hal_quorum_validator_votes` do not exist though a writer targets them (settled).
So the veto rate is unmeasurable from here — any claim about it is UNVERIFIABLE,
not zero.

---

## Sprint D — zkRepID, open

**D1. Two score lineages that never reconcile. HIGHEST VALUE, and it gets worse
with use.** `RepIDCalculator.calculate()` computes fresh from EarnedMetrics and
drives the payment decision; `agent_kya_registry.repid_score` is only ever nudged
`stored + delta` by `updateRepID` and is never recomputed from metrics. After the
57200/0.5 recalibration the stored scores sit on the OLD scale and computed ones
on the new, diverging ±10 per payment. Reconciling changes spending limits →
**Sean-gated**. See `v_repid_tier_drift` (changelog #140).

**D2. Stored tier ≠ stored score for 9 of 12 agents.** All drift is in the safe
direction; `updateRepID` cannot produce new drift. Legacy rows. Fixing them
raises limits → **Sean-gated**. Subsumed by D1 if D1 is done properly.

**D3. 21,965 ZK proofs assert `is_real` over a stub score.** Writer is in
repid-engine, outside this repo's push scope → **BLOCKED_FOR_SEAN**. Read
`v_repid_proof_claim_integrity` (changelog #139), **not**
`v_repid_proof_score_audit`, which buckets on score alone and reports a
misleading 99.7%.

**D4. The marginal-value inversion is unresolved.** +0.01 of real improvement was
worth 880 points at the bottom of the range and 0 at the top under 5000/100.
Re-measure under 57200/0.5 — the reshaped curve should have reduced it, but that
is a prediction, not a measurement. `scripts/sim/repid-adversarial.mjs` prints it.

**D5. `humanCustody` is still self-asserted.** Option B made the flag alone
insufficient for Silver, which removes the free ride but not the underlying
issue: nothing in this repo verifies the KYA-registry boolean. Gate it behind
verification, or accept it explicitly.

---

## Sprint E — the structural one, deliberately deferred

**E1. Make `scripts/mutations.mjs` discovery-based**, the way `npm run check`
discovers `check:*`. Both merge conflicts on 2026-08-16 were the tail of that one
shared array — LESSONS A17 in a different file. **Do it when main is quiet**;
rewriting the manifest while other lanes have open PRs against it causes exactly
the conflict it fixes.

---

## Running the sims

```
node scripts/sim/repid-adversarial.mjs    # cheapest path to each gate, marginal value
node scripts/sim/repid-calibration.mjs    # can the ladder discriminate; solves for floors
npm run check:repid-calibration           # the gate; 0 VERIFIED / 2 NOT_CHECKED
```

Both sims are **deterministic** — an LCG, never `Math.random`. A sim whose answer
changes between runs cannot be a gate, and the mutation runner would score it as
flaky rather than as evidence.

**A negative result is only as wide as the grid that produced it.** The Option B
search first reported "the log form cannot separate these populations"; the grid
capped the multiplier at 12,000 and the answer was 57,200. Anything reporting
IMPOSSIBLE must show it looked where the answer is.
