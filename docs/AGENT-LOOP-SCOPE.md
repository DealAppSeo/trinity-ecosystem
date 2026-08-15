# Priority 3 — the agent execution loop: scope

**Status:** **Stage A BUILT** (`lib/trustshell/harness/loop.ts`, 29 assertions,
25 mutants all killed). Stages B and C not started; Stage B needs three
decisions from Sean.
**Written:** 2026-08-14, before any loop code existed. Stage A section added
after building it.

---

## The measurement that scopes this

Before proposing a loop, the question is what a loop would be *for*. Measured
this session, across `lib/` and `app/` (excluding test scripts and the defining
module itself):

| dimension | settings defined | production consumers |
|---|---|---|
| `loops.*` | 7 | **0** |
| `tools.*` | 5 | **0** |
| `memory.*` | 11 | **0** |
| `reliability.*` | 6 | **0** |
| `permissions.*` | 7 | **0** |
| `verification.*` | 8 | **0** |

**47 settings, zero consumers.** `HarnessProfile.ts` resolves them through a
four-layer ladder with authority tagging, bounds clamping, and 31 assertions.
Nothing reads the result. `lib/trustshell/index.ts:63` already records the same
shape for one module: *"MemoryRecall was written, tested (44 assertions) and then
never exported."*

The same is true of the subsystems themselves:

| subsystem | state | reached by |
|---|---|---|
| 13 reliability modules (`harness/`) | built, measured to within 2.00pp of bound | test scripts |
| `MemoryRecall` — tiering, RRF fusion, budgets | 44 assertions | test scripts |
| `memory-authz` — dual-auth namespace access | built | nothing |
| `ControlProof` / `capability` / `delegation` / `caveat` | 168 assertions | E2E verify route only |
| `reputation-transition` — committed history | 168 assertions | **no producer** |
| `EarnedMetrics` — decay, shrinkage, three states | 30 assertions | `repid-predicate` |
| `BFTEngine` — real LLM panel | live | payment path |

So **Priority 3 is not "build an agent loop."** It is: *build the executor that
is the missing consumer for six subsystems that are already built, tested, and
wired to nothing.* The loop body is the small part. The connections are the work,
and they are the reason the work pays.

### The ceiling argument

Per the standing rule — compute the bound before optimising toward it. Routing is
**closed** at 97.9% of the omniscient bound, total remaining prize 2.00pp
(`PRIOR-WORK-INDEX.md`). **Any loop work justified by "better routing" or "better
scheduling" is dead on arrival** and should be refused on sight.

The value here is not an optimisation. It is 0 → 1 on *enforcement*: today no
code path can refuse an agent action on the basis of an authorization artifact,
because nothing presents one. That is a different axis from the closed sprints,
and it is why this is worth a sprint when routing is not.

### It also unblocks two things already waiting on it

1. **The vault cutover.** `CustodyShadow` cannot produce a cutover decision until
   something presents a ControlProof at the custody gate. Every observation will
   read `not_comparable` until then — that is the measurement, and it says
   adoption is zero. The loop is the thing that would present one.
2. **The reputation history.** `reputation-transition.ts` has no producer. A loop
   that emits an outcome per turn is exactly the producer, and it closes the
   chain the whole system is premised on: outcomes → committed events → read-time
   score → routing weight. Right now that chain is broken at exactly one link.

---

## What is genuinely new, versus what is wiring

Almost all of it is wiring. **One piece is new work:**

**The MCP direction is inverted.** `lib/mcp/server.ts` exposes Trinity's fleet
*as* MCP tools — Trinity is the tool **provider**, serving external agents.
`executeTool` in `fleet.ts` is single-shot dispatch, not a loop. An agent loop
needs Trinity to be an MCP **client**. `jsonrpc.ts` already exists and its framing
is reusable, so this is one module, not a subsystem — but it is the only part
that is not connecting things that already exist.

**One upgrade to the identity layer falls out.** `caveat.ts` currently reports
stateful caveats (`maxCalls`) as `NOT_CHECKED`, because nothing holds per-session
state. The loop *is* that state holder. Wiring it turns `tools.max_writes_per_session`
and `maxCalls` from NOT_CHECKED into VERIFIED — a real strengthening of the
authorization layer, not just a consumer for it.

---

## Three stages, each independently shippable

### Stage A — the kernel

`lib/trustshell/harness/loop.ts`. Pure and portable: no Supabase, no Next, no
imports outside `harness/` — the rule `scripts/harness-portability-check.mjs`
already enforces. Every external thing arrives through an injected interface:
the model client, the tool dispatcher, the clock, the authority.

A turn is: model call → proposed tool calls → **authorization check** → dispatch
→ observations → repeat. The authorization check is not new code; it is
`permits()` and `evaluateCaveats()`, the same functions that guard payments and
vaults.

The property that makes it worth building: **the loop cannot grant itself
anything.** Its authority is a ControlProof it did not issue, its capabilities
attenuate only downward, and a tool outside `tools.allowed` fails closed.

Settings enforced, each already specified and bounded:

| setting | enforcement | already exists? |
|---|---|---|
| `loops.max_iterations_per_task` | hard stop, as a **typed outcome** not an exception | spec only |
| `loops.no_progress_abort_after` | see the open decision below | spec only |
| `loops.max_concurrent_tasks` | `PullQueue` + `capacity.ts` | **built** — wire, do not rebuild |
| `loops.max_subtask_depth` | `MAX_DELEGATION_DEPTH = 4` | **built** |
| `loops.can_spawn_subtasks` | `delegate()` refuses | **built** |
| `loops.claim_lease_minutes` | `fleet.ts` leases | **built** |
| `loops.stop_requires_typed_handoff` | the loop cannot end in prose — it ends VERIFIED / NOT_CHECKED / FAILED | the three-outcome rule |
| `tools.allowed` | `permits()` against granted capabilities | **built** |
| `tools.irreversible_requires_human` | the dual-auth gate | **built** |
| `tools.max_writes_per_session` | stateful caveat, newly checkable | upgrade |

### Stage A — BUILT 2026-08-14

`lib/trustshell/harness/loop.ts`, `scripts/harness-loop-test.mjs` (29
assertions), wired into `npm run check` as `check:harness-loop`, exported from
the barrel on creation rather than later.

**The property the file exists for, which was not in the original scope and
emerged while writing it: an agent cannot self-certify above what the harness
observed.** The model's claimed outcome is a *ceiling request*, not a verdict.
The loop tracks what it actually observed — a denied call, an unreachable tool,
an authorizer that could not answer, an exhausted budget — and returns the
weaker of the two. A VERIFIED claim after any of those becomes NOT_CHECKED, and
no prompt can talk the loop out of it, because the downgrade is arithmetic over
recorded events rather than a judgement the model participates in.

That is the direct counter to the recurring defect: a system reporting success
it has not earned. An agent loop is where that defect would find its widest
surface, because the agent narrates its own outcome.

A self-reported **FAILED** is neither upgraded nor downgraded. The ceiling
revokes over-claims; an agent admitting failure is the most trustworthy thing it
emits.

Everything not a typed handoff is **NOT_CHECKED, never FAILED** — running out of
iterations means the work was not finished, not that it failed.

**What mutation testing found.** 25 mutants; 22 killed on the first pass, and
all 25 after the fixes. The three that survived were each worth the run:

- **A test of mine passed for the wrong reason.** "Argument key order does not
  fake progress" asserted only the stop *reason*. With a broken canonicaliser
  the run still ends in `no_progress`, just two turns later, because `{a,b}` and
  `{b,a}` each read as new once before repeating. The turn count is the real
  assertion.
- **The wrong mechanism was getting the credit.** Replacing the frozen policy
  copy with a live reference survived, because the allowlist is a `Set` built at
  entry — the *snapshot* was doing the work the freeze was credited for. The
  scalars are where a live reference shows: `maxWritesPerSession` is read on
  every call, so a caller could raise the budget mid-run. Now tested.
- **A malformed mutant is not a kill.** One mutation did not compile, which
  proves only that the type checker works. Rewritten to compile, it killed.

**The two gates are tested as a pair**, per LESSONS A12, written before the
mutation run rather than after it — the compound "both gates deleted" mutant is
in the suite's fixture set from the start.

**The progress definition shipped as the stated default** from the open question
below: *a turn makes progress if it produced a tool result differing from the
previous result for the same (tool, arguments)*. It misfires on legitimately
idempotent polling; that cost is documented at the definition rather than left
to be discovered, and is why `loops.no_progress_abort_after` defaults to 3
rather than 1.

### The `Authorizer` adapter — BUILT 2026-08-14

`lib/trustshell/identity/loop-authorizer.ts`, 18 new assertions inside
`check:identity` (168 → 186), 15 mutants all killed.

**This is the first thing in the system that asks the identity layer for
permission before acting.** 168 assertions of dual-auth grants, attenuation,
delegation chains and caveats were reachable from exactly one E2E verify route
and nothing consulted them.

**It settles the caveat debt.** `caveat.ts` has said since it was written that
an unenforced caveat is worse than no caveat, and reported `maxCalls` as
NOT_CHECKED because nothing counted calls across requests. The loop counts;
passing `session.totalCalls` as `callsSoFar` makes it a real verdict. The kernel
change that made this safe is on `SessionCounters`: **every count excludes the
call being authorized**, stated on the type, because otherwise a `maxCalls: 2`
caveat permits one call and the boundary is the only place it shows.

**Verification is split, and the split is forced.** Signatures, audience,
chain attenuation and the nonce are checked ONCE at construction — cryptographic
facts cannot change mid-session, and `NonceStore.consume()` is atomic and single
use, so calling it per tool call would refuse the second call of every session
as a replay of the first. The validity window, the tool's required capability
and every caveat are re-checked ON EVERY CALL, because a 25-turn loop can
outlive its grant and an expiry that applies only at session start is decorative
for the longest and least supervised part of the run.

**A bad proof refuses the session** (`ProofRejected`) rather than returning an
authorizer that denies everything. Both are safe and they say different things:
deny-everything looks, in a transcript, exactly like an agent whose tools were
all out of scope, which would hide a configuration failure inside what reads as
normal behaviour.

**Two real defects found by the tests, neither visible by reading** — both
written up as LESSONS A13:

- **`valueOf` is on `Object.prototype`**, so the optional value-extractor option
  was never absent. Omitting it resolved to the inherited method, which `?.`
  happily called and which returns the container — a truthy value object with
  `asset: undefined`. Renamed to `declaredValue`.
- **`seenNonces` was read and never written**, so replay defence reported
  VERIFIED and prevented nothing — the `custodian_zkp_proof` shape from A11
  exactly. Caught by asserting on the side effect (`seen.size`) rather than the
  verdict, which is what the broken version got right.

Mutation also caught two boundaries a passing suite had not reached: `>=` versus
`>` at exactly `expiresAt` (one millisecond of disagreement with
`verifyControlProof`), and recording a *leaf* nonce instead of the root's, which
is a no-op for a direct grant and leaves an entire delegation chain replayable.

### The MCP client — BUILT 2026-08-14

`lib/mcp/client.ts`, `scripts/mcp-client-test.mjs` (20 assertions), wired into
`npm run check` as `check:mcp-client`. 14 mutants, all killed.

This was the one piece the scope called genuinely new rather than wiring, and
the reason stands: `lib/mcp/server.ts` makes Trinity the tool **provider**, and
a loop needs Trinity as the **consumer**.

**The distinction the file exists to get right** is three wire outcomes that
must not collapse into two:

```
the tool ran and succeeded    -> ok
the tool ran and failed       -> error       (the model sees it and adapts)
the tool could not be reached -> UNAVAILABLE (nothing was learned)
```

`tools.unavailable_is_not_checked` is constitutional, and its stated reason is
this repo's own history: *reading a blocked host as failure is how a proxy 403
became a credential rotation.* A transport failure tells the agent nothing about
its call, so it surfaces as `unavailable`, which the kernel turns into a ceiling
of NOT_CHECKED — an agent cannot certify a run in which it could not reach the
thing it was certifying. A JSON-RPC error is the opposite: the server answered
and refused, which is a real answer, so it is an `error` the agent can act on.
Both collapse directions are tested, and the end-to-end consequence is tested
too — the two kinds drive different loop outcomes.

**What the client refuses to believe.** MCP lets a server annotate its own tools
(`readOnlyHint`, `destructiveHint`). Those never decide effect. A remote server
declaring its own tool harmless is self-report deciding blast radius — exactly
what the kernel refuses from the model, and a server is further outside the
trust boundary, since whoever controls it controls the annotation.
`describeToolSurface()` records the claim as evidence beside the operator's
classification and names disagreements in both directions.

**Half the suite is interop, not mocking**: the client is driven against the
real `handleRpc` over an in-process transport, so what is asserted is that the
two halves of this repo agree on the wire rather than that the client agrees
with a fixture written to match it. The adversarial half covers what a
cooperating server cannot produce — transport failures, id mismatches, envelopes
carrying both `result` and `error`.

**A build hazard fixed on the way.** `mcp-fleet-smoke.mjs` pinned
`rootDir: lib/mcp`, and `client.ts` imports the loop's port types from
`lib/trustshell/harness/`, so it failed with TS6059. Pinned to `lib` instead —
the same fix `check-identity.mjs` needed twice. The version that "works" is
worse than the error: when tsc *can* infer a wider common root it silently
relocates every emitted file and the load paths move with no error at all.

Mutation also caught one real gap: non-text content blocks were dropped
silently. No interop test reaches that path, because this repo's server always
emits `structuredContent` — but a third-party server need not, and dropping an
image block makes a tool that returned something look like a tool that returned
nothing, so the agent reasons about an absence that is not real.

### Stage B — outcomes become reputation events

Each completed turn emits a `ReputationEvent` into the committed history. This is
the producer Priority 2 lacks, and it is what makes a score *earned* rather than
written — the defect behind both LESSONS A11 and the retracted RepID figures.

**Blocked on three decisions that are not mine** (they are the verifier
obligations named in `TRANSITION_CONTRACT.mustAlsoHold`, and no circuit can
discharge them):

1. **Who is in the group authorized to write reputation history?** A loop cannot
   be trusted to write its own outcomes without this — that is self-report, which
   is precisely what a reputation layer exists to replace (`harness/types.ts`
   makes the same argument about `AuctionSwarm`).
2. **What is an epoch?** A day, a task, an evaluation round. The granularity *is*
   the write budget, because a nullifier spends once per `(subject, epoch)`.
3. **Where does the head root live, and who holds it?** `prevRoot` must be the
   verifier's current head, or a prover forks the history and both branches
   verify.

Stage A ships without these. Stage B does not start until they are answered.

### Stage C — sub-agents (Priority 4)

Mostly falls out. `delegate()` already attenuates capabilities, audience, time
and start-time per link; depth is capped at 4; `harness-bundle.ts` already packs
a delegated sub-agent's portable state, and the E2E suite already verifies a
delegated worker over HTTP against a host that issued nothing. A spawned
sub-agent is a loop holding a delegated ControlProof. The new part is
concurrency accounting against `loops.max_concurrent_tasks`, which `capacity.ts`
already models.

---

## What will NOT be verifiable in a sandboxed session

Stated up front, because the recurring defect in this repo is a system reporting
success it has not earned.

`trinity-litellm.railway.app` is **proxy-denied** from this container (403 on
CONNECT, verified 2026-08-14), exactly like `repid-engine-production.up.railway.app`
and the Supabase REST host. So:

- **A real model turn cannot be exercised here.** The loop can be built and
  tested exhaustively against an injected fake model — that is what the injected
  interface is for — but "the loop drove a live LLM" is **NOT CHECKED** in any
  agent session, and must be reported that way rather than inferred from a green
  suite.
- This is the same discipline as `PendingPoseidon2Scheme`: build the seam, refuse
  to fake the thing behind it. A fake model that returns plausible tool calls is
  fine for testing control flow and is *not* evidence the loop works.

Everything else — authorization, attenuation, caveat enforcement, iteration
bounds, typed handoff, transcript shape, sub-agent depth — is fully testable
offline, because none of it depends on what the model says.

---

## Explicit non-goals

- **No reimplementation of the OpenAI Agents SDK.** `harness/` permits zero new
  dependencies and zero imports outside itself; that constraint is what makes it
  portable, and it is enforced by a check. The kernel is a small executor with
  injected interfaces, not a framework.
- **No routing, scheduling, capacity or timeout changes.** Closed at 97.9% of
  bound. See `PRIOR-WORK-INDEX.md`.
- **No planning or reflection layer.** No measurement in this repo supports one,
  and inventing a subsystem to justify a loop is how the two wasted sprints
  started.
- **No live authorization change.** Stage A enforces against a ControlProof an
  agent presents. It does not alter `VaultPermission`, which is a Sean-gated
  cutover pending shadow data.

---

## The one open design question I cannot answer alone

**RESOLVED PROVISIONALLY 2026-08-14** — shipped as the stated default below,
enforced in `assessProgress()`, and flagged there as an assumption rather than a
settled answer. Still worth your review; changing it is a one-function change.

**What counts as "progress" for `loops.no_progress_abort_after`?**

Every other setting has an unambiguous enforcement point. This one does not, and
getting it wrong fails in both directions: too loose and an agent burns its
budget re-running a failing call; too strict and a legitimately slow agent is
killed mid-task.

The definition I would default to, absent direction: *a turn makes progress if it
produced a tool result differing from the previous result for the same
`(tool, arguments)`.* It is cheap, needs no semantics, and catches the actual
observed failure mode (retrying an identical call). It will misfire on
legitimately idempotent polling, which is why it is a stated assumption rather
than a silent one.

---

## Recommended order

1. ~~**Stage A kernel**~~ — **DONE 2026-08-14.**
2. ~~**The `Authorizer` adapter**~~ — **DONE 2026-08-14**, see below.
3. ~~**MCP client**~~ — **DONE 2026-08-14**, see below.
4. *(gate: the three Stage-B decisions)*
5. **Stage B** — reputation events, closing the earned-score chain.
6. **Stage C** — sub-agents, mostly assembly.

Steps 1–3 are worth doing before any decision arrives. Step 4 is where this
stops being my call.
