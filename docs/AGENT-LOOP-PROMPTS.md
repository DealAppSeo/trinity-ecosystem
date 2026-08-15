# Agent loop prompts — the dogfooding roster

**This is not a plan and it is not a priority list.** Priorities live in
`trinity_tasks` filtered by `v_agent_preflight` (see `NORTH-STAR.md`); open
technical work lives in `NEXT.md`. This file answers a different question:
*given those, what does each agent in the fleet do, on what territory, and what
does it say when it stops.*

It exists because running four agents against one repo without assigned
territory produces merge conflicts and duplicated sprints, not four times the
output. The lane table below is the load-bearing part. The prompts are just the
lane table written out so it can be pasted.

---

## The roster

**Two different kinds of agent, on two different clocks.** Conflating them is
the first mistake to avoid.

| tag | what it is | clock |
|---|---|---|
| **CC**, CC1, CC2 | Claude Code | **build time** — writes code, opens PRs |
| **XC**, XC1 | Grok Code / xAI Code (chat + terminal) | **build time** |
| **GA**, GA1 | Gemini in Antigravity | **build time** — terminal; the IDE surface is heavy |
| **T12** | Trinity12 — the orchestration fleet on Railway | **run time** — 12 services that *are* the product |

T12 is not a fourth developer. It is nine agent services under three managers
(Alpha: `trinity-torch`, `trinity-veritas`, `trinity-gcm`; BETA: `trinity-chesed`,
`trinity-mel`, `trinity-apm`; GAMMA: `trinity-sophia`, `trinity-nexus`,
`trinity-hdm`) plus three orchestration services (`trinity-orch`, `trinity-w3c`,
`trinity-shofet`). CC, XC and GA change T12's code. T12 runs.

So the lane table below assigns **build-time** territory to CC, XC and GA, and
the verify lane rotates among them. T12 gets its own section, because runtime
verification is a different problem with a different failure mode.

---

## Lane assignment — why these boundaries

The lanes are drawn so that **no two agents write the same files.** That is the
only property that makes parallel instances cheaper than serial ones. A lane
owns paths; if work needs a path outside its lane, the agent writes a handoff
line rather than reaching across.

| lane | owner | owns these paths | must not touch |
|---|---|---|---|
| **Kernel** | CC | `lib/trustshell/**`, `scripts/harness-*`, `scripts/check-*`, `docs/*SPEC*.md`, `docs/TRUST-HARNESS.md` | `app/**`, `package.json` deps |
| **Surface** | XC | `app/**`, `components/**`, site content, staleness/freshness jobs | `lib/trustshell/**` |
| **Supply** | GA | `package.json`, `package-lock.json`, `.github/workflows/**`, `Dockerfile*`, `SECURITY.md`, `.github/dependabot.yml` | `lib/**`, `app/**` |
| **Verify** | rotates: whichever of CC/XC/GA did **not** author the sprint | `docs/SPRINT-LOG.md` verdict lines, `LESSONS.md`, new `scripts/*-test.mjs` **only when reproducing a defect** | any file another lane is mid-sprint on |

The verify lane has no permanent owner on purpose: its only requirement is that
the agent running it did not write the thing it is checking. Rotating it costs
nothing and removes the one bias that matters.

Two paths are **shared and therefore append-only**: `docs/PRIOR-WORK-INDEX.md`
and `docs/SPRINT-LOG.md`. Add your entry at the end of the relevant section;
never reflow or reorder someone else's. That keeps the merge textual.

`CLAUDE.md`, `NORTH-STAR.md` and `NEXT.md` are **read-only to every lane** except
by explicit instruction. They are the shared ground truth; an agent editing its
own ground truth mid-loop is how a fleet drifts.

---

## The shared contract — every lane, every loop

Paste this above whichever lane prompt you are using.

```
You are one of four agents working the same ecosystem in parallel. Before
anything else:

1. Read CLAUDE.md, then docs/PRIOR-WORK-INDEX.md. If your task is on the CLOSED
   list, stop and say so — the answer is already known. If it cites a RETRACTED
   number, that number is wrong; use the correction.
2. Stay inside your lane's paths (docs/AGENT-LOOP-PROMPTS.md). Work outside them
   is written as a handoff line, not as an edit.
3. Compute the ceiling before optimising toward it. If the remaining prize is
   under 1pp, refuse the work and say why. Routing is CLOSED at 97.9% of its
   omniscient bound — anything justified by "better routing" is dead on arrival.
4. Run it; do not read it. A claim with no executed evidence behind it is
   written as NOT CHECKED, never as a pass.
5. Report three outcomes, never two: VERIFIED / NOT CHECKED / FAILED.

Gates, all of which must pass before you claim done:
   npm run check          # includes check:prior-work, check:secrets, tsc --noEmit
   npm run check:identity # expect VERIFIED
   npm run test:e2e       # expect 0 FAILED

Finish every loop with exactly this block and nothing after it:

  LANE:      <kernel|surface|supply|verify>
  DID:       <one line>
  EVIDENCE:  <the command you ran and its verdict>
  GATES:     <pass/fail per gate, or NOT CHECKED>
  HANDOFF:   <work you found outside your lane, addressed to a lane>
  NEXT:      <the single next item in your lane, or NONE>
```

The final block is the point. It is short enough to paste between agents, it is
the same shape from all four, and `HANDOFF:` is how cross-lane work moves
without two agents editing one file.

---

## CC — the kernel lane

**Standing brief:** *be the missing consumer.* Six subsystems in this repo are
built, tested, and reached by nothing (`docs/AGENT-LOOP-SCOPE.md` measured 47
harness settings with **zero** production consumers). The value is 0→1 on
enforcement, not optimisation of anything already measured.

```
LANE: kernel. Paths: lib/trustshell/**, scripts/harness-*, scripts/check-*,
docs/*SPEC*.md, docs/TRUST-HARNESS.md.

Loop, one item per pass:

1. Open NEXT.md. Take the highest item in Tier 1–3 that is NOT marked DONE and
   NOT in the "Blocked — needs Sean" list.
2. Before writing code, state in one line what would make this item FAIL, and
   write the check that would catch it. If you cannot name a failure the check
   would catch, the check is decorative — say so and pick a different item.
3. Build the smallest change that makes that check go from red to green. Do not
   replace an existing gate in the same change as adding a new one; run them
   side by side and measure disagreement first.
4. Mutation-test the check: break the thing it guards, confirm it goes red,
   restore. A check that cannot fail is not a check. Verify the assertions
   actually executed — this repo has twice shipped assertions that reported
   VERIFIED from inside a catch block.
5. Run the gates. Append a dated entry to docs/SPRINT-LOG.md and a row to
   docs/PRIOR-WORK-INDEX.md.
6. Emit the report block. Then start the loop again.

Refuse on sight: any work whose justification is better routing, better
scheduling, or a scoring-parameter retune. Those are closed; the total
remaining prize is 2.00pp and the ceiling analysis is already written.
```

## XC — the surface lane

**Standing brief:** *no surface may show a stale number as if it were current.*
There are two known live instances — the Brier-calibrated code-review table on
hyperdag.org and the trust score on trustchat.dev/leaderboard. They are almost
certainly the same underlying question read by two consumers, which means the
fix is **one source of truth and two readers**, not two refresh jobs.

```
LANE: surface. Paths: app/**, components/**, site content, freshness jobs.

Loop, one item per pass:

1. Pick one rendered number on one surface. Trace it to the query that produces
   it. Record when that query last returned new data.
2. If the number is stale, do not refresh it by hand. Ask first whether another
   surface renders the same number from a different source — if so, the change
   is to collapse them to one source, and the second surface becomes a reader.
3. Every panel that renders a number renders one of three states: LIVE, NOT
   CHECKED, or FAILED. A dash that means "we did not look" is a lie and is
   treated as a defect. Add the state before adding the refresh.
4. A scheduled scan needs a visible last-run timestamp on the surface itself.
   A refresh job whose failure is invisible is worse than no job, because the
   number then looks current and is not.
5. Run the gates. Emit the report block.

Two standing items, both from the owner, both in this lane:
  - hyperdag.org's Brier-calibrated code-review table must re-scan at least
    weekly for newly released models and re-rank. Design the scan so a model
    added with no evidence yet ranks as NOT CHECKED, not as zero.
  - trustchat.dev/leaderboard's trust score is stale. Check whether it can read
    the same table before building it a second pipeline.

Both live in repos outside this one. If your session cannot reach them, say so
in HANDOFF rather than approximating the work here.
```

## GA — the supply lane

**Standing brief:** *nothing enters the build unreviewed, and no credential
survives in an artifact.* This lane is deliberately mechanical and bounded —
it is the one where a heavier, slower agent costs least.

```
LANE: supply. Paths: package.json, package-lock.json, .github/workflows/**,
Dockerfile*, SECURITY.md, .github/dependabot.yml.

Loop, one item per pass:

1. npm audit. Take the highest-severity advisory that has a fix. Apply it
   alone — one advisory per change, so a regression names its own cause.
2. Confirm no specifier is floating. A dependency at "latest" means a fresh
   install can resolve to code nobody reviewed; that is the npm supply-chain
   vector of the last two years, and it is why every specifier here is pinned.
3. Check that no build passes a credential as ARG or ENV. repid-engine's
   Dockerfile currently does this with BASE_SEPOLIA_PRIVATE_KEY and the
   Supabase service key, which persists them in image layers — read at runtime
   only. This is the most live credential issue open (NORTH-STAR.md).
4. Verify a CI gate can actually fail. Break the thing it guards, watch it go
   red, restore. Read the credential line in the job summary, not the green
   tick: "NOT CHECKED" and "valid" are both green runs.
5. Run the gates. Emit the report block.

Never: publish a package, push a tag, or re-enable legacy Supabase API keys.
Tag pushes are irreversible and a version can never be reused. Those are
owner-gated without exception.
```

## Verify — rotating build-time lane

**Standing brief:** *try to falsify what the other lane just claimed.* This lane
produces no features. Its output is either a confirmation with the command that
produced it, or a defect with a reproduction.

```
LANE: verify. Paths: docs/SPRINT-LOG.md verdict lines, LESSONS.md, and new
scripts/*-test.mjs ONLY when reproducing a defect you found.

Loop, one item per pass:

1. Take the most recent report block from CC, XC or GA. Ignore its DID line and
   read only its EVIDENCE line.
2. Re-run that evidence yourself, from a clean checkout. Three questions, in
   order:
     a. Did the assertions execute at all, or did they sit somewhere unreached?
     b. Is the sample the thing being claimed about? (Every real-data retraction
        in this repo came from an assumption about the SHAPE of the data made
        without checking it — order, id ordering, window length.)
     c. Would this check still pass if the thing it guards were broken?
3. If it survives all three, write VERIFIED against that sprint entry with the
   command and the date. If it does not, write the defect into LESSONS.md with
   its root cause — not just its symptom — and hand it back to the owning lane.
4. Once per pass, pick one figure published in the last week and check whether
   it still holds. A number published with an unpaid caveat is provisional; two
   retractions here were caught by caveats their own author had written and then
   ignored.
5. Emit the report block. VERIFIED with no command in EVIDENCE is itself a
   defect — report it as NOT CHECKED.

You may not fix what you find outside a reproduction test. Finding it and
handing it back is the whole job; fixing it puts you in someone else's lane.
```

---

## T12 — runtime verification

Observed 2026-08-15 from the Railway project view and UptimeRobot. Re-check
before relying on any of it.

### Monitoring is not verification

UptimeRobot reports **13 up, 4 paused, 100% uptime, 0 incidents**. In the same
window, Railway shows **`repid-decay-weekly` offline**. Both are true, because
they answer different questions:

- **Liveness**: did the service respond? UptimeRobot answers this well.
- **Verification**: did the thing it exists to produce actually get produced?
  Nothing answers this today.

A weekly job's failure mode is *silence*, and silence returns 200 from anything
that is still listening. `EarnedMetrics` decay is **time-dependent** — a score
changes with no new events (`NEXT.md` §4d) — so a decay job that has not run
leaves every score stale-high, and no dashboard goes red. That is the same
defect shape as the rest of this repo's failure log: a system reporting success
it has not earned.

**`repid-decay-weekly` is therefore the first verifier target,** not because it
is the most broken but because it is the clearest example of a claim whose
absence is invisible.

### Raven and Atlas as verifiers — yes, with three corrections

Putting the verifiers on Supabase edge functions while the fleet runs on Railway
is the right instinct and the right cost shape. Verification is low-frequency
and small-payload; per-invocation billing fits it, and an always-on container
per verifier would be the expensive mistake. Three things have to be true first.

**1. Name the independence honestly — it is partial.** Raven and Atlas have
independent *compute* (different provider, different network, different deploy
pipeline). They share *data*: the same Supabase Postgres the fleet writes to. So
they survive a Railway outage, a bad Railway deploy, and a runaway fleet
service. They do **not** survive a Supabase outage, a bad RLS migration, or a
schema change — those take out the substrate and the observer together. Write
that down next to the design, because a redundancy claim that is wrong about its
own failure domain is worse than none.

**2. The verifiers must be monitored more strictly than what they verify.**
`atlas-constitutional-decisions`, `raven-constitutional-decisions` and
`update-signals` have been **paused for roughly six weeks** and nothing
surfaced it. A verifier that can be silently off is worse than no verifier,
because the dashboard reads green either way. Un-pausing is not step one. Step
one is a **heartbeat the verifier writes itself**: a row per run, with a
timestamp; a missing row for N periods is an incident. Liveness of a verifier
must be measured by its *output*, never by its HTTP status.

**3. Their source is not in this repo.** `supabase/functions/` holds only
`agent-tools` and `embed-memory-backfill`. Three functions are deployed with no
source under version control here — they cannot be reviewed, gated by CI, or
rebuilt if lost. Fix that before giving them a verification role, or the
verifier becomes the least trustworthy component in the system.

### Do not build a two-of-two quorum

With two verifiers the tempting design is a vote, and both readings are bad:
2-of-2 means either verifier can halt the fleet by failing, and 1-of-2 means
either can wave through a bad claim. Neither is what redundancy is for.

**Have both write verdicts independently, and treat disagreement as the alarm.**
That is already the pattern in `lib/trustshell/CustodyShadow.ts`, which observes
and changes nothing, and whose `not_comparable` reading is the *measurement*
rather than a fault. Agreement is cheap information; disagreement is the
expensive, valuable information, and escalating it to a human is correct.

### Bound the healing authority

Self-healing needs a **bounded** action, or the healer becomes the outage. The
split that holds:

| a verifier may | a verifier may not |
|---|---|
| write a verdict | restart, redeploy or scale anything |
| write a heartbeat | mutate the data it verifies |
| trip a pause flag the fleet reads | un-trip its own pause flag |

Restart authority also destroys the property being bought: a verifier that can
change what it observes is no longer independent of it.

### Antifragile is a feedback claim, not a redundancy claim

Redundancy buys **availability**. Getting *better* from stress is a different
mechanism: the failure has to be recorded and fed back into a decision. This
system is one link short of having that, and the link is already specified —
`lib/trustshell/reputation-transition.ts` defines a committed-history contract
and **has no producer** (`NEXT.md`, `docs/AGENT-LOOP-SCOPE.md`).

A verifier verdict per run is exactly that producer. Wiring it closes the chain
the whole product is premised on:

```
  outcome ──► verified verdict ──► committed event ──► read-time score ──► routing weight
                                   ^^^^^^^^^^^^^^^
                                   the link that is missing today
```

Until that is wired, two verifiers are redundancy and nothing more — which is
worth having, but should not be described as self-learning.

### Loop prompt

```
LANE: runtime (T12). Surfaces: Railway fleet, Supabase edge verifiers,
UptimeRobot. This lane observes and reports; it does not deploy.

Loop, one item per pass:

1. Pick one service that is supposed to PRODUCE something on a schedule. Find
   its most recent output row and its timestamp. Not its HTTP status — its
   output.
2. Classify it in three states: PRODUCING / NOT CHECKED / STALE. "Responds to
   health checks" is NOT CHECKED, not PRODUCING.
3. If STALE, report how long, and what downstream number is wrong as a result.
   A stale job matters only through the number it corrupts; name that number.
4. Confirm the verifier that should have caught this has a heartbeat of its own.
   If it does not, that is the higher-priority defect — file it first.
5. Never restart, redeploy or scale as part of this loop. Write the verdict and
   hand off.

Standing state to re-check each pass (observed 2026-08-15, verify before use):
  - repid-decay-weekly: OFFLINE. Decay is time-dependent, so scores are
    stale-high while it is down.
  - atlas/raven-constitutional-decisions, update-signals: PAUSED ~6 weeks,
    unnoticed. No source in this repo.
  - py-brain: 30 warnings. Flowise: 4. Neither triaged.
  - UptimeRobot: 17/50 monitors, 4 paused. A paused monitor contributing to a
    100% uptime figure is the dash that means "we did not look."
```

---

## Spending fewer turns

Measured on this repo (`docs/CONTEXT-BUDGET.md`, one real session): structured
MCP tool results were **~48%** of context; file reads were **5.4%**. The
intuition that an agent's context is mostly source code is backwards here. Two
consequences for how to brief an agent:

- **Name the file.** "Look at `lib/trustshell/harness/router.ts`" costs one read.
  "Find where routing happens" costs a search, three reads, and a wrong guess.
  This is the cheapest single thing an operator can do.
- **One decision per message.** Most turn inflation in this project has come
  from an agent stopping to ask which of two readings was meant. Stating the
  assumption you want it to make — "assume testnet, assume no mainnet value" —
  removes the round trip entirely.
- **Say when something is exploratory.** "Have a look and tell me" and "build it
  and ship it" deserve very different amounts of work, and an agent cannot tell
  them apart from the task text.
- **Point at the ground truth once, not repeatedly.** `CLAUDE.md` loads
  automatically. `docs/PRIOR-WORK-INDEX.md` is the map. An agent that reads both
  first does not need the history re-explained.

`Read` had a **59.4% stale rate** in that same measurement — 23 reads of files
that had already been edited since. That is the argument for `npm run graph`:
a structural question answered by a graph query never pulls a file body into
context at all.

## Local hygiene

Not repo work, but it is on the same constraint. The two directories that grow
without bound on a machine running several agents are `node_modules` and the
agent transcript store.

```bash
# what is actually large, top 20
du -sh ~/* 2>/dev/null | sort -rh | head -20

# node_modules across every checkout — usually the single biggest win
find ~ -type d -name node_modules -prune -exec du -sh {} +

# safe to delete anywhere: they rebuild from the lockfile
find ~ -type d \( -name .next -o -name .turbo -o -name dist \) -prune -exec rm -rf {} +
```

Agent transcripts under `~/.claude/projects` are the ones worth **archiving
rather than deleting** — they are the input to `npm run mem:audit`, and they are
the only record of how a decision was reached once a session ends. Move them to
external storage on a schedule; do not purge them with the build artifacts.

`tsconfig.tsbuildinfo` deserves its own line: it is a build artefact that every
`tsc` run rewrites, and a stale one has already manufactured phantom compile
errors in this repo (LESSONS A12). Deleting it is always safe and is the first
thing to try when `tsc` reports something CI does not.
