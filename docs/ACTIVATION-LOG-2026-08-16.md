# Activation log — what was intended, what was inert, what now fires

**Date:** 2026-08-16
**Base:** `origin/main` at `3a0890b` (after #49, #50, #51 merged)
**Method:** the standing discipline — intended behaviour cited from a design doc,
current behaviour shown with a repro, classified, measured before and after.

This is not a dormancy survey. Every item below is either **activated** or
**explicitly labelled NOT CHECKED with the condition that would verify it**.

---

## 0. The finding, in one paragraph

The verification spine was **correct and inert**. Ten modules — contract, checker
draw, criteria draw, assignment, contracted evaluator, staged judge, verdict
envelope, outcome-to-reputation, auditor grant, handoff — each built,
mutation-tested, and green. **Not one was exported from `lib/trustshell/index.ts`,
and every real import of a spine module came from another spine module.** The
kernel `runAgentLoop` *was* exported, with its Evaluator port open. So the package
shipped a loop that could not be judged: a consumer could start one and had no
reachable way to obtain an evaluator.

The composition was not missing either. It existed — as ~40 lines of hand-assembly
inside `scripts/spine-e2e-test.mjs`. **A test that assembles the product is the
product's only user**, and that is precisely why the library had no callers.

No unit suite could see any of this. A test imports a module by path, which is
exactly the access a real consumer does not have.

---

## 1. Ranked list of intended-but-not-firing behaviours

Ranked by *distance from firing*, not by size. Each repro was run on `3a0890b`.

| # | intended behaviour | repro | class | status |
|---|---|---|---|---|
| **R1** | A consumer can obtain an evaluator for the loop (`TRUST-HARNESS-DESIGN` §5 step 2 — *"creates the production caller everything else needs"*) | `grep -c "identity/contracted-evaluator" lib/trustshell/index.ts` → **0** | **not wired** | **FIXED** |
| **R2** | The Evaluator port is invoked on a real contracted action, not only unit tests (§2 *the loop*) | `grep -rn runAgentLoop lib/ app/` → 0 callers; every call is in `scripts/` | **not switched on** | **FIXED** |
| **R3** | Evidence-vs-progress is visible for accept *and* reject (§5 step 5) | `outcome-to-reputation.ts` — 0 importers; correct code, never executed outside its own test | **not fed** | **FIXED** |
| **R4** | Read-only auditor grant enforced on a live path (§5 step 6) | `auditor-grant.ts` — 0 importers | **not wired** | **PARTIAL** — now reachable, still no live caller |
| **R5** | Auth/RLS failures are loud | 5 sites destructure `{ data }` and drop `error` | **error swallowed** | **NOT FIXED** — see §5 |
| **R6** | HAL produces | already root-caused | **externally blocked** | **NOT REOPENED** — see §6 |

`contracted-evaluator-port.ts` also has 0 importers. **That one is by design** — it
is a compile-time assertion file, typechecked by `tsc` regardless of importers.
It was not "fixed", because it is not broken.

---

## 2. R1 — the spine was unreachable. FIXED.

**Intended.** `lib/trustshell/index.ts:107-110` already states the rule, in its own
words: *"a module absent from the barrel is unreachable to every consumer that
imports from '@/lib/trustshell', which is all of them."*

**Was.** The rule was written and then not applied to the spine.

```
before:  0 of 10 spine modules exported from the barrel
after:  11 of 11 exported (10 modules + the new composition)
```

**Fix.** Export them. Several names are aliased — `Outcome`, `ToolEffect` and
`Evaluation` each already meant something else in that barrel, and two unrelated
things under one name is how a consumer imports the wrong one and finds out at
runtime.

---

## 3. R2 — nothing ran the loop with an evaluator. FIXED.

**Fix.** `lib/trustshell/identity/spine.ts` → `runContractedWork()`. It promotes
the E2E test's hand-assembly to shipped code: draw a checker and an exam → verify
the draw → doer signs a contract it did not compose → bounded loop under an
independent contracted evaluator → signed verdict → portable envelope →
evidence-vs-progress.

**It adds no mechanism, no policy, and no new signed byte.** `contractPayload` is
untouched, so there is **no cross-lane interop decision in this change**.

**What composition adds is refusal.** The modules return honest values a
hand-assembling caller can ignore. Three conditions now throw, because continuing
past them yields a *plausible artifact that is not what it appears to be*:

1. an assembly that does not verify — nobody should sign a draw they cannot check;
2. **a drawn checker this harness cannot act as** — the tempting repair is to fall
   back to a key we *do* hold, which is checker-shopping arriving as error
   handling;
3. `doer === checker`, re-asserted as defence in depth.

---

## 4. R3 — evidence-vs-progress now executes

`runContractedWork` calls `reputationForVerdict`, so the withheld-with-reason path
(PR #48's work) runs on every contracted action instead of only in its own test.

**`events` is normally empty and that is the design working, not a bug.** The
assertion is on `withheld`: every withheld signal must carry a non-empty reason.
The doer-seat gap stays **OPEN and cross-lane blocked** — this change makes it
*visible per run*, and does not close it.

---

## 5. The guard: `npm run check:spine-reachable`

**29 assertions.** It asks two questions no unit suite can:

- **A. Reachability** — static, on the barrel. Fails even if every other suite passes.
- **B. Does it fire** — runs the *shipped* composition end to end, not a re-assembly.
- **C. Does it refuse** — the three refusals must throw.

The pair is the point: B alone would pass on a module nobody can import; A alone
would pass on an export that throws on first call.

### Mutation-tested, including one that is NOT evidence

| mutant | result |
|---|---|
| the barrel exactly as it was before this change (0 spine exports) | **CAUGHT** — 11 failures, exit 1 |
| remove the checker-key refusal entirely | **INVALID — did not compile.** Recorded, not counted. Rule 4: *a mutation that does not compile is not evidence*. The refusal is load-bearing for `CryptoKey \| undefined` narrowing |
| silently sign with the **doer's own key** instead of refusing (compiles) | **CAUGHT** — 1 assertion |

The first mutant is the real defect from this morning: the guard would have caught
it. Both compiling mutants are registered in `scripts/mutations.mjs`
(**36 → 38 CAUGHT, 0 SURVIVED, 0 INVALID, 0 DRIFT**).

**Honest survivor:** this suite does **not** kill the `doer === checker` defence-in-depth
throw — `eligiblePool` already excludes the doer, so that branch never fires in the
fixture. The property is killed properly in `check:checker-assignment` and
`check:assigned-contract`. Recorded rather than hidden.

---

## 6. Still NOT CHECKED — with the condition that would verify each

| item | why not checked | what would verify it |
|---|---|---|
| **`runContractedWork` under a REAL judge** | every tier in the fixture is a stub | wire `bft-judge` as a tier against a live provider panel and A/B it against a single tuned evaluator — **`TRUST-HARNESS-DESIGN` §4.3, still assumed, not measured** |
| **R4 — auditor grant on a live path** | now reachable; no production caller passes a `controlProofRef` | a caller that delegates a read-only grant and has `analyseReadOnly` refuse a write-reaching capability set |
| **R5 — 5 silent-`{ data }` sites** | not attempted this pass; they sit in `EarnedMetricsRepo`, `KYAValidator`, `RepIDConfig`, `lib/auth.ts`, `lib/api-fetch.ts`. Deliberately **not** bundled with an activation change | capture `error`, fail loudly, and re-run against a live privileged key — needs PostgREST, which is proxy-denied from an agent session |
| **cost-per-phase / cost-per-verified-outcome** | `LoopResult.spend` is carried through but nothing aggregates it across runs | §4.4 — a real run with priced calls |
| **whether any of this runs in production** | no app route calls `runContractedWork` | an HTTP or job caller. **Deliberately not added here** — a new product surface is outside this pass |
| **ground-truth oracle** | §4.1, NAMED not solved | unchanged by this work; it still gates the §3 positioning claim |
| **R6 — HAL** | root-caused as an operational outage; no Railway surface reachable from an agent session | a redeploy (Sean). Not reopened |

**The most important line in this table:** the spine is now *reachable and
exercised in CI*, and is still **not called by any production surface**. Reachable
is not running. A green `check:spine-reachable` must not be read as "the harness
is live".

---

## 7. Measurements

| measure | before | after |
|---|---|---|
| spine modules exported from the barrel | 0 of 10 | 11 of 11 |
| `runAgentLoop` callers outside `scripts/` | 0 | 1 (`spine.ts`, shipped) |
| shipped composition of the full chain | none (test-only) | `runContractedWork` |
| `npm run check` | 51 suites | **52 suites**, 51 VERIFIED / 1 NOT_CHECKED / 0 FAILED |
| `npm run mutate` | 36 CAUGHT | **38 CAUGHT**, 0 SURVIVED / 0 INVALID / 0 DRIFT |
| `tsc --noEmit` | 0 errors | 0 errors |

`check:legacy-key` is the single NOT_CHECKED, unchanged: absent credential,
network-denied from an agent session.
