# Ornith-1.0 read against the trust harness — and the gap it makes urgent

**[VERIFIED 2026-08-15 by cloning `ornith-ai/Ornith-1` and querying the Hugging
Face API. Nothing was downloaded, served, or benchmarked — see §6.]**

## 0. The correction that has to come first

The ask was how to adopt Ornith *"not only as a new LLM source but its
self-improving agentic coding capabilities."*

**Those capabilities are not in the repository, and cannot be.** `ornith-ai/Ornith-1`
is **10 commits, all named `init`, containing `README.md`, `assets/` and
`LICENSE`. There is no training code, no RL framework, no scaffold optimiser** —
last commit 2026-06-27.

The self-improvement described happened **during their post-training**. What
ships is a checkpoint. So:

> **The weights are self-improved. The model does not self-improve at your site.**

You can adopt the *product* of their loop. You cannot adopt the loop from this
repo. Any plan that says "implement Ornith's self-improving framework" is
planning against code that is not published.

## 1. What is actually there, and it is substantial

| | measured |
|---|---|
| checkpoints | 9B dense, 35B MoE, 397B MoE (+ FP8 and GGUF variants) |
| licence | **MIT** — no field-of-use or regional limits |
| downloads | **9B: 3.3M · 9B-GGUF: 7.1M · 397B: 565K** |
| architecture | `qwen3_5` / `qwen3_5_moe`, post-trained on Gemma 4 and Qwen 3.5 |
| context | 256K (262,144) |
| interface | **OpenAI-compatible** via vLLM / SGLang / llama.cpp / Ollama; tool calls via `qwen3_xml`, reasoning surfaced as `reasoning_content` |
| hosted | live on **featherless-ai**, so no self-hosting required to try it |

Two discrepancies worth knowing before anyone follows a link: the README points
at `deepreinforce-ai/…` but the org resolves to **`ornith-ai/…`** (renamed — the
README links may 404), and the checkpoints are tagged
`image-text-to-text` / `AutoModelForMultimodalLM`, i.e. **multimodal**, which the
README never mentions.

## 2. The one idea worth taking seriously

> *"RL to learn to generate not only solution rollouts, but also the **scaffold**
> that drives those rollouts. By jointly optimizing the scaffold and the
> resulting solution…"*

**The scaffold is the harness.** They are training the model to write its own
agent loop. That is the most interesting sentence in the ecosystem this week, and
it cuts in both directions at once.

### 2.1 The opportunity — our output is their input

Scaffold-optimising RL needs a reward signal. The default is "did the tests
pass", which is cheap, gameable, and available to everyone. What we produce is
strictly better as a training signal:

- **contract-bound** — criteria fixed before the work, so the reward cannot be
  re-scoped after the outcome is known
- **independently issued** — signed by a checker who is provably not the doer
- **portable and checkable** — a `TrustEnvelope` verifies offline, by anyone
- **cost-annotated** — `SpendSummary` per phase, so reward can be priced

**A corpus of signed verdicts is a reward-model dataset with provenance**, and
nobody in this ecosystem can produce one. That is a second product surface
sitting on top of work already built, and it is worth more than being one more
model provider.

### 2.2 The threat — and it is the sharpest one this design has faced

**A model that optimises its scaffold will optimise whatever the scaffold
rewards.** That is the failure this entire codebase exists to prevent, arriving
with gradient descent behind it.

Trace it against what we have:

| lever | does our design hold? |
|---|---|
| Doer edits its own criteria after seeing the outcome | **Held.** Criteria are in a contract both parties signed before the work |
| Doer grades itself | **Held, constitutionally.** `checker_must_not_be_doer`, enforced by DID comparison in three places |
| Doer inflates its own evidence | **Held.** The verdict commits to `evidenceHash`, and the loop hands the judge the same turns it reports (mutation-proven by `check:spine-e2e`) |
| Doer picks a lenient checker | **NOT HELD.** ⚠ |

**The gap, stated plainly.** `proposeContract` is called *by the doer*, and the
`unsigned` contract it proposes already contains `checkerDid`. The checker
countersigns, so the checker consents — but **the doer chooses whom to ask.**
`checker_must_not_be_doer` stops self-checking; nothing stops **checker
shopping**. A doer free to propose contracts naming the most lenient available
checker gets a clean signed verdict every time, and every signature in the chain
verifies.

**The symmetry is half-built, and that is the tell.** `countersignContract`
already refuses in-place amendment with the comment *"Allowing the checker to
amend in place would let the judge write the exam."* The design saw one direction
— the judge must not write the exam — and guarded it. The mirror image, **the
examinee must not pick the judge**, is unguarded, and `assertContractSane`
constrains only that the criteria are non-empty and that doer ≠ checker
[VERIFIED by reading it].

Today that is theoretical: contracts are constructed by us. Under
scaffold-optimising models it stops being theoretical, because *choosing who
judges you* is exactly the kind of move a joint scaffold-and-solution optimiser
would discover. It is a higher-yield strategy than writing better code.

**Why this is not fixed in this commit.** The obvious fix — record who selected
the checker — changes `contractPayload`, which is a signed canonical encoding and
part of the interop surface already handed to the other lane. That is the same
class of change as growing `REPUTATION_SIGNALS`, and it is a cross-lane decision,
not a unilateral one. **Logged, not built**, per the standing rule.

Three candidate fixes, for that decision:

1. **Assignment, not proposal** — an outside selector names the checker. Strongest,
   and needs a party that exists.
2. **Reputation-weighted eligibility** — only checkers above a zkRepID threshold
   may countersign. Uses the reputation we are already building, and is the
   natural fit; it needs the doer-seat signal that is still blocked.
3. **Provenance of choice** — record who selected the checker so shopping is
   *visible* rather than prevented. Cheapest; changes the signed payload.

## 3. Near term — what to do in the next week

1. **Use it as the cheap tier of `staged-judge`.** This needs no new code: the
   `Judge` port takes any implementation, and `createStagedJudge` already runs
   cheapest-first with *"a cheap tier may condemn but may not certify."* A local
   MIT-licensed 9B that can say FAILED with a concrete reason, and cannot
   certify, is exactly the shape the tier was designed for — and its errors are
   bounded by construction.
2. **Use it as a heterogeneous panel member.** Its being a different lineage
   (Qwen 3.5 / Gemma 4) is the point: a panel of one family's models shares that
   family's blind spots. This is also the honest repair for the 2026-08-09 panel
   collapse — panel width becomes something you own rather than rent.
3. **Do NOT put it on the doer seat for anything that moves reputation** until
   the checker-shopping gap above has an answer. A self-improving doer is
   precisely the adversary that gap describes.

## 4. Long term — the position this suggests

Their trajectory is *models that write their own harness*. Ours is *harnesses
that can prove who judged what*. Those converge on one question, and it is the
one we are already answering:

> **When the agent writes its own scaffold, what stops the scaffold from being
> written to pass?**

The answer cannot come from inside the scaffold — that is the definition of the
problem. It has to come from an identity the doer does not control, a contract it
cannot re-scope, and a judge it did not select. Two of those three are built and
mutation-tested. **The third is §2.2, and Ornith is the reason it is now on the
critical path rather than the wish list.**

## 5. What this does not change

- The critical path is unchanged: the fleet is still down, W2 still needs the
  DDL and a DID mapping.
- No benchmark claim here is independently verified — see below.
- Nothing about Ornith requires or justifies a new module today. The one concrete
  integration (cheap tier) is already possible with code that shipped this
  session.

## 6. NOT CHECKED

- **Every benchmark number in their README.** Self-reported, no third-party
  replication found, and their own NL2Repo note mentions "anti-hacking filters"
  — an acknowledgement that this class of benchmark is gameable.
- **The model was not downloaded, served, or run.** No claim here about its
  quality, latency, or cost.
- Whether the RL/scaffold framework is published anywhere else. Only this
  repository was read.
- The blog at `deep-reinforce.com/ornith.html`, which may describe the training
  loop. Not fetched.
- Whether featherless-ai's hosted endpoint is reachable from our environment.
