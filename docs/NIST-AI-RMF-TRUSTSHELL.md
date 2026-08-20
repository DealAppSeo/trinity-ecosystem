# NIST AI RMF ↔ TrustShell — the agent as a delegated authority

Written 2026-08-19. Item C of the same instruction that produced items A/B/D/E
on `claude/v1-spine-authority-collateral`. **Docs only — no behavior change in
this commit or this doc.** It maps controls that already exist (or are
explicitly specified and not yet wired) to the NIST AI Risk Management
Framework's four functions. It does not add a control, and it does not grade
one higher than the rest of this repo's own evidence already supports —
Live / Soft-live / Observe / Blocked / NOT_CHECKED below is the same taxonomy
`lib/trustshell/promotion.ts` uses everywhere else, applied to compliance
mapping rather than invented for it.

**Framing.** NIST AI RMF 1.0 was written for an AI *system* someone deploys
and monitors. The harness in this repo is closer to a **delegated authority**:
something acted on someone's behalf, spent something, or changed a durable
score, and RMF's four functions (Govern / Map / Measure / Manage) turn out to
be a reasonable checklist for "what has to be true before you let that
happen" — not a new design, a lens on the one already built. Where this repo's
own vocabulary differs from RMF's, both names are given rather than replacing
one with the other: **Goertzel's** promote/park/reject evaluation ecology and
multi-axis Π *is* this repo's Measure/Manage loop, not a re-implementation of
it; **De Rossi's** portable identity and trust proportional to value at risk
*is* this repo's Govern layer. Neither is diluted into "the AI followed RMF" —
RMF is the outside vocabulary a reader who has never seen Π or A_eff can use
to find the same controls.

---

## GOVERN — who may act, and who is accountable for it

| control | mechanism | state | note |
|---|---|---|---|
| Portable, self-certifying identity | `lib/trustshell/identity/did.ts` — Ed25519 `did:key`, `generateKeyPair()`, `compareDids`/`sameDid` | **Live** | Needs no database or network to verify — the point of `did:key`. `check:identity`, `check:did-comparison`. |
| Signed cross-session accountability trail | `lib/trustshell/identity/handoff.ts` — `signHandoff()`/`verifyHandoff()`, `HANDOFF_DOMAIN` binds the signature to this protocol so it cannot be replayed as a different one | **Live** | `verifyHandoff` returns `{outcome, signatureValid, chainIntact, checkpoints, handoffHash, detail}` — never a bare boolean; a caller cannot collapse "signed" into "true". `check:handoff`, 25 assertions. |
| Grants are computed read-only, not declared read-only | `lib/trustshell/identity/auditor-grant.ts` | **Live** | A capability string (`read:*`) is opaque; whether it reaches a write depends on a tool→capability map that changes independently. This module searches the reachable tool set and returns the offending tools by name — a proof, not an assertion. `check:auditor-grant`. |
| Examinee may not pick judge or exam | `lib/trustshell/identity/checker-assignment.ts`, `criteria-draw.ts` | **Live** | Verifiable random draw from a committed pool/bank; the doer commits before the beacon exists. This is the accountability structure NIST calls "independent oversight of AI system risks" applied to the checker seat itself. `check:checker-assignment` (9/10 mutants killed), `check:criteria-draw` (10/10). |
| Cross-model verifier independence, by training lineage not vendor label | `lib/trustshell/verifier-independence.ts` | **Live seam / Observe in practice** | `Independence = 'DISJOINT' \| 'SHARED_FAMILY' \| 'NOT_CHECKED'`. The seam is exercised against a real claim (`scripts/exercise-promotion-attribution.mjs`, this branch): honest result is self-verified, `canPromoteToLive` refuses and names why. No gate in this repo today records a second, disjoint family's attribution — see item E. |
| Trust proportional to value at risk (De Rossi) | `lib/trustshell/authority-policy.ts` — `A_eff = min(R_route, M·√S_usd) · 1[builder≥floor]` | **Observe** | Computed on the live pay path (item 1, this branch); decides nothing yet because `S_usd` is NOT_CHECKED for every agent (see item A / `docs/PRIOR-WORK-INDEX.md` OPEN). Governance intent is real; enforcement is not turned on. |

## MAP — what could go wrong, named before it happens

| control | mechanism | state | note |
|---|---|---|---|
| Sybil / referral-farm attack surface is enumerated, not assumed away | `docs/policy/phase2-e2e-predicates.md` Suite R, `lib/trustshell/lane-files.ts` | **Mapped; partially Measured (see below)** | Named mutants: M4 unproven referral (no `evidence.ref`) forces δ=0; M5 a `test_only`-flagged referee does not increment `n` and forces δ=0; M6 same-family-or-self forces δ=0; M8 the reward lands on axis Q, not S, so a referral cannot buy spend authority directly. These are **specified in the locked policy doc**, not yet enforced by a running processor — see Manage. |
| A verdict cannot outrun the evidence that travels with it | `lib/trustshell/identity/handoff.ts` — `contradicted_by_evidence` vs `evidence_invalid` as distinct cap reasons | **Live** | Maps a broken citation and an overclaim to different, both-tested failure modes rather than one undifferentiated "can't verify". 25 assertions, 4/4 mutants killed. |
| Checker-shops-for-a-lenient-judge is named as a gap, not fixed by assumption | `docs/ORNITH-ASSESSMENT-2026-08-15.md` | **Mapped, Blocked** | `proposeContract` is called by the doer, who already names `checkerDid`; nothing today stops choosing a lenient one. The mirror image of the doer-exclusion guard that already exists. |
| Panel agreement is non-monotonic risk, not confidence | `lib/trust/bft-judge.ts` | **Live** | High agreement can mean coordinated bias, not consensus — the panel vetoes on agreement that is too *small*, inverting the naive reading. Named explicitly so "more models agreed" is never read as "safer". |

## MEASURE — what is actually known, kept separate from what is asserted

| control | mechanism | state | note |
|---|---|---|---|
| Promotion requires MEASURED evidence against a named incumbent | `lib/trustshell/promotion.ts` — `SurfaceClaim`/`GateRun`, `canPromoteToLive()`, `statusTable()` | **Live** | A `GateRun.outcome` is `NOT_CHECKED` unless something ran; `stageFor` will not let a passing run outvote a `NOT_CHECKED` one on the same claim. This is the module every row in this table (and the A-E status report) is graded through. |
| Referral curve is recomputed from its own formula, not asserted from a table | `lib/trustshell/lane-files.ts` — `decidableMutants()`, `referralDisagreements()` | **Live (M1–M3 only)** | `check:lane-files`, 32/32. M1 (delta(1)>delta(10)), M2 (delta(10)>delta(100)=0), M3 (delta(100)=0) are decidable from the formula alone. M4–M8 above need a real referral-event processor with `evidence.ref`, referee lifecycle status, and family/self relationship — **NOT_CHECKED**, and `lane-files.ts` says so of itself by design (zero-imports, cannot see those inputs), not by omission. |
| Phase-2 E2E suite status is a structured map, not a pass/fail badge | `scripts/check-phase2-predicate-status.mjs` (this branch, item 3) | **Live as a reporter** | 2 of 6 suite-groups (A, R-decidable) have a real gate; D/I/P/X/R-undecidable are honestly NOT_CHECKED with a named missing engine each — no suite is scored on prose. |
| An unreadable number is never silently read as zero | `lib/trustshell/collateral.ts` — `CollateralOutcome = 'MEASURED' \| 'NONE' \| 'NOT_CHECKED'`; `lib/trustshell/KYAValidator.ts` — `checkDailyLimit` | **Live** | `NONE` (real collateral is $0) and `NOT_CHECKED` (couldn't read the table) are different outcomes on purpose — a database outage must never grant a spend allowance by reading as an empty history. |
| HAL chain integrity is reported, not assumed from structural soundness | `lib/trustshell/hal-chain.ts` — `verifyHalChain` | **Observe** | 102,934+ links written since 2026-06-02, structurally sound; the verifier reports `NOT_CHECKED` without a real `EntryHasher`, never `VERIFIED` by default. Live-row run 2026-08-16 reached 9/9 VERIFIED under an oracle — proves the verifier, not the whole chain. |

## MANAGE — what happens under uncertainty, and who can turn enforcement on

| control | mechanism | state | note |
|---|---|---|---|
| Fail-closed spend on the live payment route | `lib/trustshell/pay-auth.ts` — `payAuthMode()`, `PAY_AUTH_MODE` | **Observe by design (constraint, not a gap)** | Defaults to `observe`: every verdict is computed and disclosed (`auth.wouldDenyUnderEnforcement`), nothing is denied, until `PAY_AUTH_MODE=enforce` — Sean's switch, not this branch's. Under enforcement, an unconfigured secret **denies** rather than open a door via a missing env var. This branch does not flip it; see the standing constraint in every A–E status report. |
| Reward has no per-receipt replay key yet | `lib/trustshell/reward.ts` | **Bounded, not Managed** | Withholds +10 unless consensus was evaluated *and* passed *and* settlement confirmed on-chain — the default configuration pays nothing. What remains open: no idempotency key per receipt, so N confirmed payments could become +10N if replayed. Named rather than papered over with an invented store. |
| Scoped, bounded agent execution | `lib/trustshell/harness/loop.ts` — `LoopPolicy.toolsAllowed`, `irreversibleRequiresHuman`, `maxWritesPerSession`, `requireIndependentEvaluation` (absent ⇒ **true**, fails closed) | **Live** | Exercised end-to-end this branch (item 4, `scripts/dogfood-improve-harness.mjs`): a real allowlist Authorizer under a real Ed25519 principal refused an out-of-policy tool call and the loop reported the downgrade rather than silently proceeding. |
| Staged evaluation: a cheap tier may condemn, never certify | `lib/trustshell/identity/staged-judge.ts` | **Live** | FAILED and REFERRAL are final at any tier; VERIFIED and NOT_CHECKED escalate. An outage escalates as NOT_CHECKED, explicitly **not** a referral, so infrastructure noise cannot inflate the measured referral rate. 11 assertions, 9/9 mutants killed. |
| Human-in-the-loop trigger on panel veto | `lib/trust/bft-judge.ts` — `JudgeOpinion.referToHuman`; `staged-judge.ts` reads it | **Live** | Fixed after a measured cross-module defect (2026-08-15): a vetoing panel placed anywhere but *last* had its human-escalation silently converted into a single model's VERIFIED. `referToHuman` reaches no signed byte and required no new `Outcome` or contract change. `check:panel-tier`, 7/7 mutants killed. |
| A human rescue is not yet distinguishable from an unassisted success | `docs/INTERRUPT-AS-AUTHORIZATION-2026-08-15.md` | **Blocked** | Proposed, not built: an interrupt as a *signed authorization event* so a run a human rescued stops scoring as a run the agent completed. Deliberately proposes no default for whether an assisted success counts as success. Behind the evaluator port and a kernel with a caller — not next. |
| Reputation-abuse enforcement (Sybil/referral farm) | M4–M8, see Map/Measure above | **Blocked** | Specified in the locked policy and named as undecidable by the zero-imports formula file on purpose. No referral-event processor exists yet to feed `evidence.ref` / lifecycle status / family relationship in. This is the honest state, not a claim of enforcement — do not read the M4–M8 row above as "defended". |

---

## What this doc does NOT establish

- It does not claim NIST AI RMF **conformance** — RMF is voluntary guidance,
  not a certifiable standard, and this is a mapping exercise, not an audit
  attestation.
- It does not upgrade any control's state. Every Live/Observe/Blocked tag
  above is copied from the gate or doc already cited — re-run the named
  `check:*` script rather than trust this table if the two ever disagree.
- It says nothing about the ERC-8004 / zk-attestation proposal (item B, same
  branch) beyond noting where a future attestation would slot into Measure —
  that is a separate doc, deliberately, so a Validation-Registry design
  question doesn't get answered by a compliance-mapping doc that has no
  standing to answer it.
- Two named gaps stay open on purpose rather than being closed here: the
  reward idempotency key (Manage) and the M4–M8 referral-abuse processor
  (Map/Measure/Manage). Closing either is code, not docs, and out of scope for
  this commit.
