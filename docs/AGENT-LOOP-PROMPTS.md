# Agent loop prompts — the dogfooding roster

**This is not a plan and it is not a priority list.** Priorities live in
`trinity_tasks` filtered by `v_agent_preflight` (see `NORTH-STAR.md`); open
technical work lives in `NEXT.md`. This file answers a different question:
*given those, what does each agent in the fleet do, on what territory, and what
does it say when it stops.*

It exists because running four agents against one repo without assigned
territory produces merge conflicts and duplicated sprints, not four times the
output. The lane table below is the load-bearing part.

**The paste-ready prompts live in [`prompts/`](../prompts/)** — one self-contained
file per agent (`CC.md`, `XC.md`, `GA.md`, `VERIFY.md`, `T12.md`). Each already
carries the shared contract, so pasting one file is enough. **Edit them there.**
This document is the reasoning; those files are the instrument, and keeping two
copies of a prompt is how they drift apart.

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

### Shared surfaces — append at the end, never reflow

These belong to no lane, and **every** merge conflict on 2026-08-16 came from
one of them. Add your entry at the **end** of the relevant list or section;
never reorder, regroup or reflow someone else's. That is the whole rule, and it
turns a manual resolution into a textual merge.

| path | why it collides |
|---|---|
| `docs/PRIOR-WORK-INDEX.md` | every lane adds a row when it finishes |
| `docs/SPRINT-LOG.md` | every lane appends a dated entry |
| `scripts/mutations.mjs` | every new gate brings mutants — another agent called it *"a conflict magnet"* in a commit title, and it conflicted on two consecutive PRs |
| `package.json`, the `check:*` block | every new suite adds a script; `npm run check` discovers them, so **only** the block collides |

**Both sides of a `mutations.mjs` conflict usually end on an unclosed object**,
closed by a shared `},` below the marker. Taking both halves verbatim gives a
syntax error; the union needs a `},` inserted between them. Resolve it as a
union — never pick a side, because each side is a different lane's gate, and
dropping one silently removes a guard while the build stays green.

**`npm run mutate` is how you check a resolution.** A union that quietly lost
one lane's mutant shows up as a survivor. On 2026-08-16 that check confirmed two
merges at 43/43 and 68/68 caught, 0 survived.

Generated files are **not** in this category, because they have one author: the
generator. `next-env.d.ts` and `tsconfig.json` are rewritten by `next build`, and
two lanes committed opposite values of `jsx` past each other before the repo
started holding what the generator writes.

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
   under 1pp, refuse the work and say why. Routing is CLOSED at 98.16% of its
   omniscient bound over 24 paired seeds, total remaining prize 1.84pp — anything
   justified by "better routing" is dead on arrival.
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

**The paste-ready prompt is [`prompts/CC.md`](../prompts/CC.md).** It is self-contained —
it already includes the shared contract, so it is the only thing that needs
pasting. Edit it there, not here; this section is the reasoning, that file is
the instrument.

## XC — the surface lane

**Standing brief:** *no surface may show a stale number as if it were current.*
There are two known live instances — the Brier-calibrated code-review table on
hyperdag.org and the trust score on trustchat.dev/leaderboard. They are almost
certainly the same underlying question read by two consumers, which means the
fix is **one source of truth and two readers**, not two refresh jobs.

**The paste-ready prompt is [`prompts/XC.md`](../prompts/XC.md).** It is self-contained —
it already includes the shared contract, so it is the only thing that needs
pasting. Edit it there, not here; this section is the reasoning, that file is
the instrument.

## GA — the supply lane

**Standing brief:** *nothing enters the build unreviewed, and no credential
survives in an artifact.* This lane is deliberately mechanical and bounded —
it is the one where a heavier, slower agent costs least.

**The paste-ready prompt is [`prompts/GA.md`](../prompts/GA.md).** It is self-contained —
it already includes the shared contract, so it is the only thing that needs
pasting. Edit it there, not here; this section is the reasoning, that file is
the instrument.

## Verify — rotating build-time lane

**Standing brief:** *try to falsify what the other lane just claimed.* This lane
produces no features. Its output is either a confirmation with the command that
produced it, or a defect with a reproduction.

**The paste-ready prompt is [`prompts/VERIFY.md`](../prompts/VERIFY.md).** Hand
it to whichever agent did *not* author the sprint being checked — that is the
lane's only staffing rule.

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

**The paste-ready prompt is [`prompts/T12.md`](../prompts/T12.md).** It is self-contained —
it already includes the shared contract, so it is the only thing that needs
pasting. Edit it there, not here; this section is the reasoning, that file is
the instrument.

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
