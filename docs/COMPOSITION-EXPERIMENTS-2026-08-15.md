# Applying the unapplied work — the experiment log

**Task as given:** read every doc on `claude/zkrepid-agentic-os-jfbi18`, apply what
has not been applied, switch one thing on at a time, measure whether it helps or
hinders, and log all results.

Everything below is a measurement or a correction. Where a thing was not measured
it says so.

---

## 0. The premise was wrong, and checking it first saved the sprint

**There are zero unapplied docs on that branch.** Every `docs/` file it carries is
already present here, byte-identical or superseded. Had this been taken on faith,
the sprint would have been spent re-applying work already applied — the exact
failure `PRIOR-WORK-INDEX.md` opens with.

**What was actually unapplied was CODE**, in two commits nobody had merged:

| commit | module | what it is |
|---|---|---|
| `ce66aa2` | `lib/trust/bft-judge.ts` | the BFT panel behind the `Judge` port |
| `4dcaeef` | `lib/trustshell/identity/handoff.ts` | the signed handoff artifact |

Merged as `bb1bb07`, one conflict in `PRIOR-WORK-INDEX.md` resolved as a union.
**Measured in three stages before trusting the merge**, because a merge that
compiles is not a merge that composes:

1. their two suites, run against this lane's base — **green**
2. this lane's six suites, run with their code present — **green**
3. their code under `check:raw-bytes` (206 files) — **clean**

None of that is the interesting result. The interesting result is what happened
when the two lanes' modules were pointed at each other.

---

## 1. EXPERIMENT — composing the BFT panel with the staged judge

### 1.1 Why this pair, and why first

Ranked by expected impact, this was top: both lanes had built a `Judge`, both
were unit-green, and **neither had ever been run against the other.** The repo's
standing defect is *a system reporting success it has not earned*; two
independently-correct components are the classic place that hides.

### 1.2 Hypothesis, written before the run

> `bft-judge` maps a Pythagorean veto to `NOT_CHECKED` meaning **"escalate to a
> human"**. `staged-judge` treats `NOT_CHECKED` as **"escalate to the next
> tier"**. Those are two meanings for one value, so a panel that is **not the
> last tier** should have its human-referral silently converted into "ask the
> next model".

### 1.3 Method

A stub `VotingPanel` with `pythagorean_veto_fired: true, comma_gap: 0.01` — a
vote inside the veto band, so no real provider, no database, and no ambiguity
about what the panel said. Three configurations, one variable (tier order):

- **CONTROL** — the panel alone
- **ORDER A** — `[mechanical, bft-panel]`, panel **last**
- **ORDER B** — `[bft-panel, single-model]`, panel **not last**

The only compile obstacle was the `@/` path alias `bft-judge.ts` imports through;
`tsc` resolves `paths` only from a config file, so the harness writes a tsconfig
rather than passing flags.

### 1.4 Result — CONFIRMED, first run

```
=== CONTROL: the panel alone ===
  outcome: NOT_CHECKED
  detail : the Pythagorean comma veto fired (gap 0.010) …

=== ORDER A: [mechanical, bft-panel] — panel LAST ===
  outcome  : NOT_CHECKED      decidedBy: bft-panel
  VERDICT  : human referral PRESERVED

=== ORDER B: [bft-panel, single-model] — panel NOT last ===
  outcome  : VERIFIED         decidedBy: single-model
  VERDICT  : referral LOST — "a human must look" became "ask another model"
```

**A vetoing panel placed anywhere but last had its strongest warning turned into a
pass by a single model.** Every unit test stayed green throughout. Every signature
in the resulting chain verifies. The verdict is wrong and nothing in the system
says so.

### 1.5 Why this is worse than an ordinary bug

The panel's veto does not mean "I am unsure". It means **the unanimity is itself
the evidence of a problem** — three model families agreeing too closely and too
confidently reads as coordinated bias. So the repair the staged judge reached for
— *ask one more model* — is precisely the thing the panel had just said was
untrustworthy. The composition did not merely lose the signal; it inverted it.

And it was invisible to both suites by construction. A shared value carrying two
meanings cannot be caught by the unit tests of the units that share it: each is
self-consistent. **That is the general lesson, and it is why this suite is
separate from both.**

---

## 2. The fix, and why it cost no interop change

Two options were on the table:

| option | cost | verdict |
|---|---|---|
| **A.** Document "the panel must be the last tier" | zero code | **REJECTED** |
| **B.** Let a judge say which `NOT_CHECKED` it meant | one optional field | **BUILT** |

Option A was rejected because it makes a **config file** the thing standing
between a vetoed run and a false pass. Tier order is data; a correctness property
that only holds for one ordering is not a property.

Option B is `JudgeOpinion.referToHuman?: boolean`, plus one clause in the
escalation rule:

> **FAILED at any tier is FINAL. A REFERRAL is FINAL. VERIFIED and NOT_CHECKED
> escalate.**

Escalating past a referral is the same move as escalating past a FAILED —
shopping for a better answer — with a politer name.

**Three things this deliberately does NOT do**, each because it would have made
the change a cross-lane decision instead of a lane-local one:

- **It does not add a fourth `Outcome`.** Three outcomes are the signed
  vocabulary. A referral says *who decides next*, not *what was found*; a verdict
  conflating the two would assert a finding it does not have.
- **It never reaches a signed byte.** `JudgeOpinion` is an internal port —
  `contractPayload`, `issueVerdict` and `CriterionScore` are untouched, so no
  envelope, no hash and no interop spec moves. **Verified** by `check:types` plus
  all 48 runnable suites passing unchanged.
- **It does not surface the referral through `Evaluation`.** That shape mirrors
  the kernel's `Evaluator` port, and the two are deliberately kept in sync by
  hand. Growing it is a real decision with a drift risk — logged in §5, not
  taken unilaterally.

### 2.1 One case the hypothesis did not anticipate

A judge returning **`VERIFIED` + `referToHuman: true`** is incoherent — it
certifies and asks for help at once. Resolution: **always weaken.** A judge unsure
enough to want a human has not certified. Refusing outright was rejected: a buggy
adapter must not be able to take down work it never assessed.

### 2.2 One case where the flag is deliberately withheld

`bft-judge`'s **truncated-evidence** `NOT_CHECKED` does *not* set it. That is the
one referral-shaped outcome a later tier genuinely **can** settle — a judge with a
bigger window reads the whole record and answers properly. Flagging it would route
resolvable work to a person and cost the signal its meaning. Asserted, not
assumed: `check:panel-tier` fails if truncation ever claims a referral.

---

## 3. Verification — three outcomes, not two

`scripts/panel-tier-test.mjs`, registered as `check:panel-tier`. Per the repo
rule, the **only** change to `package.json` was adding that one key;
`scripts/check-all.mjs` discovered it with no chain to edit.

**12/12 assertions pass. 7/7 mutants killed, 0 survived, 0 uncompilable.**

| mutant | result |
|---|---|
| staged: referral no longer ends staging *(= the pre-fix code)* | **KILLED** — 5 assertions |
| staged: `VERIFIED` + referral certifies | **KILLED** — 1 |
| staged: `referredToHuman` always false | **KILLED** — 3 |
| staged: outage recorded as a referral | **KILLED** — 1 |
| bft: veto drops `referToHuman` | **KILLED** — 5 |
| bft: `hitl_required` drops `referToHuman` | **KILLED** — 2 |
| bft: truncation claims a referral | **KILLED** — 1 |

Mutant 1 restores the exact pre-fix behaviour and kills 5 assertions, so the suite
**demonstrably detects the original defect** rather than merely agreeing with the
fix. `UNCOMPILABLE` was tracked separately and counted as a kill for nothing
(LESSONS A19); the harness also refuses any mutation whose anchor does not appear
exactly once, and requires a parsed `N passed, M failed` summary before scoring a
kill — a crashed harness is not a dead mutant.

**Full suite after the change: 48 VERIFIED, 1 NOT_CHECKED, 0 FAILED of 49.** The
one NOT_CHECKED is `check:legacy-key`, which needs network the sandbox denies —
pre-existing and unrelated.

### 3.1 Did it hinder anything?

The task asked for help-or-hinder, so both directions were checked:

- `check:staged-judge` **11/11** unchanged, `check:bft-judge` **15/15** unchanged
  — no existing behaviour moved.
- `check:types` green, so the new optional field breaks no caller repo-wide.
- **No measured cost.** The referral path ends staging *earlier*, so if anything
  it consults fewer judges; no run has been priced, so **no saving is claimed** —
  same reason `staged-judge` states no cost number.

---

## 4. What this does NOT establish

- **Nothing here was run against a real panel.** `VotingPanel` is a structural
  port and every measurement used a stub. Whether `BFTEngine` sets
  `pythagorean_veto_fired` at the rate its band implies is **NOT CHECKED** — that
  needs live provider votes, and the fleet is down.
- **The referral rate is unknown.** `TierDecision.referredToHuman` exists so it
  becomes one query over real runs. It is a mechanism for a measurement, not a
  measurement.
- **Whether the panel judges agent work better than a single model remains
  unmeasured** (`TRUST-HARNESS-DESIGN-2026-08-15.md` §4.3). This changes how a
  panel's *referral* is routed. It says nothing about whether the panel is right.
- **No human actually receives a referral.** There is no queue, no notification
  and no human seat. The system now correctly declines to fabricate an answer;
  who picks it up is unbuilt.

## 5. EXPERIMENT 2 — the same lens, pointed at `handoff.ts`

The §1 defect generalises: **where two components exchange a value from a small
enumeration, check that they mean the same thing by each case.** Applied to the
other freshly-merged module, it found a second instance in under an hour — this
time inside one file rather than between two.

### 5.1 The candidate

`CheckpointCapReason` documents `evidence_invalid` as *"The supplied verdict does
not verify."* But `verifyCheckpoint` returns it for **two different facts**:

- the citation is **broken** — bad signature, or not bound to its contract
- the citation is **sound and says FAILED** — the agent claimed VERIFIED against
  evidence in its own hands that says otherwise

Only the second is misconduct, and it is the sharpest possible instance of the
transitive claim inflation the file's header says it exists to close.

### 5.2 Result — CONFIRMED, and worse than hypothesised

Run against **real artifacts from the real pipeline** — real contract, real
`createContractedEvaluator`, real signed verdict — not hand-built fixtures:

| case | verdict verifies as | claimed → effective | `capReason` |
|---|---|---|---|
| **A** valid evidence saying FAILED (overclaim) | FAILED, signature genuine | VERIFIED → FAILED | `evidence_invalid` |
| **B** tampered signature | — | VERIFIED → FAILED | `evidence_invalid` |
| **C** control, valid and VERIFIED | VERIFIED | VERIFIED → VERIFIED | *(none)* |

**The cap reason AND the effective outcome were identical.** No field separated
them at all — a reader triaging capped checkpoints could not distinguish a
transport corruption from an agent caught contradicting its own evidence.

### 5.3 The tell: the file already had the rule, applied to one branch

`wrong_task` is FAILED rather than NOT_CHECKED, and the header says exactly why:

> *That is not a gap in the evidence; it is evidence of a mismatch.*

That is the same argument, already written, already agreed. It had been applied
to the splice case and not to this one. **Same shape as LESSONS A19** — a
documented rule enforced in one place out of two.

**And the test said so too.** The existing assertion's own comment reads *"citing
evidence against itself, which is worse than citing none"* — then asserted
`evidence_invalid`, the code meaning the opposite. The author of the other lane
saw the distinction and had no vocabulary to express it.

### 5.4 The fix, and the coverage hole it exposed

`verifyVerdict` **already returns** `signatureValid` and `boundToContract`;
`verifyCheckpoint` was collapsing them. Added `contradicted_by_evidence`,
selected on `signatureValid && boundToContract`. It is a verification **output**,
never part of `handoffPayload` — **no signed byte moves.**

Then the sharper finding: **`evidence_invalid` had no test coverage at all.** The
single assertion naming it was the one on case A — so the label was being proven
by the wrong case, and the genuinely-broken-citation branch had never been
exercised. Two tests added, not one.

### 5.5 Verification

**25 assertions (was 23), 4/4 mutants killed, 0 uncompilable.**

| mutant | result |
|---|---|
| always `evidence_invalid` *(= the pre-fix code)* | **KILLED** |
| always `contradicted_by_evidence` | **KILLED** — 2 assertions |
| soundness ignores `boundToContract` | **KILLED** *(survived at first — see below)* |
| soundness ignores `signatureValid` | **KILLED** |

The `boundToContract` mutant **survived the first run**, and the honest reading
was that the conjunct might be dead code. It is not: a genuinely signed verdict
answering contract A, presented against contract B with the same `taskId`, passes
`wrong_task` and `hash_mismatch` and is separated *only* by that field. A
contract-level splice. The test now exists and the mutant dies — **the survivor
was a missing test, not a redundant condition**, and it was only distinguishable
by constructing the case.

## 6. Logged, not built

- **Surfacing referrals through `ContractedEvaluation`.** Today a referral is
  visible in `decisions` and in the opinion, but the evaluator flattens it to
  `NOT_CHECKED` for the verdict. Correct for the signed artifact; possibly
  wrong for an operator dashboard. Touches a kernel-mirrored shape — needs the
  cross-lane call, same class as growing `REPUTATION_SIGNALS`.
- **`bft-judge.ts`'s header states it lives in `lib/trust/` "because it imports
  `BFTEngine`". It does not** — it imports nothing from the engine and takes a
  structural `VotingPanel` port; the name appears only in comments. The stated
  reason for its location is inaccurate. Left in place rather than moved: the
  location is defensible on other grounds, and moving a file mid-merge to fix a
  comment is how a clean merge becomes a conflicted one.
