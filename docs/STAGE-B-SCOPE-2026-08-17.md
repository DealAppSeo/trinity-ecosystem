# Stage B — scope, and the correction that changes it

**Written 2026-08-17, before any Stage B code.** Measured against the tree at
`8c1ba01`, not reconstructed from the older scope doc.

---

## 0. The correction, first

I described Stage B to the owner as *"the largest unblocked piece of real
product work."* **That was wrong twice over**, and both errors are worth stating
because they change what should be built.

**First: `docs/AGENT-LOOP-SCOPE.md` says Stage B is blocked.** In its own words —
*"Blocked on three decisions that are not mine … Stage B does not start until
they are answered."* I had read that document days earlier and recommended
against its explicit instruction. Checking prior work before proposing is the
repo's first rule, and I proposed first.

**Second: the plan it belongs to has been superseded.** `AGENT-LOOP-SCOPE.md` is
2026-08-14. `docs/TRUST-HARNESS-DESIGN-2026-08-15.md` §5 replaced its ordering
the next day, after Grok's criticism that ablation-first optimises nothing when
there are no callers. Measured against the current tree, **all seven items of
that build order now exist**, six of seven reachable from the barrel:

| § 5 item | module | state |
|---|---|---|
| 1 cost / spend instrumentation | `harness/loop.ts` | reachable |
| 2 evaluator port + BFT panel | `identity/contracted-evaluator.ts` | reachable |
| 3 pre-execution contract | `identity/work-contract.ts` | reachable |
| 4 `minScore` caveats | `identity/caveat.ts` | imported, not in barrel |
| 5 evidence-vs-progress discriminator | `identity/outcome-to-reputation.ts` | reachable |
| 6 read-only auditor grant | `identity/auditor-grant.ts` | reachable |
| 7 signed handoff artifact | `identity/handoff.ts` | reachable |

The frontier moved while I was auditing instruments. **Any Stage B scope written
against the 08-14 document is scoping work that is already done.**

---

## 1. "Stage B" is two things, and only one is blocked

The name covers two different mechanisms that happen to share the word
*reputation*. They have different blockers, different value, and different risk,
and treating them as one item is what made this look tractable.

### Half A — the score store

`ReputationStore` (declared inside `harness/`, dependency-free) with
`SupabaseReputationStore` behind it, writing `earned_score` to `agent_repid`.
Verified by query 2026-08-13: primary key `agent_name`, `earned_score` an integer
on the same 0..10000 basis-point scale the harness uses, no conversion.

**Not blocked on any decision.** It is an upsert. It is dormant only because
nothing in production calls the harness at all.

### Half B — the committed history

`identity/reputation-transition.ts`: `newRoot = H(prevRoot ‖ eventCommitment)`,
with the appender proving membership of an authorized group and a nullifier
scoped to `subject ‖ epoch`.

**Genuinely blocked**, on the three verifier obligations in
`TRANSITION_CONTRACT.mustAlsoHold`. No circuit discharges them, and they are the
same three the 08-14 doc named.

---

## 2. The three decisions, with options rather than a restatement

These are the owner's to make. Each is stated with what the code already forces,
so the decision is narrower than it looks.

### 2.1 Who may write reputation history?

**Why it cannot default.** A loop writing its own outcomes is self-report, which
is the thing a reputation layer exists to replace. The repo already refuses this
shape twice: `checker_must_not_be_doer` compares DIDs rather than trusting a
flag, and `veritasSignal()` throws on an observation from the checker being
graded.

| option | what it costs | what it buys |
|---|---|---|
| **The assigned checker only** — the DID that signed the verdict | needs the checker's key at write time | strongest; the write inherits the doer/checker separation already enforced |
| **A named operator group** — a small fixed membership | someone maintains the list | simplest to reason about; matches how `groupRoot` is already modelled |
| **The evaluator service** | one more service with a signing key | centralises, and re-opens "who watches it" |

**Recommendation: the assigned checker.** It adds no new principal, and the
separation it depends on is already mechanically enforced rather than asserted.

### 2.2 What is an epoch?

**Why it cannot default.** The nullifier spends once per `(subject, epoch)`, so
**the granularity IS the write budget**. `scopeForSubject` already throws when
`epoch` is omitted, precisely so nobody picks by accident.

| option | writes per subject | consequence |
|---|---|---|
| **per task** | one per completed task | finest; the history tracks work one-to-one |
| **per day** | one per subject per day | coarse; several outcomes collapse into one append |
| **per evaluation round** | one per round | matches the judge's cadence |

**Recommendation: per task**, because the event this produces is per completed
turn. A coarser epoch silently discards outcomes, and discarding is the failure
this whole layer exists to prevent.

### 2.3 Where does the head root live, and who holds it?

**Why it cannot default.** `prevRoot` must be the verifier's *current* head. If a
prover supplies its own, it forks the history and **both branches verify** — the
signature says nothing about which is canonical.

| option | cost | risk |
|---|---|---|
| **A single Postgres row, read-modify-write under a transaction** | needs the write serialised | simplest; a lost update forks silently unless the update is conditional on the old root |
| **A chain-anchored root** | on-chain write per epoch | strongest, and the slowest |
| **Per-subject heads** | more rows | removes global contention; no cross-subject ordering |

**Recommendation: a single Postgres row with a conditional update** — `update …
set root = new where root = prev` — so a concurrent append fails loudly instead
of forking. That is one migration and is testable without a chain.

---

## 3. What can be built with no decision at all

Half A, and only in this order. Each step is independently shippable and each
one has a measurement attached.

1. **Give the loop a production caller.** Nothing in `app/` reaches the spine —
   measured, zero routes. Until something does, every module below stays dormant
   whatever it is wired to.
2. **Persist `earned_score` through `SupabaseReputationStore`.** This is the
   upsert, and it retires one dormancy declaration.
3. **Shadow first, as the vault gate did.** `CustodyShadow` is the precedent:
   observe, change nothing, and read `not_comparable` as the measurement rather
   than as agreement.

**The ceiling on Half A is currently zero, and that is the finding.** RepID
scores are frozen because the fleet has been off since 2026-07-17 — 33 HAL rows
in August against 70,005 in June. Writing scores from a loop with no work to do
produces no scores. **Half A is unblocked and worthless until the fleet is back**,
which is a sequencing fact rather than an objection.

---

## 4. What this scope does NOT claim

- **That Half B is close.** Three decisions, one migration, and a nullifier set
  that must be durable before the first append. It is not a sprint.
- **That the build order being complete means the loop works.** Seven modules
  exist and are reachable. **Reachable is not called** — that distinction is the
  entire subject of `check:dormancy`, and it applies to this document too.
- **That any of it can be measured today.** With the substrate off, a loop can be
  built and unit-tested but not exercised against real work.

---

## 5. The recommendation

**Do not start Stage B.** Answer §2.1–2.3 when the fleet is back and there is
work for a loop to do; until then Half A produces nothing and Half B cannot
start.

The honest highest-value item remains the **Railway redeploy**, which is not a
code change and is not mine. Everything in this document is downstream of it.
