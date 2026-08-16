# Multica, read against this ecosystem — 2026-08-15

**[VERIFIED by reading both repos at the commits below. Claims about the hosted
service at multica.ai are NOT CHECKED — only the source was read.]**

| repo | commit read | author | licence |
|---|---|---|---|
| `multica-ai/multica` | `d77d676`, 2026-08-15 | Jiayuan Zhang (`forrestchang7@gmail.com`) | **Apache 2.0 + additional conditions** — not plain Apache |
| `multica-ai/andrej-karpathy-skills` | `2c60614` | same author (`forrestchang` / `@jiayuan_jy`), commits via `herobrine19` | **MIT** |

## 0. A premise to correct first

**Andrej Karpathy did not author either repository.** The skills repo is titled
*"Karpathy-**Inspired** Claude Code Guidelines"* and states plainly that it is
*"derived from [Andrej Karpathy's observations]"* — a single public X post about
LLM coding pitfalls. Both repos are by the same author, Jiayuan Zhang; the
skills repo's own README opens by advertising Multica as *"my new project."*

So the relationship is the reverse of the one assumed: **Multica's author wrote
a skill inspired by Karpathy**, not *Karpathy wrote Multica*. Nothing here is
diminished by that — the skill is good and the platform is serious — but a repo
that exists to stop agents running on unchecked assumptions is a poor place to
start making one.

---

## 1. The skill — installed, and honestly priced

Installed at `.claude/skills/karpathy-guidelines/SKILL.md`, unmodified (67
lines, MIT, no scripts, no network calls, no tool invocations — it is pure
prose guidance, which is why installing it is safe).

Its four principles against what `CLAUDE.md` already enforces:

| principle | already covered here? |
|---|---|
| **1. Think Before Coding** — state assumptions, don't hide confusion | **Yes, and more strictly.** The three-outcome rule (VERIFIED / NOT CHECKED / FAILED) is a harder version of the same idea |
| **2. Simplicity First** — no speculative abstraction | **NO. Additive.** Nothing in `CLAUDE.md` pushes back on over-building |
| **3. Surgical Changes** — touch only what you must; don't "improve" adjacent code | **NO. Additive, and it maps to a real incident class here** — silent conflict resolution and pushing into another agent's lane. It is the file-level form of the *must-not-touch* column in `AGENT-LOOP-PROMPTS.md` |
| **4. Goal-Driven Execution** — verifiable success criteria, loop until met | **Yes.** This *is* `work-contract.ts`: agreed criteria with hard `minScore` floors, no averaging |

**Verdict: roughly half of it we already do better, and half is genuinely
additive.** Principles 2 and 3 are the reason to keep it. Principle 4 arriving
independently at the pre-execution contract is mild external corroboration that
the contract design is the right shape.

---

## 2. What Multica actually is

An open-source workspace that assigns issues to coding agents the way you'd
assign them to a teammate — Go backend (Chi, sqlc, WebSocket), Postgres 17 +
pgvector, Next.js 16 web, Electron desktop, and a **daemon that runs on your
own machine** and spawns any of ~20 agent CLIs (Claude Code, Codex, Cursor,
Grok, Kimi, Antigravity…). It ships no model and drives the CLIs already
installed and authenticated.

The important thing for us is *not* the board. It is that **Multica has already
built, in production Go, four things this ecosystem is missing** — and each one
maps to a specific failure we have paid for.

### 2.1 Runtime liveness that actually notifies

`daemon/daemon.go` treats a runtime going quiet as a first-class event: rows are
marked offline **eagerly** rather than waiting out a 150 s heartbeat, orphaned
rows are swept, and the code comments name the exact hazard — *"the direction
that silently strands work"*, runtimes *"heartbeating that should be offline."*

**Our comparable failure:** the Trinity fleet died on 2026-07-17 22:18 UTC and
the only signal was agents writing *"X is DOWN"* into a log table — **9,280
times in the last week alone, for 29 days, and nobody was paged.** We had
monitoring and no notification. This is the single strongest argument in the
whole assessment.

### 2.2 Failure classified by shape, then retried

`service/autopilot.go` separates *infra-shaped* failures (`timeout`,
`runtime offline/recovery`) which auto-retry, from failures that are *"never
retryable in the first place"*, and hard-skips cases where a retry would produce
the same result.

**Ours:** LESSONS says "flaky is not a diagnosis" and we enforce it by hand.
Multica encodes the distinction in the scheduler.

### 2.3 Cost per run, with unpriced ≠ zero

`daemon/types.go` carries `InputTokens` / `OutputTokens` / `CostUSDTicks` (1e-10
USD), preferring *the provider's own price* over a local pricing table. There is
a regression test (`metrics/pricing_test.go`) written specifically because an
unpriced branch once **reported cost as zero**.

**Ours:** `Figure` in `harness/loop.ts` already distinguishes
reported/missing/malformed, and an absent cost is UNKNOWN rather than zero.
**Same insight, same bug, arrived at independently.** Strong corroboration that
our instrumentation is right — and they have the pricing table we don't.

### 2.4 Attribution to a responsible human, with lineage

`service/task.go` computes the **"top-of-chain human originator"** for a run,
carrying *human + provenance label + delegation lineage + evidence* through
comment-merge and quick-create chains, so a delegated agent action still resolves
to the person who set it off.

**Ours:** this is the operations-layer analogue of the accountability chain the
harness is building with DIDs and signed verdicts. They solved *who is
answerable for this run*; we are solving *can a third party check the verdict*.
Different problems, adjacent, and their answer is shipped.

### 2.5 One more, smaller but immediately useful

`scheduler/` implements **exactly-once cron claims** — advisory lock 4246 plus a
`sys_cron_executions` table so a duplicate tick (a second replica, a manual SQL
call, a leftover `pg_cron` job) takes the conflict path and no-ops, with
stale-steal for a runner that dies mid-window. We run **11 active `pg_cron`
jobs** beside external writers and have no such guard. And `issueguard/` refuses
active duplicate issues — against our **nine dead planning surfaces and ~363k
task rows**, that is pointed.

---

## 3. The licence boundary — the constraint that decides everything

Multica is **Apache 2.0 plus Part I additional conditions**. Two matter to us:

> **(a) Hosted or embedded service.** Unless you have obtained a commercial
> licence … you may not use the Multica source code to provide a hosted service
> to third parties, **or embed Multica as a component of a product or service
> that is sold, licensed, or otherwise commercially distributed to third
> parties.**
>
> *"Internal use within a single organization (including multiple workspaces)
> does not require a commercial licence."*

> **(b) Branding.** You may not remove or modify the Multica logo, product name,
> or attribution shown by a Multica user interface — explicitly including
> `apps/web/`, `packages/views/`, `packages/ui/`, and any code moved, renamed or
> extracted out of them.

**This draws a clean line, and it happens to fall exactly where our pain is:**

| | allowed | why |
|---|---|---|
| **Multica as our internal agent-operations layer** — running the CC/XC/GA lanes, autopilots, review gates, runtime supervision | **YES**, explicitly. Internal use, single organisation | this is where our failures are |
| **Multica inside TrustShell / RepID / the portable harness** shipped to customers | **NO**, without a commercial licence | that is embedding in a commercially distributed product |
| Reading its source for design (what §2 above did) | yes | Apache-2.0 reading rights |

So: **Multica is the workshop, never the merchandise.** HAL, RepID, the ZKP
postcard and x402/ERC-8004 stay ours — that is the product, and the trust
argument collapses if its spine is a dependency we cannot relicense. Anything
that would put Multica *between* a customer and a verdict is out of scope by
licence, and would be a bad idea even if it weren't.

---

## 4. Recommendation

### Short term — do this, it is cheap and it pays now

1. **Keep the skill.** Installed. Principles 2 and 3 are the additive half.
2. **Steal the liveness pattern, not the platform.** A `runtime_offline` alert
   that reaches a *human* is a day of work against `trinity_heartbeat` /
   `agent_heartbeat`, and it is the difference between a 29-day outage and a
   29-minute one. **Do this whether or not Multica is ever adopted** — it is the
   highest-value thing in this document.
3. **Steal the exactly-once cron claim** for our 11 `pg_cron` jobs. Small,
   self-contained, and we already have the duplicate-writer hazard.
4. **Do NOT adopt the platform this week.** W1 of the sprint plan (wire the
   evaluator into `loop.ts`) is unblocked and does not need it. Adopting a Go +
   Postgres + Docker platform mid-flight adds a runtime we would then have to
   keep alive — and keeping runtimes alive is our demonstrated weak point.

### Long term — the real fit

**Multica is a strong candidate to become the harness's execution substrate for
our own agents**, once W0–W2 are closed:

- It already does *doer → review gate → human approval*, which is
  `checker_must_not_be_doer` at the process layer. Our version is cryptographic;
  theirs is operational. **They compose** — a Multica review gate can be the
  place a signed verdict is produced, and the DID comparison stays ours.
- Its per-run token/cost record is a ready-made feed for cost-per-verified-
  outcome, which is §4.4 of the design doc and currently unmeasured.
- Its 20-runtime support means the BFT panel could run **genuinely
  heterogeneous** judges (Claude, Codex, Grok, Kimi) on one board, which is
  exactly the A/B the Evaluator port was built to allow — and the honest fix for
  the 2026-08-09 panel-collapse problem, since panel width becomes observable.

**The sequencing test, and it is not negotiable:** adopt Multica only after the
fleet is back and W1 is wired. Adopting an orchestration platform to fix an
orchestration problem, while the thing being orchestrated is switched off, is
how the last five months of stale surfaces happened.

---

## 5. What NOT to do

1. **Do not put Multica in the trust spine.** Licence forbids it in a shipped
   product, and the trust argument must not depend on someone else's platform.
2. **Do not fork-and-rebrand the UI.** Condition (b) survives moving, renaming
   or extracting the code.
3. **Do not treat their numbers as ours.** Nothing in this document is a
   measurement of Multica's reliability — only a reading of its source.
4. **Do not let this displace W1.** The plan's critical path is unchanged.

## 6. NOT CHECKED

- Anything about the hosted service at multica.ai, its uptime or its terms.
- Whether Multica runs at all in our environment — **not built, not installed,
  not executed.** Go 1.26 + pnpm 10.28 + Docker are prerequisites we have not
  verified here.
- Whether its Postgres schema can coexist with our Supabase project, or would
  need its own database (the README implies its own).
- The security model doc (`multica.ai/docs/security-model`) — web-only, and
  external domains are proxy-denied from this session.
- Whether a commercial licence is available or at what price, if the embedded
  case ever becomes desirable.
