# Agent dispatch engine — one mechanism, many policies

**Status: DESIGN, NOT YET IMPLEMENTED (2026-08-26).** This is the architecture
approved before building the cloud migration for XC and GA. It generalizes two
things that already exist and work — `repid-engine`'s `scripts/dispatch/run-agent.mjs`
(the local XC/GA dispatcher) and `.github/workflows/build-loop-cloud.yml` (T12's
cloud loop, live since Beat 63/64) — into one reusable engine, rather than a third
independent reimplementation.

Parent plan: `docs/NEXUS-BRAIN-SPRINT-PLAN.md` P1 (Tool Capability Registry) and
P2/P6 (the long-loop executor / harness-for-harnesses). This doc is the concrete
spec for the piece those items gestured at.

## The one rule this design follows

**Separate the mechanism from the policy.** Almost every "how do we scale this
from a two-person MVP to a regulated shop" problem is actually a policy decision
hardcoded into a mechanism. So: one dispatch engine, identical whether the team
is two people or two hundred. What changes between an MVP and a regulated
enterprise is a **policy file**, not the code that runs a beat.

## Part 1 — the mechanism (fixed, regardless of tier)

Ten steps, all lensed from what `run-agent.mjs` and `build-loop-cloud.yml` already
do independently, none of it novel — the fix is that XC, GA, and T12 (and whatever
comes after them) should all go through the *same* implementation of this list,
not three copies that drift.

1. **Trigger.** Cron, `workflow_dispatch`, or a GitHub event (new issue, PR
   comment, label). Same engine, different door in.
2. **Checkout with a real identity.** A PAT or app token that is not
   `github-actions[bot]` — GitHub's anti-recursion rule means a bot-authored push
   does not trigger downstream CI, so an autonomous PR opened with the default
   token would look checked and never actually be. `run-agent.mjs`'s
   `LOOP_GH_PAT` requirement, and Beat 63's verification of it (`gh auth status`
   showing a real `github_pat_…` token, not a bot actor), is the reference
   implementation.
3. **Capability contract check.** Before any task is accepted: does this agent
   actually hold what the task requires? `run-agent.mjs`'s `AGENTS` registry
   already does this — XC holds `reasoning + repo_read`, no `shell`, no `http` —
   and refuses a mismatched task (`capabilityRefusal`) rather than let the agent
   produce a plausible, fabricated answer. This is least-privilege applied to
   *what an agent may claim*, not just what it may touch, and it is the fix for
   the 2026-08-05 GA incident (a fabricated review with invented line numbers)
   named throughout `run-agent.mjs`'s comments.
4. **Context assembly.** Inject the shared rules (`LESSONS.md`, capped and
   verbatim — the one channel that reaches every agent, since none of them can
   read `~/.claude` memory, living-docs, or claude-mem) plus task-scoped memory
   pulled from the pgvector recall API already live at
   `repid-engine-production.up.railway.app/api/v1/lessons/recall`. This is "give
   every task the minimum complete context, with deep history retrievable on
   demand" — already half-built as a private implementation detail of one
   script; this makes it the standard loader for every dispatch.
5. **Evidence pre-fetch.** The harness runs real, fenced commands itself (tests,
   typecheck, a specific `git log`) and injects the literal output into the
   agent's context, rather than trusting the agent to run anything. This is what
   turns "I verified it" from a claim into something checkable.
6. **Dispatch.** Call the model — Claude, Grok, Gemini, whatever is added later —
   with the assembled context. The only step that is genuinely swappable per
   agent; see the adapter interface in Part 3.
7. **Claim audit.** After the fact, scan the output for anything that could only
   come from real execution — a stack frame, a `file:line`, an exit code, a test
   count — and flag it if it does not trace back to evidence actually supplied
   in step 5. `run-agent.mjs`'s `auditClaims()` already does this and is the
   direct fix for the fabrication incident; it must run on every beat from every
   agent, unconditionally, regardless of tier.
8. **Push + open a PR.** Never a direct commit to `main` — not at any tier, not
   ever, not as a "lean" shortcut.
9. **Policy gate.** *The pluggable step — see Part 2.*
10. **Durable ledger entry.** Append what happened to a human-readable,
    git-versioned log — the same role `LESSONS.md` / `PRIOR-WORK-INDEX.md`
    already play as this project's working memory. Every beat writes here
    automatically; nobody has to remember to.

Steps 1–8 and 10 do not change with company size or regulatory posture. Step 9
is the entire lean-vs-enterprise question, and it is designed to be the only
thing that does.

## Part 2 — the policy layer (the MVP-to-regulated dial)

### The risk ladder

A diff is classified into one of five risk classes before the policy gate
decides anything. The classifier is a small, swappable piece (starts as
keyword/path heuristics on the diff, same idea as `run-agent.mjs`'s
`scopeForTask()`; can become a dedicated check later if it needs to).

| Class | What it covers | Example |
|---|---|---|
| R0 | Docs, comments, ledger entries | README fix, `LESSONS.md` append |
| R1 | Additive, tested, no prod code path | new function + tests, behind a flag |
| R2 | Behavior change, still shadow/flag-gated | a scoring formula tweak not yet live |
| R3 | Touches money, auth, or a compliance-sensitive surface | payment settlement, PII handling |
| R4 | Schema, infra, or secrets | a new prod table, an env var, an IAM change |

### Tier presets

| Risk class | Lean / MVP | + Specialized vertical pack | Regulated |
|---|---|---|---|
| R0 | auto-merge | auto-merge | auto-merge |
| R1 | auto-merge | auto-merge | 1 human approval |
| R2 | auto-merge | domain check pack, then auto-merge | 2 human approvals |
| R3 | needs human | domain check pack + human | human + compliance sign-off, immutable audit export |
| R4 | needs human (always, everywhere) | same | same, plus segregation of duties — the token that proposed a change cannot be the one that approves it |

A tier is a small config file (`policy/lean.yaml`, `policy/regulated.yaml`, …)
naming, per risk class: whether auto-merge is allowed, how many human approvals
are required, which check packs must pass, and how deep the audit export goes.
Moving a whole system from lean to regulated is changing which file a workflow
points to — not rewriting the mechanism.

### Specialized verticals are packs, not forks

`run-agent.mjs` already loads **domain lesson packs** matched to a task by
keyword (ZKP, ANFIS, HAL) and injects the relevant detail without touching the
dispatcher itself (`matchPacks`/`loadPacks`/`renderPacks`). The identical shape
extends to **domain policy packs**: a healthcare vertical adds a PII-scanner
check; a fintech vertical adds a financial-controls check; a security-sensitive
one adds a mandatory second-model-family review. Each is a small, named,
addable unit selected by what the diff touches — never a reason to duplicate
the pipeline for a new vertical.

## Part 3 — the adapter interface (portability across models/harnesses)

`run-agent.mjs`'s `AGENTS` registry is already ~80% of a clean adapter contract:

```
AGENTS.xc = {
  cli: 'grok', mode: 'argv', args: (prompt) => ['-p', prompt],
  keyVars: ['XAI_API_KEY', 'GROK_API_KEY'],
  capabilities: ['reasoning', 'repo_read'],   // measured, never assumed
}
```

Generalized slightly, the contract every agent/harness implements is:

- `capabilities()` — measured, not declared; an unlisted capability is absent
  (fail closed — this is the exact rule that prevents the 2026-08-05 shape of
  failure from recurring under a new agent).
- `resolveBin()` / connection details — however this agent is actually invoked
  (a CLI spawn, an SDK call like `claude-code-action`, a future API).
- `start(task, context)` — run one beat, return output + whatever artifacts it
  produced.

T12 already proves this works across a completely different transport
(`claude-code-action`'s SDK call vs. XC/GA's raw CLI spawn) — the mechanism
does not care which, as long as the adapter reports its capabilities honestly.
Adding a future model or harness is a new registry entry, not new pipeline
code. (This is the same interface the earlier `NEXUS-BRAIN-SPRINT-PLAN.md`
sketched as `HarnessAdapter` under P6 — this is that idea, scoped to what two
already-working implementations prove is needed today, not the full spec in
advance of a second real consumer.)

## Part 4 — elasticity (zero standing infrastructure)

Because every beat runs in an ephemeral GitHub Actions runner, "scaling" is
adjusting three numbers, never provisioning anything:

- **Frequency** — cron cadence, or event-triggered instead of scheduled. (T12's
  cadence was tuned from hourly to every-4-hours today purely on observed
  per-beat cost — a one-line change, no redeploy.)
- **Concurrency** — how many beats/agents run in parallel; a config value.
- **Cost tier** — a cheap, narrow-scope model for a lean beat; a frontier model
  for a hard vertical problem; a parameter passed to the adapter, not an
  architecture change.

A one-person MVP and a much larger regulated team run the *identical* engine,
at different knob settings. Nothing is ever idle-but-provisioned.

## Part 5 — the floor that never moves

Independent of tier, always true, because these are safety invariants and not
policy choices:

- Never push directly to `main`.
- Never flip an operator-gated enable flag (the existing `HARD PROHIBITIONS`
  block in `run-agent.mjs`'s dispatch preamble is the reference list).
- No secrets in code; the child process environment is pruned to only the one
  credential it needs, and every known secret value is scrubbed from any
  transcript before it is written or printed (`buildChildEnv` / `makeScrubber`
  in `run-agent.mjs` — reuse verbatim, do not reinvent).
- Capability-based refusal beats fabrication, always (Part 1, step 3).
- The claim audit always runs (Part 1, step 7).

"Lean" means less governance **above** this floor. It never means removing the
floor — the floor is what makes autonomy safe to grant at all, at any size.

## Rollout plan

Deliberately staged — build the lean tier for a second real agent before
generalizing further, same "don't build ahead of the first proven consumer"
discipline as everything else in this sprint's index.

1. **Extract the shared mechanism** (Part 1) out of `run-agent.mjs` into a form
   both a GitHub Actions workflow and a local script can call — most likely a
   small reusable workflow (`workflow_call`) plus the existing pure functions
   (`auditClaims`, `evidenceRefusal`, `buildChildEnv`, `makeScrubber`,
   `capabilityRefusal`) already unit-tested in `tests/dispatch-runner-seams.test.ts`
   in `repid-engine`, imported rather than duplicated.
2. **Define exactly one policy file** — `lean.yaml` — matching what T12's loop
   already does today (safe-class auto-merge, everything else surfaced to the
   ledger). No `regulated.yaml` yet; there is no second consumer needing it yet.
3. **Build the XC and GA cloud workflows** on top of the shared mechanism +
   lean policy — the actual migration this design was requested for. Needs the
   same one-time secret setup pattern as T12 (`XAI_API_KEY`/`GEMINI_API_KEY` as
   repo secrets, a PAT, per Part 1 step 2), tested via `workflow_dispatch`
   first, exactly as Beat 63 tested T12's before its schedule was enabled.
4. **Only once a second real vertical or a real regulatory requirement
   appears**, add the risk-ladder classifier and a second policy file. Not
   before — a policy tier built ahead of a use case is the same shape of
   mistake as a schema built ahead of its first consumer (see `LESSONS.md`
   A32–A34, this same sprint).

## What this document is not

Not a claim that any of this is built. `run-agent.mjs` and `build-loop-cloud.yml`
are real and live; the shared engine, the policy-file mechanism, and the XC/GA
cloud workflows described above do not exist yet. This is the approved shape
to build them in, so step 3 above doesn't become a third independent
reimplementation.
