# The Trust Harness — settled design, open questions, build order

**Status:** design agreed across three passes — Claude's research
(`HARNESS-RESEARCH-2026-08-15.md`), Grok's two reviews, and Sean's decisions on
role assignment. This is the document to build from.
**Date:** 2026-08-15

Read `HARNESS-RESEARCH-2026-08-15.md` first for the source material. This file is
the decisions, not the analysis.

---

## 0. What all three passes agree on

Nothing below is one party's idea. Each survived an adversarial pass from at
least one other.

1. **Self-evaluation fails systematically.** Not occasionally — structurally.
   Anthropic measured it, LongHorizon designed around it, and this repo has four
   logged instances of its own.
2. **The evaluator must be independent of the doer**, as a fixed structural
   role rather than a mode the same agent enters.
3. **Only verified outcomes move reputation.** A rejected attempt is evidence,
   not progress — and it is *recorded*, not discarded.
4. **Success criteria are agreed before the work**, not asserted after it.
5. **Hard per-criterion floors, no averaging.** One failed criterion fails the
   unit of work.
6. **Authorization scaffolding does not thin as models improve.** Capability
   scaffolding does. A better model does not make an unauthorized write
   acceptable, so the ablation logic applies to `loops.*` and evaluator
   overhead, never to `permissions.*` or `verification.*`.
7. **The verifier must itself be accountable.** This is the differentiator.
   Anthropic's evaluator is hand-tuned and admits residual leniency;
   LongHorizon's Auditor is trusted by construction. Neither can answer *why
   trust this judge* — our spine can.

---

## 1. Roles: function is fixed, occupancy is configurable, one rule is not

The design question that took three passes to get right.

### 1.1 The Generator is chosen by CONTEXT, not by rank

Sean's call, and it is better than what either Claude or Grok proposed.

Grok proposed highest-RepID → Generator. Claude attacked it: our RepID is earned
from `bft_vote_correct`, `veritas_catch`, `veritas_miss`, `x402_settled`,
`latency_sample` — a measure of **judgement accuracy and settlement
reliability**, which is an *auditor* competency. Ranking the generator seat by it
puts the best judge in the wrong chair, and requires a scalar to express
"good at generating" vs "good at judging" — which needs per-domain reputation,
already **CLOSED at +1.64pp and declined**.

The resolution is not a better ranking function. It is a different axis:

> **The Generator is the agent with the most context about the user's intent.
> By default that is the user's own PAI, because it has the most of it by
> construction.**

This dissolves the problem rather than patching it. Rank no longer gates the
generator seat at all, so the lock-in dynamic in §1.4 stops applying to the
seat where most work happens.

### 1.2 The Auditor is ranked by RepID, because that is what RepID measures

Highest **eligible** RepID → Auditor, as the **default**. This is the seat whose
competency RepID actually tracks, and `veritas_catch` / `veritas_miss` are
already in `ReputationSignal`.

### 1.3 Defaults are defaults. One invariant is constitutional.

Sean's requirement: *"we have default settings that are generally following best
practices, but unique individual use cases do warrant customization of
squads/roles etc. so we remain flexible in our structure."*

Correct, and we already have the vocabulary to express exactly that distinction
— `HarnessProfile`'s authority ladder. Role policy is settings, at the right
rung:

| setting | authority | default | who may change it |
|---|---|---|---|
| `roles.generator` | `user` | the user's own PAI | the operator |
| `roles.auditor` | `user` | highest eligible RepID | the operator |
| `roles.auditor_min_repid` | `org` | coarse tier, see §3 | an org admin |
| `roles.planner` | `user` | Generator, unless separated | the operator |
| **`verification.checker_must_not_be_doer`** | **`constitutional`** | **true** | **nobody** |

So the scenario Sean raises — *"the user wants the highest RepID agent to code,
and has a particular agent as a designated red-team auditor"* — is not an
exception to the design. It is the design: both seats are `user` authority, both
are named explicitly, and the harness honours it.

**What no layer may do is make an agent its own auditor.** That setting already
exists in `HarnessProfile` as `verification.checker_must_not_be_doer`,
constitutional since it was written, and it has never had a consumer. It gets
one here — and it is enforced **cryptographically rather than by policy**: the
auditor's DID must differ from the generator's, which a third party can check
without trusting us.

That is the line between flexible and unsafe. Everything above it is the
operator's business. That one thing is not, because it is the single assumption
every other guarantee rests on.

### 1.4 What this means for the lock-in finding

Claude modelled rank-based role assignment and found that with **r = 0** (RepID
earned only in the lead role) an equally-capable newcomer is **permanently
locked out**, and worse — the lead seat becomes a *liability*, because only the
lead's score moves and so only the lead can be damaged. The rank rule inverts
into a hot-potato where the optimal strategy is to never hold the lead.

`scripts/rank-lockin-sim.mjs` reproduces it:

```
    r        first round leading    verdict
  0          —                      NEVER LEADS — locked out
  0.05       1144                   promoted, very slowly
  0.25       221                    promoted
  1.0        54                     rank rule now decorative
```

**Choosing the Generator by context rather than rank removes most of this
exposure**, because the seat that does the most work is no longer rank-gated.
The exposure that remains is narrower: auditor eligibility. `r` still needs a
value before auditor rotation is automated — see §4.

---

## 2. The loop

```
  contract  ──►  generate  ──►  audit  ──►  commit
     ▲                                        │
     └────────  evidence (not progress) ──────┘
```

1. **Contract.** The Generator proposes the deliverable *and how it will be
   verified*. The Auditor accepts or amends. They iterate to agreement. The
   agreed contract is **signed by both** and becomes a public input to the
   eventual reputation event. Anthropic's single best mechanism, and it maps
   onto `ControlProof` machinery we already have.
2. **Generate.** Bounded by the loop kernel already merged: capability gate,
   write budget, irreversible list, iteration ceiling.
3. **Audit.** Independent inspection against the contract's criteria, with hard
   per-criterion floors. HAL signals feed this continuously.
4. **Commit.** Three outcomes, never two:
   - **VERIFIED** → progress. Reputation moves.
   - **FAILED** → evidence. Recorded in history, marked not-progress, reputation
     moves *down* on the relevant signal.
   - **NOT_CHECKED** → neither. The auditor could not reach the thing it was
     asked to judge.

**The third outcome is not decoration.** Grok's earlier formulation — *"only
verified progress advances state"* — is binary, and Anthropic measured that even
a tuned evaluator misses things. Binary means unverified-but-real work is
discarded and a blind auditor stalls the loop forever. Our existing discipline
already distinguishes "we did not look" from "it failed"; it must survive into
this design.

**The claim ceiling already built in `harness/loop.ts` stays.** It is mechanical
— an agent cannot certify above what the harness *observed* — and it is
orthogonal to the Auditor, which supplies *judgement*. Keep both: the ceiling
catches denials, unreachable tools and exhausted budgets without a model in the
loop; the Auditor catches stubbed features and wrong-but-working code, which no
arithmetic can see.

---

## 3. Positioning

**TrustShell is the harness whose verifier is itself accountable.**

Every agent system now needs a judge. Nobody can vouch for theirs. We can:

- the auditor has a `did:key` and a `ControlProof` naming who authorized it;
- its verdicts are signed, so a third party can check *who judged*;
- `checker_must_not_be_doer` is cryptographic, not policy;
- its accuracy is measurable over time — **conditional on §4.1**;
- the whole record is an append-only committed history.

**Grok's push-back is accepted:** this is the positioning, not the whole product.
The user still needs a portable harness and a squad surface that *consumes* the
accountable verifier. Build the spine so the surface can sit on it — but the
spine first, because a surface over a self-evaluating loop is the thing both
papers warn about.

---

## 4. What must be measured before it is cemented

### 4.1 The ground-truth oracle — the deepest open problem

`veritas_catch` and `veritas_miss` only move reputation if something later
establishes whether a catch was really a catch. **We have not specified what
that is.** Without it the auditor's own score rises merely by rendering
verdicts, which is self-certification moved up one layer — precisely the failure
this whole design exists to prevent.

Claude's research doc asserted the auditor's "accuracy is measurable over time"
without specifying the measurement. That was an unearned claim and it is
retracted here pending a design.

**This gates the accountable-verifier positioning.** Everything else in §2 can
be built without it; the claim in §3 cannot be made without it.

Candidate sources of delayed ground truth, none yet chosen: human review
sampling; downstream failure attribution (a shipped defect traced to an approved
sprint); cross-auditor disagreement on the same artifact; replay against a later,
better model. All plausible, none measured.

### 4.2 `r` — the RepID yield ratio across roles

One number. Decides whether auditor rotation works, stalls, or inverts.
Lower stakes now that the Generator is context-chosen, but still required before
auditor assignment is automated.

### 4.3 Does the BFT panel generalise to evaluating agent work?

The claim that our three-provider panel is a better evaluator than a single
tuned one is an **extrapolation from its performance on payment authorization
and claim accuracy**. It has never evaluated agent work. Both Claude and Grok
flagged this independently. A/B it against a single tuned evaluator before
asserting it.

### 4.4 Real cost-per-phase and cost-per-verified-outcome

Anthropic's figures (QA at **8.3%** of a $124.70 run) are directionally useful
and are *theirs*. Ours are unmeasured, and a three-model panel is not a
single-model evaluator.

---

## 5. Build order

**Revised from Claude's research doc after Grok's criticism, which was correct.**

Claude's original order put ablation of the 47 settings first, on the standing
rule *measure the ceiling before optimising toward it*. Grok pointed out the
flaw: **that rule governs optimisation, and there is nothing to optimise yet.**
The loop has almost no production callers, so ablating now mostly identifies
what is dead — useful, but it does not create a caller, and the highest-leverage
move is the thing that creates one.

Ablation moves to parallel. Instrumentation stays first, because it is cheap and
retrofitting it loses the baseline.

| # | work | why here |
|---|---|---|
| 1 | **Instrument cost-per-phase and cost-per-outcome** | Cheap, and a baseline not captured now cannot be recovered |
| 2 | **Evaluator port + BFT panel behind it** | Highest-leverage single change; creates the production caller everything else needs. Behind a clean port so it can be A/B'd and switched off |
| 3 | **Pre-execution contract**, signed by both, public input to the reputation event | Anthropic's best mechanism; maps onto existing `ControlProof` |
| 4 | **`minScore` caveats** — hard per-criterion floors | Extends `caveat.ts`, machinery already tested |
| 5 | **Evidence-vs-progress discriminator** on `ReputationEvent` | Makes failure recorded rather than silent |
| 6 | **Read-only delegated ControlProof for the auditor** | Assembly of `delegation.ts` + `loop-authorizer.ts`; near-zero new code |
| 7 | **Signed handoff artifact** — goal + verified checkpoints + failure evidence | A `harness-bundle` variant; ours can be tamper-evident, theirs cannot |
| — | *ablation of the 47 settings, in parallel from step 2* | Now has a live caller to ablate against |

**After the above has production callers and measurements:**

- role-card schema and RepID tiers — **coarse tiers first**, not precise numbers
- automated auditor rotation (needs §4.2)
- the onboarding surface, both doors
- prosocial / multi-dimensional RepID

---

## 6. What this document does not settle

- **The ground-truth oracle (§4.1).** Named, not solved. It gates the §3 claim.
- **Whether the BFT panel generalises (§4.3).** Assumed, not measured.
- **`r` (§4.2).** Unmeasured; now lower-stakes.
- **Domain transfer.** Both source harnesses build *applications*. Our live
  target is agent *actions* — payments, vault access, memory. The structural
  transfer is strong; the domain transfer is unproven.
- **No benchmark from either source has been reproduced here.** Their numbers
  are theirs. Nothing in this document should be quoted as our result.
