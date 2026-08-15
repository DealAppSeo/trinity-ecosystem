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

| tag | what it is | how it is run today |
|---|---|---|
| **CC**, CC1, CC2 | Claude Code | multiple instances, this repo |
| **XC**, XC1 | Grok Code / xAI Code (chat + terminal) | terminal, lighter |
| **GA**, GA1 | Gemini in Antigravity | terminal — the IDE surface is heavy |
| **T12** | *see the note below* | — |

**T12 — stated assumption.** The roster was given as CC, XC, GA and T12, and the
first three were identified by vendor. T12 was not. Rather than block, its lane
below is defined **by function, not by vendor**: T12 is the independent verifier,
and its prompt assumes nothing about which model runs it. If T12 is in fact a
fourth builder, swap it onto a builder lane and leave the verifier lane
unassigned — but do not leave the verifier lane *unrun*. It is the one that keeps
the other three honest, and this repo's entire failure log is about systems
reporting success they had not earned.

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
| **Verify** | T12 | `docs/SPRINT-LOG.md` verdict lines, `LESSONS.md`, new `scripts/*-test.mjs` **only when reproducing a defect** | any file another lane is mid-sprint on |

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

## T12 — the verify lane

**Standing brief:** *try to falsify what the other three just claimed.* This
lane produces no features. Its output is either a confirmation with the command
that produced it, or a defect with a reproduction.

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
