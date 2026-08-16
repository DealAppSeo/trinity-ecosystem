# Two harness designs, read against ours — what to take, what to refuse

**Sources, read in full 2026-08-15:**

1. Anthropic Engineering, *"Harness design for long-running application
   development"* (Prithvi Rajasekaran, Labs, published 2026-03-24). Fetched via
   `pg_net` — `www.anthropic.com` is egress-blocked from an agent container,
   so `WebFetch` fails and the Supabase path in `CLAUDE.md` is the way in.
2. `AMAP-ML/LongHorizon-Harness` (GitHub).

**Read against:** `NORTH-STAR.md`, `docs/TRUSTSHELL-V1.md`,
`docs/HARNESS-SPEC.md`, `CLAUDE_HANDOFF_TRINITY.md`, and the loop layer merged
in PR #28 (`harness/loop.ts`, `identity/loop-authorizer.ts`, `mcp/client.ts`).

---

## 1. The three-way convergence, and why it matters

Three teams, working independently, arrived at the same first principle.

| | statement of the core problem |
|---|---|
| **Anthropic** | *"When asked to evaluate work they've produced, agents tend to respond by confidently praising the work — even when, to a human observer, the quality is obviously mediocre."* |
| **LongHorizon** | *"Only results that pass independent verification become trusted task state. A rejected result remains evidence, not progress."* |
| **TrustShell** (`TRUSTSHELL-V1.md` §1) | *"The failure that needs a harness is not the agent that errors — you read the error. It is the agent that **reports success it has not earned.**"* |

That is not a coincidence worth noting in passing. It is external validation
that the thesis this repo was built on is the right one, arrived at by two
groups who had never seen it. **Our framing is the sharpest of the three** — the
others describe a symptom, we name the failure class — and we have a log of four
real instances where we didn't.

It also means the differentiator is *not* the insight. Everyone has it now. The
differentiator has to be what we do with it that they structurally cannot.

## 2. The hole in both of their designs

Both harnesses put a verifier next to the worker. **Neither can tell you why to
trust the verifier.**

Anthropic says so outright:

> *"the evaluator is still an LLM that is inclined to be generous towards
> LLM-generated outputs"*

> *"Out of the box, Claude is a poor QA agent. In early runs, I watched it
> identify legitimate issues, then talk itself into deciding they weren't a big
> deal and approve the work anyway."*

Their fix was **manual tuning over several rounds** — read the evaluator's logs,
find where its judgement diverged from the author's, patch the prompt. That
works, and it is unfalsifiable, unportable, and expires with the model. They
also hit a hard sensory bound: *"Claude can't actually hear, which made the QA
feedback loop less effective with respect to musical taste."*

LongHorizon has the same hole with less acknowledgement: the Auditor's verdicts
become trusted task state by construction. Nothing audits the Auditor.

**This is exactly the gap the rest of our stack was built to fill, and we have
not connected it.** Our spine is HAL → RepID → ZKP → x402: *is it true → what's
it worth → prove it privately → spend and record it.* Point that at the
evaluator instead of at the worker and the question "why trust this verifier"
becomes answerable:

- the evaluator is an agent with a `did:key` and a `ControlProof` naming who
  authorized it;
- its verdicts are signed, so a third party can check who judged;
- its accuracy is **measurable over time** — and `veritas_catch` / `veritas_miss`
  are *already* in `ReputationSignal` in `reputation-transition.ts`, written
  before this research;
- `verification.checker_must_not_be_doer` stops being a policy assertion and
  becomes a **cryptographic** one: the checker's DID must differ from the
  doer's, and that is checkable by someone who trusts neither.

**Recommendation 1 — the strategic one.** Position TrustShell as *the
accountable verifier*, not as another harness. Every harness now needs a judge;
nobody can vouch for their judge. That is a product, it is on our existing
spine, and neither source can follow us there without building an identity and
reputation layer from scratch.

## 3. Our evaluator is already better than theirs, and it is not wired in

Anthropic used **one** evaluator and hand-tuned it. LongHorizon uses **one**
auditor. We have a three-squad Stochastic Bias Fracture Array in `BFTEngine.ts`
running **different providers** — groq / anthropic / deepseek — with weights on
the Pythagorean comma, and it is *measured*: panel size 3 is the cost-adjusted
optimum, membership selection sits at 97.15% ± 0.25 of the omniscient bound
(Sprint Z2).

A panel of three heterogeneous models is a strictly stronger evaluator than one
tuned model, for the reason Anthropic identifies and cannot fix: a single LLM
evaluator is biased toward LLM output, and tuning trades one bias for another.
Provider diversity attacks the bias directly rather than compensating for it.

**We already have the better evaluator. It is connected to the payment path and
not to the agent loop.**

**Recommendation 2 — the highest-leverage build.** Wire `BFTEngine` in as the
loop's evaluator. The seam exists: the loop kernel takes an injected
`Authorizer` port and produces a typed `LoopResult`; an `Evaluator` port
alongside it, backed by the BFT panel, is the same shape of change as
`loop-authorizer.ts` was. Cost is the obvious objection and we can answer it
with measurement rather than guess — see §7.

## 4. What to take, concretely

### 4.1 The sprint contract — negotiated *before* the work

Anthropic's single best mechanism, and the one we have no analogue for:

> *"Before each sprint, the generator and evaluator negotiated a sprint
> contract: agreeing on what 'done' looked like for that chunk of work before
> any code was written. The generator proposed what it would build and how
> success would be verified, and the evaluator reviewed that proposal… The two
> iterated until they agreed."*

Our loop has `TypedHandoff` at the **end** — the agent states an outcome and the
harness caps it. We have nothing at the **start**. That asymmetry is the same
one `CLAUDE.md` already warns about in a different context: *"compute the
ceiling before optimising toward it."* Define the measurement before doing the
work, or the work defines the measurement.

Their contracts were granular — Sprint 3 alone had **27 criteria** — and the
findings were specific enough to act on without further investigation
(`fillRectangle` not firing on `mouseUp`; a FastAPI route ordering bug where
`/frames/reorder` was shadowed by `/{frame_id}`).

**Recommendation 3.** Add a pre-execution contract to the loop: the agent
proposes the deliverable *and its verification*, the evaluator accepts or
amends, and the agreed contract becomes a public input to the run. This is worth
more to us than to them, because a contract agreed before work and signed by
both parties is exactly the shape of artifact `ControlProof` already handles —
and it makes the eventual reputation event provable against a *pre-registered*
standard rather than a post-hoc one.

That last point is not a small thing. It is the difference between "the agent
says it succeeded" and "the agent met a bar it agreed to before it knew what the
work would be."

### 4.2 Hard thresholds, any one below → fail

> *"Each criterion had a hard threshold, and if any one fell below it, the
> sprint failed and the generator got detailed feedback on what went wrong."*

We have `caveat.ts` for *permissions* — `maxValue`, `toolAllowlist`, `maxCalls`
— and nothing for *quality*. A per-criterion floor with no averaging is the
right shape: it prevents a strong score on one axis from paying for a failure on
another, which is how "looks impressive, core feature broken" survives review.
Their solo run had exactly that failure — the game looked right and nothing
responded to input.

**Recommendation 4.** Extend the caveat vocabulary with a `minScore` caveat per
named criterion, evaluated the same way (three outcomes, NOT_CHECKED when no
score was supplied). It reuses machinery that already exists and is tested.

### 4.3 Context resets with a structured handoff, distinguished from compaction

Anthropic draws a line we have not:

> *"A reset provides a clean slate, at the cost of the handoff artifact having
> enough state for the next agent to pick up the work cleanly."*

Compaction preserves continuity but keeps **context anxiety** — models wrapping
up prematurely as they approach a believed limit. Sonnet 4.5 needed resets;
Opus 4.5 and 4.6 progressively did not, and the author *dropped resets entirely*
for 4.6.

LongHorizon takes the opposite extreme as a hard rule: fresh context every
round, Manager rebuilds state from **original goal + verified checkpoints +
failure evidence**.

Our loop has neither. `loops.max_iterations_per_task` bounds a single run;
nothing survives a run.

**Recommendation 5.** Add a handoff artifact to `LoopResult` carrying exactly
LongHorizon's three fields. We are unusually well placed here: `harness-bundle.ts`
already packs a portable, signed, splice-resistant bundle, and a handoff is a
bundle with a different payload. **A signed handoff is also strictly better than
theirs** — neither source can tell whether a handoff artifact was tampered with
between sessions, and we can.

### 4.4 Role isolation, and read-only roles

LongHorizon: Manager and Auditor are **read-only**; only the Executor acts.
Different models can fill each role.

That is a capability-attenuation statement written in prose. We can enforce it:
the Auditor's `ControlProof` grants `read:*` and no writes, `delegate()` already
attenuates per link, and the loop's policy gate refuses anything outside the
grant. **They document the boundary; we can make it unforgeable.**

**Recommendation 6.** When the evaluator lands, issue it a delegated ControlProof
with read-only capabilities and let the existing machinery enforce it. Near-zero
new code — it is assembly of `delegation.ts` + `loop-authorizer.ts`.

### 4.5 Rejected results are evidence, not progress

LongHorizon's sharpest sentence, and it maps onto `reputation-transition.ts`
almost exactly. They state it as an architectural convention. We have an
append-only committed history with an explicit claim boundary, so we can make
"evidence" and "progress" *distinct committed states* rather than a rule someone
has to follow. A rejected attempt still happened; it should be in the history,
marked as not-progress, and provably so.

**Recommendation 7.** Add an `outcome` discriminator to `ReputationEvent` so a
rejected attempt commits as evidence. Cheap, and it makes the history honest
about failure instead of silent about it — which is the same discipline as
NOT_CHECKED vs FAILED, one level up.

## 5. The discipline to take, which is not a feature

Anthropic's most transferable idea is a *method*:

> *"Every component in a harness encodes an assumption about what the model
> can't do on its own, and those assumptions are worth stress testing, both
> because they may be incorrect, and because they can quickly go stale as models
> improve."*

They tried radical simplification first, couldn't replicate performance, and
**couldn't tell which pieces were load-bearing.** So they switched to removing
**one component at a time** and measuring. That is mutation testing applied to
the harness itself, and we already run mutation testing on code — we have never
run it on the harness.

This lands directly on a measurement in `docs/AGENT-LOOP-SCOPE.md`: **47 settings
across six dimensions, and (before PR #28) zero production consumers.** We now
have a few. We have never asked which of them earn their place.

**Recommendation 8 — do this before building anything in §4.** Ablate the loop:
disable one setting at a time against a fixed task set and measure the delta.
Any setting with no measurable effect is either not load-bearing or not
reachable, and both are worth knowing. This repo's own rule — *measure the
ceiling before optimising toward it* — applies to our own scaffolding, and we
have not applied it there.

Their conclusion is also worth internalising as a planning assumption:

> *"the evaluator is not a fixed yes-or-no decision. It is worth the cost when
> the task sits beyond what the current model does reliably solo."*

The boundary moves outward with every model release. A harness component that
was load-bearing on Sonnet 4.5 was overhead on Opus 4.6. **Anything we build in
§4 should be built so it can be turned off and measured**, not welded in.

## 6. What to refuse

**Do not adopt the Manager/Executor/Auditor split as a rewrite.** LongHorizon's
gains are real (WeaveBench 51.8% → 80.7%; OSWorld 2.0 2.8% → 8.3%, a 3×;
Terminal-Bench 69.7% → 77.2% with 24% fewer tokens) but they are measured on
*computer-use* benchmarks against agents that had no loop at all. Our loop
already exists, and our bottleneck is not decomposition — it is that nothing
runs the loop in production. Adopting a three-role rewrite now would be building
the second harness before the first one has a caller.

**Do not chase the frontend-design half of the Anthropic piece.** The
generator/evaluator GAN framing is the transferable part. The taste criteria are
domain work for a product we do not have.

**Do not take "drop the scaffolding, models got better" as licence to thin the
identity layer.** Their scaffolding compensates for *capability*; ours enforces
*authorization*. A better model does not make an unauthorized write acceptable.
The ablation logic applies to `loops.*` and to evaluator overhead — not to
`permissions.*` or `verification.*`.

## 7. The economics, which nobody else is looking at

Anthropic publishes cost, and it is the most commercially interesting number in
either source:

| run | duration | cost |
|---|---|---|
| solo agent | 20 min | **$9** |
| full harness (v1, Opus 4.5) | 6 hr | **$200** |
| harness v2 (Opus 4.6) | 3 hr 50 min | **$124.70** |

Per-phase, v2: Planner $0.46 · Build R1 $71.08 · **QA R1 $3.24** · Build R2
$36.89 · QA R2 $3.09 · Build R3 $5.88 · QA R3 $4.06.

Two things fall out.

**Verification is cheap and building is expensive.** QA was **$10.39 of $124.70
— 8.3%** of the run, and it caught stubbed features the builder had reported as
done. A harness component that costs 8% and prevents a false "complete" is not a
cost problem, and the "an evaluator is too expensive" objection to
Recommendation 2 should be tested rather than assumed. Our BFT panel is three
calls where theirs is one, so call it ~25% — still the minority of a run, and
against a *measured* panel rather than a hand-tuned one.

**A 20× cost multiple for verified work is a market, not a deterrent.** This is
where x402 stops being a demo. If verification is a real, recurring, priced cost
inside every agent run, then *charging $0.001 for a second opinion from VERITAS*
— the line in `CLAUDE_HANDOFF_TRINITY.md` that reads today like a novelty — is a
description of the actual unit economics of agentic work. Nobody in either source
is pricing verification, because both treat it as internal overhead. It is the
one part of the stack that is inherently a service someone else wants to buy.

**Recommendation 9.** Instrument the loop for cost-per-phase and cost-per-outcome
from the start. We measure routing quality to 98.16% of bound and have no
cost-per-verified-outcome at all. It is the number that decides whether the
evaluator, the panel size, and the x402 pricing are right — and none of those
can be argued without it.

## 8. Ordered recommendations

**Measure first (before any new harness code):**

1. **Ablate the 47 settings** — one at a time, fixed task set, record the delta.
   Anything with no measurable effect is not load-bearing or not reachable. (§5)
2. **Instrument cost-per-phase and cost-per-outcome.** (§7)

**Then build, in this order:**

3. **The evaluator port, backed by BFTEngine** — the highest-leverage single
   change, and we already own a better evaluator than either source. (§3)
4. **The pre-execution contract** — proposed by the doer, agreed by the checker,
   signed, and a public input to the reputation event. (§4.1)
5. **Read-only delegated ControlProof for the evaluator** — assembly, not
   invention. (§4.4)
6. **`minScore` caveats with hard per-criterion floors.** (§4.2)
7. **Signed handoff artifact** — goal + verified checkpoints + failure evidence,
   as a `harness-bundle` variant. (§4.3)
8. **Evidence-vs-progress discriminator on `ReputationEvent`.** (§4.5)

**And the positioning, which shapes all of the above:**

9. **TrustShell as the accountable verifier.** Both sources need a judge; neither
   can vouch for one. That is the product, and every item above is a step toward
   being able to say *"here is the verifier, here is who authorized it, here is
   its measured accuracy, and you can check all three without trusting us."*
   (§2)

## 9. What this research does not establish

- **No claim about relative performance.** Their benchmark numbers are theirs,
  on their task sets, against their baselines. Nothing here has been reproduced,
  and none of it should be quoted as our result.
- **The BFT panel has never evaluated agent work**, only payment authorization
  and claim accuracy. That it is a better evaluator *in this role* is an
  argument from its measured performance elsewhere, not a measurement. It should
  be A/B'd against a single tuned evaluator before we assert it.
- **Cost estimates for a panel evaluator are extrapolated** from Anthropic's
  single-evaluator figures × 3. Unmeasured.
- Both sources describe **application-building** harnesses. Our loop's live
  target is agent *actions* — payments, vault access, memory. The transfer is
  strong on structure and unproven on domain.
