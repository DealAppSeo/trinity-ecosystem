# Fleet truth — one honest reading of "how many T12 agents are live", and how to give them verifiable work

**Status: a standing regression guard over an already-diagnosed problem, plus a
plan for verifiable tasks.** The diagnosis (parts 1a) is PRIOR WORK — credited, not
re-derived. What is new here is the *antibody* (a probe that fails if the fix is
ever forgotten) and the task-feeding design (parts 2–3, PROPOSED, every gated
action marked yours). Do not read this as "the fleet is working."

Enforced by `scripts/redteam/probes/fleet-liveness-truth.mjs` (**FLEET-001**);
evidence in `scripts/redteam/evidence/fleet-liveness-reconciliation.json`.
Companion: `docs/CROSS-AGENT-VALIDATION.md` (the validation loop this fleet feeds).

---

## Part 1a — the diagnosis (PRIOR WORK, credited)

This was already root-caused. See PRIOR-WORK-INDEX **`hal-volume-stopped-2026-07-17`**
(owner T12) — do not re-derive it. In short:

- The T12 processes are **up and looping**, not down. A redeploy would change
  nothing and would have looked like a fix.
- The **task pipeline stopped 2026-07-18**; **agent-side heartbeat writes were
  removed 2026-07-17.** So `v_fleet_truth.is_live` (which never consults the
  health probe) reads **0/12 — a FALSE NEGATIVE.** `.claude/skills/trinity-preflight`
  names the trap: *absence of a signal you turned off is not evidence of absence.*
- It is a **supply problem, not an outage**: 12 live processes with nothing
  reaching them. That re-owned it from "Sean redeploys" to **"T12 feeds the fleet."**
- **The canonical instrument already exists: `v_agent_state`** (migration
  `20260827100500`) — one row per agent, `state ∈ {working, idle, wedged, down,
  unknown}`, each with an `evidence` string and the task discriminator
  `current_task_id`, fed from the probe every ~5 min. The prior entry says
  plainly: **read `v_agent_state`; do NOT read `v_fleet_truth` for liveness.**

## Part 1b — the reconciliation, pinned (what this adds)

The reason the conflict *felt* unresolved is that six sources answer "how many
agents are live" with four different numbers, and nothing made the canonical one
win. Measured 2026-09-02, all twelve T12 agents:

| source | count | verdict |
|---|---|---|
| **`v_agent_state`** (canonical) | **12 idle / 0 working** | **AUTHORITATIVE** — probe-fed, evidence-bearing, holds the task discriminator |
| `agent_health_probes` ok < 24h | 12 reachable | process answers a health check — **what Railway / UptimeRobot see**; not liveness |
| `v_fleet_truth.is_reachable` | 12 reachable | same reachability notion |
| `trinity_agent_logs` work < 24h | 2 of 19 | wrote a log row recently; narrow, mixes non-T12 infra |
| `v_fleet_truth.is_live` | 0 | **KNOWN FALSE NEGATIVE** — ignores the probe, counts a removed heartbeat as death. **Do not read.** |
| `agent_heartbeat` < 24h / < 10m | 0 | self-reported heartbeat, removed 2026-07-17 |

### The canonical reading — from `v_agent_state`, at the mechanism level

> **All 12 T12 agents are `idle`, evidence: "loop advancing, no task held".**
> `current_task_id` is null on all 12; `loop_count` is ~5,750 and climbing (it was
> ~1,624 on 2026-08-27 — the loops have advanced continuously for six days);
> last iteration ~2 min ago.

**Up and looping, starving for tasks — proven, not inferred.** The agents are
executing their loop every ~2 minutes and holding no task. That is the mechanism
behind "bored, starving for tasks", and it is why the fix is *feeding*, not
*resurrecting*. (Earlier drafts of this doc inferred a "09:15 dispatcher petered
out" story from log timestamps; the prior entry root-causes it properly — pipeline
stop 07-18, Railway stopped the containers, *why* Railway did so is NOT CHECKED
from an agent session. Cite that, not the inference.)

### The rule, and the antibody

**Liveness is read from `v_agent_state`; a non-canonical signal (a health probe, a
removed heartbeat, a row count) must never be reported as liveness, and an agent
holding no task is `idle`, never `working`.** `FLEET-001` judges the recorded
canonical evidence and **BREACHES** the moment a no-task agent is labelled
`working`/live, a state row carries no `evidence`, or the canonical source reverts
to `v_fleet_truth`. It **HELD** on first run (12 idle, 0 working, all
evidence-backed) and is **mutation-tested** — flipping one no-task agent to
`working` turns it BREACH / suite exit 1. The prior work told the *next* session
the right instrument via a SessionStart hook; this tells *every* consumer, forever,
by failing the build if the wrong one is used.

---

## Part 2 — give them verifiable evergreen work (not theater)

The substrate exists and is theater only in that it has **never run**.
`agent_evergreen` holds **24 designed loop-tasks** with the right columns for
verifiability (`task_name`, `cron_expression`, `last_run`, `success_rate`,
`output_location`, `last_output_preview`, `output_quality_score`). Measured
2026-09-02: all 24 `status='active'`, but **`last_run` NULL on all 24**,
`success_rate=0.00`, zero output previews. `status='active'` is aspirational.

Several designed tasks are already the roles this plan needs:

| agent.task | output_location | role |
|---|---|---|
| `HDM.daily_prioritization` | `trinity_tasks` | pull from the plan, prioritize into tasks (**the planner role, part 3**) |
| `ANTIGRAV.micro_task_generation` | `task_chunks` | break big tasks into small ones |
| `VERITAS.output_validation` / `consensus_verification` | `validation_log` | the cross-validator (feeds `docs/CROSS-AGENT-VALIDATION.md`) |
| `NEXUS.api_health_monitoring` | `health_dashboard` | evergreen ops signal |
| `TORCH.zkp_repid_research` | `/research/zkp/` | the zk work the validation loop depends on |

### The one contract that makes it "verifiable, not theater"

From this repo's discipline and the smolagents PoC bar
(`docs/AGENTIC-SECURITY-STACK.md`): **a task is DONE only when it writes a fresh,
independently-judgeable artifact to its `output_location`. A `status`, a
`success_rate`, or a heartbeat is NOT evidence** — those are exactly the signals
part 1 shows lying. Each task must satisfy, and a probe must be able to check:

1. **A real output row/file exists** at `output_location`, written *after* `last_run`.
2. **Judged by a different principal than produced it** — the VERIFY-lane rule
   (`check:verifier-independence`) applied to runtime output. `VERITAS` is that
   principal for most; VERITAS's own output is judged by a peer, never itself.
3. **A do-nothing run fails the check** (ABC III.13 / `ABC-TRIVIAL-001`): filler or
   an empty artifact scores NOT done.
4. **A trust/reputation output is backed by a real zk proof** (`is_real=true`,
   attested — `XVAL-001`), not a self-reported number.

**BUILT — probe `EVERGREEN-001`** (`scripts/redteam/probes/evergreen-verifiability.mjs`):
reads `agent_evergreen` and BREACHES if any task reports `success_rate>0` while it has
never run (a score with no run) or shows no output (a success with nothing to point at).
Today it lands **NOT_CHECKED** — 24/24 tasks marked `active`, 0 ever ran, so there is no
output whose reality can be judged and, honestly, no row yet claims success it cannot
show. It is **mutation-tested**: fabricating a `success_rate=0.95` on a never-run task
flips it to BREACH / suite exit 1. It flips to HELD once tasks run and their claimed
successes are shown — so the loop is guarded against theater from its first execution,
not after someone notices.

### Gated (yours) vs not (mine)

- **NOT gated** — the verification contract, `EVERGREEN-001`, and wiring each
  task's success criterion to a judged artifact. Read-only; gates honesty, not spend.
- **GATED (Sean)** — *dispatching* tasks the agents execute is a runtime action
  (vendor keys + the dispatcher on your local machine, per the executor fences and
  the OPEN `SPRINT-E2E-TASKS` item — which `hal-volume-stopped-2026-07-17` notes is
  now unblocked for a live host). A cloud session cannot and should not send these.

---

## Part 3 — the planner (a different-family agent → eventually your PAI)

The ask: an agent that pulls from the vision / master-plan docs, breaks them into
**prioritized small tasks with checkable outcomes**, and feeds the fleet —
eventually your Personal AI's job. The role is real and half-designed already
(`HDM.daily_prioritization → trinity_tasks`, `ANTIGRAV.micro_task_generation →
task_chunks`, both never run). It sits **above** the `ai_dispatch` reader task
(`SPRINT-E2E-TASKS.md`): the reader consumes messages; the planner generates the
prioritized tasks the reader (and the evergreen loops) consume.

**Design (PROPOSED):**

- **Input**: the plan docs — a named, version-pinned set, not "the whole repo".
- **Output**: rows in `trinity_tasks` / `task_chunks`, each with a **MEASURED
  success criterion** (the `docs/CAPTURE-LOOP.md` shape: "`ever_read > 0` and a
  human judged the reply worth having"), never "it runs".
- **Independence**: a **different model family** from the executors is the right
  instinct — the same principle as the VERIFY lane and lane disjointness
  (`docs/AGENT-LOOP-PROMPTS.md`). A planner from a different family cannot quietly
  grade its own executors' work.
- **Anti-theater**: judged by whether its tasks, once done, pass their own success
  criteria — never by how many tasks it emits (`docs/CAPTURE-LOOP.md`: never fake
  the return).

**GATED (Sean):** *buying* the agent is a spend decision and yours alone. Once you
choose the family, the non-gated half (task-schema, success-criterion contract,
independence check, planner-output probe) is fast to stage — the same "stage what
doesn't need your account" pattern used for the Strix work.

---

## What this is NOT

- Not a claim the fleet is working — it is up, looping, and idle (`v_agent_state`).
- Not a re-diagnosis — `hal-volume-stopped-2026-07-17` owns that; this adds the
  standing guard so the canonical instrument can't quietly be forgotten again.
- Not a dispatcher. It sends no task; dispatch and buying are gated and stay that way.
- Not a new liveness view. There are already six+; this adds the *rule* that keeps
  them from being misread, and one probe that enforces it.
