# Sprint decisions — 2026-08-17

**Canonical. Owner-issued. Supersedes any conflicting instruction in a lane
prompt, a session summary, or chat memory.** Every lane — XC, CC, GA, T12,
VERIFY — pulls from this file and from `NORTH-STAR.md`, not from a conversation
it did not have.

If you are starting a lane and this file is older than the sprint you were told
to work on, stop and ask. **Stale decisions are how five lanes optimise five
different systems.**

---

## The target, in one paragraph

**HyperDAG Protocol is the portable, weighted + earned trust harness.** HAL
decides whether an agent told the truth; RepID turns that history into a score;
a ZK proof makes the score checkable **without revealing it**; x402 and ERC-8004
make it spendable and recordable on someone else's rails. Around that spine sit
four properties that are **not yet true and are this sprint's work**: dual-auth,
**selective disclosure**, **issuer-staked reputation**, and a ratchet that
**decays unless re-earned**.

---

## The five decisions

### 1. Do NOT land a reweight against the current ladder

Weight changes fold into the incentive redesign. **Choosing weights against a
ratchet that still grants permanent floors is optimising the wrong system.**
`DEFAULT_WEIGHTS` stays untouched until P5.

*The instrument for that tuning already exists and is merged —
`scripts/repid-weight-sim.mjs` (#86). Use it; do not act on it yet.*

### 2. BFT gets an evidence channel first — it is **not** removed

Reweighting a structurally-zero signal is the wrong move. Sequence:
**(a)** give `BFTEngine` a real evaluation write path so observations exist;
**(b)** only then decide the weight.

*Measured 2026-08-17 (#83): `bft` carries **0.40** of the score with **zero**
observations; `bft_payment_evaluations` and `prediction_consensus` are both
empty. Under production conditions this makes Platinum **unreachable** — the
strongest simulated fleet tops out modally Gold.*

### 3. The issuer must stake its own reputation — this is Gate 2, and it is first

HAL has ground truth (**197** positive / **198** negative). **Score the issuer by
the same standard it applies to everyone else.** An unearned or no-provider
`FACTUAL_ERROR` veto costs HAL standing. **No new protocol required.**

*Measured (#65, #79): 41 vetoes fired with `hal_providers_used` empty and
`providers_attempted` empty — no provider was attempted. Verification costs
~3,100ms and real spend; the no-provider path costs 947ms and nothing. **The
cheap path and the unverified path are the same path**, which is why the
behaviour persisted for a whole benchmark run.*

### 4. Selective disclosure is the next hard target

`witnessHidden` / `provenWithoutSecret` must become **real**. Reputation becomes
a **tradeable threshold proof**, not a confession. This is the `zkp-postcard`
work: **prioritise the circuit seam and the holder path. Do not invent a new
stack.**

*Measured (#55, #83): both flags are permanently `false`; the sole production
`IBindingScheme` (`PendingPoseidon2Scheme`) throws on all three methods. A holder
who proves today **reveals** — an anti-incentive to enter the very markets we
want them in.*

### 5. The ratchet becomes decay-unless-re-earned

A `peak_repid` floor that never decays is the gaming vector. **Credential-style
re-attestation, not permanent once-standing.**

*Measured (#81): `peak_repid` rises monotonically and `current_repid` is clamped
**up** to `tier_lower_bound(peak_repid)`. **12** agents are pinned by the ratchet — the widely-quoted "21" counted
agents on a round number, which is a looser test. Of the 12: **4 are human**,
**7 are `test_only`**, and **exactly 1 is a real agent** (`trinity-gcm`, which
clears the **medical/finance** gate at exactly 1000 because of the clamp).
Reward for good behaviour is permanent; cost of bad
behaviour is bounded below — precisely backwards.*

***CORRECTED 2026-08-17.** This decision previously claimed a further group of
floor-holders had never been observed at all, and called that the larger half of
the defect. **That figure is RETRACTED** — re-measured against
`v_agent_earned_observations` joined on `repid_agents.id`, no window reproduces
it: **3** with no observation ever, **4** none in 30 days, **3** none in 120
days. **Its cause is UNVERIFIED**; the originating query was not preserved, and
the nearby `id`/`agent_id` key hazard does not explain it. All **3** genuinely
unobserved floor-holders are **`lifecycle_status='test_only'`**.
**XC re-query 2026-08-17T21:12Z independently confirms the same three windows
and the same 12-way split; no window gives 6.***

***What changes for the sprint:* **no real agent holds a floor with zero
evidence**, so the never-earned base case reached fixture rows only — P3 needs no
base case, and decay is the whole of the defect rather than its smaller half.
The ~20 mock rows in `repid_agents` are a data-hygiene question, not a scoring
one. P3 is now **one module** (`lib/trustshell/repid-floor-decay.ts`) per
`docs/SPRINT-TRUST-HARNESS.md`; the retired duplicate hardcoded a 30-day
half-life the evidence does not support, and what survived from it is the
**`is_human` exemption**, which `compute_tier` already applies. See LESSONS A30,
`check:repid-floor-decay`, `check:observation-identity`.*

---

## Sprint order — hardest first, and the order is load-bearing

| | item | done when |
|---|---|---|
| **P0** | **Vision + goals current** | this file and `NORTH-STAR.md` on `main`; lanes may then start |
| **P1** | **Issuer staking / Gate 2** — HAL pays for wrong verdicts | cost function measured against ground truth; no-provider path expensive or impossible; gate + mutation |
| **P2** | **Selective disclosure** — holder proves "clears threshold T" | `witnessHidden` / `provenWithoutSecret` can be true; circuit seam under test |
| **P3** | **Ratchet decay** — floor decays without continued standing | re-attestation specified against the live floor-sitters |
| **P4** | **BFT evidence channel** — `BFTEngine` writes real evaluations | observations exist, **or** the blocker is measured and named |
| **P5** | **Reweight + recalibrate** against the new ladder | only after P1–P4 |

**P1 is the foundation. Everything else distributes a better or worse signal on
top of it.**

---

## Constraints for the loop

- **Tokens, routing, compute and DB are cheap tonight.** Prefer **measurement
  and gates over speculation**.
- **Fail loud, fail open** on non-critical paths. **Fail closed** on identity,
  attestation, and spending limits.
- **No synthetic agents, no fake ERC-8004 addresses, no silent schema
  pollution.**
- `LESSONS.md` and the GraphRAG lesson path stay **unconditional and additive**.
- **Every hard change gets a gate and a mutation check.** *If it can regress
  silently, it is not done.*
- **Parallel lanes start only after P0 is on `main`,** and they pull from these
  docs rather than from chat.

## What "done" looks like by morning

- issuer staking **live and gated**
- selective-disclosure seam **under test**
- ratchet decay **specified against live floor-sitters**
- BFT write path **producing observations, or explicitly blocked with a measured
  reason**
- vision and goals **current, so parallel agents cannot drift**
