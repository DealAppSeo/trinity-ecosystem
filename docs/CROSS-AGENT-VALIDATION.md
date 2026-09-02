# Cross-agent validation — agents checking each other's work, backed by proof

**Status: playbook over a partly-live system.** The checks-and-balances skeleton
described here mostly EXISTS (cited inline). The two strengthenings — the
security stack as verify-criteria, and zkRepID as verdict-backing — are partly
built and partly blocked on measured-real conditions stated up front. Do not read
this as "the loop is running." Read the measured reality first.

Companion pieces: `docs/AGENT-LOOP-PROMPTS.md` (the lane roster and boundaries),
`docs/AGENTIC-SECURITY-STACK.md` (ABC / Strix / smolagents), `docs/RED-TEAM-CHARTER.md`
(collector vs judge). Enforced by `scripts/redteam/probes/cross-agent-validation.mjs`
(XVAL-001) and `scripts/check-verifier-independence.mjs`.

---

## Measured reality — read before designing on top of it

Three facts, measured 2026-09-02 (`scripts/redteam/evidence/cross-agent-validation.json`),
that any honest cross-validation design must sit on rather than wish away:

| thing | measured | consequence |
|---|---|---|
| **T12 runtime fleet** | **12/12 reachable, 0/12 working** (`agent_health_probes` + `v_fleet_truth`) | Containers are UP (health probe 200, ~4 min old, code `8.2.0-reflect-wired`) but IDLE — every row reads `liveness_signal='probe_only'`, heartbeat ~46d stale, work logs 22h–7d stale. **Not dead.** No agent is producing work to validate, but reviving the loop means **feeding tasks, not resurrecting processes.** |
| **zkRepID proofs** | **22,356 real, 100% EAS-attested** (`plonky3_range_check`) + **56,823 stubs** flagged `is_real=false` (`sha256-stub`) | A real, on-chain-attested scheme exists to back a verdict — AND a large stub set that must never be cited. The discriminator (`is_real`) is the whole game. |
| **zk pipeline** | **40,300 pending, frozen 32 days**; ~117 new proofs in 30d | The backing mechanism is real but STALLED. A LIVE zk-backed loop is precondition-blocked until the queue thaws. |

**The fleet row is where "conflicting findings" come from, so read it precisely.**
Six sources answer "how many T12 agents are live" with four different numbers —
`agent_health_probes` OK <24h = **12**, `v_fleet_truth.is_reachable` = **12**,
`v_fleet_truth.is_live` = **0**, `agent_heartbeat` <24h = **0**, `trinity_agent_logs`
work <24h = **2**. None is lying; they measure different things (process responds
vs. heartbeat vs. work-log recency). The honest one-liner: **all 12 are reachable,
all 12 are idle.** Collapsing "reachable" into "live" is the exact defect this repo
names; a dedicated fleet-truth probe that reports this three-way and BREACHES on the
collapse is the antibody, tracked separately from this zkRepID-backing work.

So: the invariant that makes zk-backing meaningful **holds** (XVAL-001 = HELD),
the fleet is **up but idle** (reachable, not working), and the pipeline is
**frozen**. The design below is built to be honest about all three at once.

---

## The skeleton that already exists

The ecosystem is already a cross-agent checks-and-balances system. Crediting what
is built keeps this from reinventing it:

- **Disjoint lane ownership** (`docs/AGENT-LOOP-PROMPTS.md`). CC (Claude, `lib/**`
  + orchestration), XC (Grok/xAI, `app/**` + `components/**`), GA (Gemini,
  `package.json` + `.github/workflows/**` + `Dockerfile*`). No two lanes write the
  same file — the property that makes parallel agents cheaper than serial and
  keeps one agent from grading its own diff by owning it.
- **The grader is not the author.** The VERIFY lane is defined as *"whichever of
  CC/XC/GA did NOT author the sprint."* Enforced in code by
  `check:verifier-independence`, which exists because on 2026-08-19 the
  implementation lane authored GA's two contract files and then ran the harness
  that graded them — both went SOFT-LIVE. That incident is the reason this
  invariant is a gate, not a guideline.
- **Mutation-union across lanes.** `npm run check` runs every `check:*`; a mutant
  introduced by one lane surfaces as a survivor in another lane's gate. Two lanes
  committing opposite `jsx` values past each other was caught this way.
- **Append-only shared surfaces.** `docs/PRIOR-WORK-INDEX.md`, `docs/SPRINT-LOG.md`,
  `LESSONS.md` belong to no lane and are appended, never reflowed — every
  2026-08-16 merge conflict came from reflowing them.

This is the substrate. The task is to strengthen its *criteria* and its
*backing*, not to rebuild it.

---

## Strengthening 1 — the security stack becomes verify-criteria

Today VERIFY grades correctness. The `docs/AGENTIC-SECURITY-STACK.md` work makes
three more things part of what a non-author lane checks before a peer's sprint is
LIVE:

- **ABC III.13 (trivial-agent):** does the sprint's success signal survive a
  do-nothing / evasive input? `ABC-TRIVIAL-001` is the first probe of this class.
- **Strix diff review (LIVE):** the GitHub App reviews every PR
  (`strix-security[bot]`, reviewed `#158` clean, 2026-09-02). Its findings are
  COLLECTOR output — a probe here judges them, per the charter; they never
  auto-become a verdict.
- **Effective-authority checklist** (in the stack doc): every authed endpoint a
  lane ships is walked from lowest-privileged user to credential to side effect.

A peer's work is not validated because it "looks right" — it is validated because
it passes a non-author lane's run of these, and the run is a transcript.

---

## Strengthening 2 — zkRepID as verdict-backing (the honest version)

The ecosystem already distinguishes **PROVEN** (a signature, a proof) from
**LINKED / self-reported** (an administrative association). Cross-validation
should inherit that: a verdict about an agent's standing — a T12 runtime agent's
reputation, or a lane's RepID — may be **backed by a real zk proof** rather than a
self-reported number.

**The invariant, enforced by XVAL-001:** a verdict may cite a proof only if its
scheme is `is_real=true` and on-chain attested. The `plonky3_range_check` scheme
qualifies (22,356 proofs, 100% EAS-attested); the `sha256-stub` scheme (56,823
proofs, 0% attested) never does. XVAL-001 HOLDS while that discriminator is sound
and BREACHES if a stub is ever marked real or attested — so "backed by zk" can
never quietly come to mean "backed by a 2026-05 placeholder."

**What is wired vs blocked:**

- WIRED: the discriminator (real vs stub, attested vs not) is measurable now and
  gated by XVAL-001. A validator CAN, today, check whether a cited proof is real.
- BLOCKED, on measured conditions, not on code:
  - *fleet idle (0/12 working, though 12/12 reachable)* — the containers are up,
    but no agent is producing work whose standing needs proving to a peer. The
    unblock is **feeding verifiable tasks**, not resurrecting processes — much
    cheaper than the "revive a dead fleet" framing earlier drafts used. Dispatching
    tasks that agents actually execute is a runtime action, Sean-gated per the
    executor's fences.
  - *queue frozen (40,300 pending, 32d)* — NEW proofs are not flowing, so a
    freshly-earned verdict cannot get a fresh proof. Thawing the queue is the
    unblock.

The design does not pretend around either. A claim that "cross-validation is
operational and zk-backed" while the fleet is idle (0/12 working) or the queue is
frozen is exactly the unearned-success defect this repo names — and it is the one
XVAL-001's readiness line and this section exist to stop.

---

## How XC, GA and T12 plug in

| agent | authors | validated by | zk-backing role |
|---|---|---|---|
| **XC** (surface) | `app/**`, `components/**` | a non-author lane (CC or GA) runs its gates + the security-stack criteria | its own RepID-affecting surfaces (e.g. `/agents` scoring) must show PROVEN state, not self-reported — the pattern `AgentRepId` already follows |
| **GA** (supply) | deps, workflows, `Dockerfile*` | a non-author lane; supply changes are where a silent credential or a poisoned dep enters, so Strix's supply-chain skill is the criterion | n/a directly; guards the pipeline zk runs in |
| **T12** (runtime) | runtime decisions, HAL-scored | **when revived**: a peer T12 agent (different ALPHA/BETA/GAMMA group) grades, and the verdict cites the gradee's real plonky3 proof, not its self-reported RepID | the primary consumer — this is the loop the whole design points at |

The rotation rule generalises: **the validator is always a different principal
from the author, and its verdict is backed by a proof the author cannot forge.**
Lane independence gives the first half (already enforced); zkRepID gives the
second (enforceable now, live once the fleet and queue clear).

---

## What this is NOT

- Not a claim that T12 agents are currently validating each other — they are
  0/12 working (12/12 reachable, but idle).
- Not a claim that verdicts are currently zk-backed end-to-end — the queue is
  frozen; only the discriminator that would make it trustworthy is live.
- Not a new orchestration layer. It is criteria + backing bolted onto the lane
  system that already exists, with one probe (XVAL-001) that fails loudly if the
  zk half is ever faked.
