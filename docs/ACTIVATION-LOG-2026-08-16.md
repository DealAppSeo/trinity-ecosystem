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
| **R4** | Read-only auditor grant enforced on a live path (§5 step 6) | `auditor-grant.ts` — 0 importers | **not wired** | **FIXED** — minted by the spine, see §9 |
| **R5** | Auth/RLS failures are loud | 5 sites destructure `{ data }` and drop `error` | **error swallowed** | **FIXED** — 4 of 5; the 5th is a decision, see §8 |
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

**29 assertions at first landing; 40 after §9.** It asks two questions no unit suite can:

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
(**36 → 38 CAUGHT** at this point; §8 takes it to **41** and §9 to **43**, all 0 SURVIVED / 0 INVALID / 0 DRIFT).

**Honest survivor:** this suite does **not** kill the `doer === checker` defence-in-depth
throw — `eligiblePool` already excludes the doer, so that branch never fires in the
fixture. The property is killed properly in `check:checker-assignment` and
`check:assigned-contract`. Recorded rather than hidden.

---

## 6. Still NOT CHECKED — with the condition that would verify each

| item | why not checked | what would verify it |
|---|---|---|
| **`runContractedWork` under a REAL judge** | every tier in the fixture is a stub | wire `bft-judge` as a tier against a live provider panel and A/B it against a single tuned evaluator — **`TRUST-HARNESS-DESIGN` §4.3, still assumed, not measured** |
| **R4 under a REAL capability fleet** | the grant is minted and enforced on the live path (§9), but against fixture tool maps | a real `toolCapabilities`/`toolEffects` pair from a deployed fleet — and note the design's own warning: a fleet with a half-populated effect map cannot mint a grant at all, which is the correct failure |
| **R5 against a LIVE database** | fixed and asserted against injected failures (§8); no live PostgREST call was made | replay each failure against a real RLS denial with a publishable key — proxy-denied from an agent session |
| **cost-per-phase / cost-per-verified-outcome** | `LoopResult.spend` is carried through but nothing aggregates it across runs | §4.4 — a real run with priced calls |
| **whether any of this runs in production** | no app route calls `runContractedWork` | an HTTP or job caller. **Deliberately not added here** — a new product surface is outside this pass |
| **ground-truth oracle** | §4.1, NAMED not solved | unchanged by this work; it still gates the §3 positioning claim |
| **R6 — HAL** | root-caused as an operational outage; no Railway surface reachable from an agent session | a redeploy (Sean). Not reopened |

**The most important line in this table:** the spine is now *reachable and
exercised in CI*, and is still **not called by any production surface**. Reachable
is not running. A green `check:spine-reachable` must not be read as "the harness
is live".

---

## 8. R5 — four silent-empty reads, and one that only looks like them

Each dropped `error` and turned a permissions or transport failure into a
**plausible wrong answer** — not an exception, not a recognisable empty state,
but a confident value nothing downstream could distinguish from a real one.

| site | on failure it returned | why that is the worst possible answer |
|---|---|---|
| `KYAValidator.getDailySpend` | **0 spent today** | `validate()` compares it to `spendingLimitDaily`. `(null \|\| []).reduce(...)` is `0`, so an RLS denial produced the single most permissive answer the function can give, **on the payment path** |
| `EarnedMetricsRepo.resolveAgent` | **no such agent** | `load()` then reports the agent as having no track record — a wrong answer about reputation, caused by a permissions failure |
| `RepIDCalculator.getInstitutionWeights` | **our defaults** | silently replaces an institution's chosen risk posture with ours, and the weights look deliberate |
| `auth.listInstitutions` (service branch) | **`[]`** | renders as "you have access to no institutions", indistinguishable from a correct empty result |

**In three of the four the correct pattern was already in the same file.**
`EarnedMetricsRepo.load` captures `error` twelve lines below `resolveAgent` and
even explains why — *"a failed read is not an absence of evidence"*.
`KYAValidator.getAgentProfile` captures it directly above `getDailySpend`.
`auth.listInstitutions` captures it in **the very next branch of the same
function**. These were oversights, not decisions.

### The fixes are not uniform, deliberately

- `getDailySpend` **throws** — fails closed. A spend limit cannot be enforced
  against an unknown spend.
- `resolveAgent` returns a **three-outcome discriminated union**
  (`found` / `absent` / `unreadable`), so the compiler forces the caller to
  handle "could not look". `load()` maps `unreadable` to `unmeasured` carrying
  the database's own message.
- `getInstitutionWeights` **distinguishes PGRST116** — `.single()` reports it
  for zero rows, and defaulting there is correct and common. Only *other*
  errors are loud. A blanket `if (error)` would have been wrong, and there is
  an assertion pinning that.
- `listInstitutions` mirrors its sibling branch exactly.

### The fifth is a decision, not a defect

`lib/api-fetch.ts` `authHeaders` also drops `error` and is **deliberately
unchanged**. No session means no `Authorization` header, the route answers 401,
and `apiFetch` already raises `ApiError.isUnauthenticated` — the failure is
loud one layer down. Throwing would take the whole app down for an ordinary
signed-out user. Recorded in the file so the next reader does not "fix" it.

### `check:loud-errors` — 17 assertions, mutation-proven

Three classes gained an **optional injected client** (still lazy — `RepIDCalculator`
is constructed at module scope in `app/api/trustrails/repid/configure/route.ts`,
so a client built in a constructor would fail the build per `lib/CLAUDE.md`).
The test stub **throws if the real accessor is ever reached**, so injection
silently failing to take effect turns the suite red rather than letting it talk
to a live client.

Every case asserts the happy path too, because a fix that throws on everything
is not a fix — including that `getDailySpend` still returns **0 for a genuinely
empty ledger**. The defect was never "returns 0"; it was returning 0 when it
could not tell.

**`auth.listInstitutions` is covered STATICALLY only** — it calls
`getSupabaseAdmin()` inline and cannot be driven with an injected client without
reshaping the module. The assertion proves the error is captured and raised, not
that the raise behaves correctly at runtime. Weaker, and labelled as such rather
than presented as equivalent coverage.

### Two rounds of invalid mutants, and the gate caught both

The first mutation attempt reverted whole files to their pre-fix state. All
three went red — **for the wrong reason**: the pre-fix files have no constructor,
so the suite was catching the *missing injection seam*, not the missing error
handling. Confounded, and discarded.

The rewrite then failed rule 4 twice, and `npm run mutate` refused it both
times:

- `if (error && false)` — **does not compile.** TS does not narrow `error` to
  non-null under an always-false condition, so `error.message` is
  "possibly null".
- inserting `return 0;` / `continue;` before the handler — **does not compile**,
  same root cause: it makes the error-handling code *unreachable*, and TS drops
  narrowing there too.

The mutants that finally count keep the handler **reachable and narrowed**, and
fail only at runtime: `error.code === 'NEVER_MATCHES'` for two of them, and
`!==` → `===` on the PGRST116 comparison for the third — that last one is a
realistic operator slip that reintroduces the exact bug. Each produces a single
precise failure naming the property.

---

## 9. R4 — the auditor grant, wired to the live path

**Intended.** `TRUST-HARNESS-DESIGN` §5 step 6 — a read-only delegated
ControlProof for the auditor, described there as *"assembly of `delegation.ts` +
`loop-authorizer.ts`; near-zero new code"*.

**Was.** `auditor-grant.ts` existed, was mutation-tested, and had **zero
importers**. The module's own header explains why that matters more than usual:
*"read-only capabilities" is not a checkable statement* — a capability string is
an opaque name, and `read:*` authorizes a write the moment somebody maps a write
tool under it. The module COMPUTES read-only by searching for reachable
write-or-unknown tools. None of that ran anywhere.

**Fix.** `runContractedWork` now mints the grant for the **drawn** checker and
binds its reference into the signed verdict.

### The one design decision worth the space

`analyseReadOnly` needs a `toolEffects` map. So does the loop — `LoopPolicy`
already carries one. **The spine passes the loop's own map** rather than
accepting a second one beside it:

```ts
toolEffects: execution.policy.toolEffects,   // not a parameter
```

That is the entire reason to mint the grant *here* rather than at the call site.
A grant proven read-only against a different effect map than the loop enforces
would verify perfectly and describe a different world — a proof about a
hypothetical fleet, attached to a real run. One map, one source, no way for the
two to disagree.

The mutation that protects it hardcodes a permissive map, and **both refusal
cases then mint happily** — which is exactly the failure the wiring exists to
prevent.

### What it refuses

| condition | outcome |
|---|---|
| capability set reaches a **write** tool in the loop's map | refuses to mint |
| reaches a tool the loop's map **does not classify** | refuses — an unlabelled tool is a blast radius nobody measured |
| no identity for the drawn checker | refuses, never substitutes |
| `doer === checker` | refused inside `delegateAuditorGrant` itself |

### It stays optional, and the absence stays honest

Omitting `auditorGrant` leaves `controlProofRef` undefined, which the contracted
evaluator records as an **unverified** authority — never as an authorized one.
An assertion pins that the run still completes without it: the grant is
additive, not a new gate.

**11 new assertions** (29 → 40), **2 new mutations** (41 → 43 CAUGHT), including
one proving the verdict actually carries the reference rather than the grant
being minted, checked, and then dropped on the floor.

---

## 7. Measurements

| measure | before | after |
|---|---|---|
| spine modules exported from the barrel | 0 of 10 | 11 of 11 |
| `runAgentLoop` callers outside `scripts/` | 0 | 1 (`spine.ts`, shipped) |
| shipped composition of the full chain | none (test-only) | `runContractedWork` |
| `npm run check` | 51 suites | **53 suites**, 52 VERIFIED / 1 NOT_CHECKED / 0 FAILED |
| `npm run mutate` | 36 CAUGHT | **43 CAUGHT**, 0 SURVIVED / 0 INVALID / 0 DRIFT |
| reads that drop `error` in `lib/`+`app/` | 5 | **1**, and it carries a written rationale |
| `check:spine-reachable` assertions | — | **40** (29 at first landing, +11 for the grant) |
| spine modules with a live caller | 0 of 10 | **10 of 10** |
| `tsc --noEmit` | 0 errors | 0 errors |

`check:legacy-key` is the single NOT_CHECKED, unchanged: absent credential,
network-denied from an agent session.
