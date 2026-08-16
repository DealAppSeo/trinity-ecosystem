# Interrupt as a signed authorization event — design note, 2026-08-15

**Status: DESIGN NOTE. Nothing here is built, and it is deliberately not next.**
See §8 for where it sits in the queue and why it is behind the evaluator port.

This note exists because a re-review of LangGraph on 2026-08-15 surfaced one
idea that is **not** already recorded in `TRUST-HARNESS.md` § "What came from
where". Four things were taken from LangGraph previously (retry predicate,
run-vs-idle timeout, replay semantics, error taxonomy). This is a fifth, and
unlike the others it is not a straight import — the useful version of it does
not exist in LangGraph and cannot, for the same structural reason recorded in
`HARNESS-RESEARCH-2026-08-15.md` §2.

---

## 1. The gap: two halves that never meet

We have authorization. We do not have pause-and-resume.

| | what we have | what it does | what it does not do |
|---|---|---|---|
| `ControlProof`, `BFTAuthorizer`, "Sean-gated" | a **permission check** | decides whether an action may proceed | does not suspend a run and later continue it |
| `harness/replay.ts` | **checkpoint + rewind** | restores state from before a failure | in-memory only; no human in the path; `ReplayController` has no caller |

LangGraph has the other half: an interrupt primitive that suspends mid-graph,
exposes state for inspection and modification, and resumes. Its documentation
describes this as *"inspecting and modifying agent state at any point during
execution."*

Neither half is useful alone here. A permission check that cannot suspend means
a gated action ends the session and a human does something out of band, with no
state to resume into. A suspend/resume with no identity attached means the
resumption is anonymous.

**The combination is the interesting object, and it is on our spine rather than
LangGraph's**: an interrupt that is *also* a signed authorization event, so that
"who approved this resume, and over what state" is checkable by someone who
trusts neither the agent nor us.

---

## 2. The failure this closes — and it is the house defect at a new location

This is the argument for the whole note. Everything else is mechanism.

**A run a human rescued must not be scored as a run the agent completed.**

`EarnedMetrics.Observation` is `{ observedAt, success: boolean, domain? }`. If a
run pauses, a human corrects the state, and the run then succeeds, the
observation reaching `ReputationLedger` today would be an unqualified
`success: true` attributed to the agent. The human's contribution is invisible
in the record, because there is no record.

That is the recurring defect in this codebase — a system reporting success it
has not earned — relocated to the reputation layer, where it is worse than
usual for two reasons:

1. **It compounds.** Reputation drives routing. An agent credited with rescues
   it did not perform gets routed more work, which produces more rescues.
2. **It is invisible by construction.** Nothing in a green run distinguishes
   "succeeded" from "succeeded after being corrected twice." There is no field
   that could disagree.

The same shape is already recorded twice in this repo: the claim ceiling in
`harness/loop.ts` (an agent cannot self-certify above what the harness observed)
and transitive claim inflation across sessions in `identity/handoff.ts`. This is
the third instance, at the human boundary.

**Corollary — the reputation question is a policy decision, not a mechanism
one.** Whether a human-assisted success counts as a success *at all*, or as a
distinct outcome, or as a failure with a recovery annotation, is unmeasured.
Following `contracted-evaluator.ts` on `maxDisagreement`, this note deliberately
proposes **no default**. A guessed policy here is a guess wearing a policy's
clothes, and it would silently reprice every agent in the pool.

---

## 3. The second failure: modify-during-pause is an unauthenticated write

LangGraph advertises *modifying* state during an interrupt as a feature. Taken
literally into our system, that is **a write path into agent state with no
authorization and no record** — the same class as the finding in
`FULL-STACK-E2E-ASSESSMENT-2026-08-14.md` §2, where the fleet's control plane
turned out to be writable by anyone, and the same caution written into §1a of
that document about ingesting public ratings.

The lesson those two share: a write path that arrives through an unexpected door
is still a write path. A pause is an unexpected door.

So if interrupts are adopted, the modification path is the part that needs the
authorization, not the resumption in the abstract.

---

## 4. Sketch — shapes, not code

Two records. Both are shapes to argue with, not an interface to implement yet.

```
InterruptRecord
  runId              which run suspended
  checkpointDigest   digest of state AT the moment of suspension
  reason             why it suspended (gate hit, budget, explicit request)
  requestedBy        DID of whoever or whatever raised it
  requestedAt        timestamp — see §6, this proves less than it looks

ResumeAuthorization
  interruptDigest    binds to a specific InterruptRecord
  stateBeforeDigest  == InterruptRecord.checkpointDigest
  stateAfterDigest   digest of state the run actually resumes from
  authorizedBy       DID of the authorizing party
  signature          over (interruptDigest, stateBeforeDigest, stateAfterDigest)
```

Three rules give it its properties:

1. **Resume requires a signature over both digests.** If state was modified
   during the pause, `stateBeforeDigest != stateAfterDigest`, and the difference
   is attributable to the signer. An unmodified resume is the degenerate case
   where they match — which is itself worth recording, because "nothing was
   changed" then becomes a signed claim rather than an absence.
2. **`authorizedBy` must differ from the agent's DID.** This is
   `checker_must_not_be_doer` reused verbatim — already enforced by comparing
   DIDs rather than trusting a flag, per `contracted-evaluator.ts`. A run
   authorizing its own resumption is self-certification with extra steps.
3. **The interrupt record is an input to the receipt.** A session that was
   human-steered becomes distinguishable from one that was not, which is the
   whole point of §2. If it is not in the receipt, it did not happen as far as
   any downstream consumer is concerned.

---

## 5. Why LangGraph cannot do this, stated fairly

Not a criticism — a layer difference, and the same one `HARNESS-RESEARCH` §2
identified for every harness reviewed so far.

LangGraph is orchestration infrastructure. It has no identity layer, so there is
nothing for `authorizedBy` to be, and no notion that a checker must differ from a
doer. Adding this to LangGraph means building DIDs, signatures and a reputation
consumer first. Adding it here means assembling parts that already exist:
`identity/did.ts`, `identity/control-proof.ts`, the receipt, and the digest
discipline already used by the handoff artifact.

That asymmetry is the reason this idea belongs in our tree and not as an upstream
contribution.

---

## 6. What this would NOT prove

Stated up front so it is not claimed later by someone reading only §4.

- **Not ordering.** `requestedAt` is a timestamp, and a backdated one is the
  same bytes. `identity/work-contract.ts` already establishes this for the
  pre-execution contract: signatures carry no ordering. A signed resume proves
  *who*, not *when*.
- **Not comprehension.** A signature over a state digest proves the signer had
  the bytes. It does not prove they read them, understood them, or were
  competent to judge them. "Human-in-the-loop" is often claimed as a safety
  property when what it delivers is a liability-transfer property, and the
  distinction should survive into whatever we build.
- **Not that the modification was correct.** It makes the change attributable,
  not right. Correctness is the evaluator's job, and the evaluator port is ahead
  of this in the queue for exactly that reason.

---

## 7. Open questions — to measure, not to guess

1. **How often do interrupts actually occur?** Unknown, and unknowable today:
   `harness/loop.ts` has no production consumer, so the frequency and therefore
   the cost of this mechanism are unpriced. Building it now would be pricing a
   feature by assumption.
2. **Does a human-assisted success count as success?** §2's corollary. Needs a
   decision plus a measurement, and deliberately has no default here.
3. **Should modification during a pause be permitted at all**, or should the
   only legal transitions be resume-unchanged and abort-and-restart? The
   restrictive option is cheaper to reason about and may lose nothing.
4. **Digest granularity** — whole state, or the subset a human may touch. Whole
   state is simpler and noisier; a subset needs a defensible boundary.

---

## 8. Where this sits in the queue, and why it is not next

Behind everything in `HARNESS-RESEARCH-2026-08-15.md` §8. Specifically behind
the evaluator port, which is the differentiator, and behind the run-vs-idle
`TimeoutPolicy` split, which is cheap and already flagged as the highest-value
remaining LangGraph item.

It is also behind its own precondition. `harness/replay.ts` is the natural home
for interrupts, and today `MemoryCheckpointStore` is its only `CheckpointStore`
implementation and `ReplayController` has no caller. Suspending a run to disk is
meaningless while the kernel that would suspend it is not being run by anything.
Building this now would be the refusal recorded in `HARNESS-RESEARCH` §6 —
*building the second harness before the first one has a caller* — with a human
in the middle of it.

**The correct trigger for revisiting this:** the loop has a production consumer,
and at least one gated action has been observed stopping a real run.

---

## 9. What this note does not establish

- **The LangGraph behaviour described here was not executed in this session.**
  It is taken from LangGraph's public documentation and from the earlier reading
  already recorded in `TRUST-HARNESS.md` § "What came from where". No LangGraph
  code was installed, run, or probed for this note. Treat every claim about what
  LangGraph does as NOT CHECKED at the level of execution, and re-verify before
  relying on any of it in an implementation.
- **No measurement was taken.** There are no numbers in this note, and the two
  quantities that would justify or kill the idea — interrupt frequency, and the
  reputation delta from mis-attributed rescues — are both unmeasured.
- **The record shapes in §4 are a sketch.** They have not been reviewed against
  the receipt schema and will not survive contact with it unchanged.
