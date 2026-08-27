# Three lane tasks to make MVP and V1 work end to end

**Written 2026-08-27.** Each task sits on an existing lane rather than reassigning
anyone. Every starting fact below was measured on the date given, not recalled.

> **This document does not dispatch itself.** Writing a task here does not send it
> to anyone. The dispatcher (`scripts/dispatch/run-agent.mjs`, in `repid-engine`)
> runs on the operator's local machine and needs vendor API keys that no cloud
> agent session holds. Somebody has to run it. Filing this doc and calling the
> lanes "assigned" would be the same defect all three tasks below are about.

---

## The chain, and where it is actually cut

```
[1] request arrives          ai_dispatch row exists  →  NOTHING READS IT
[2] router picks who/what    measured, dormant       →  nothing constructs it
[3] agent does the work      12/12 processes UP      →  and idle: 1 task/day
[4] work is verified         HAL quorum 4 of 5       →  runs only on the nightly smoke
[5] reputation moves         RepID                   →  works
[6] answer carries a verdict Authority surface       →  carries no status at all
[7] payment settles          one agent stalled       →  recovery worker: 0 rows ever
```

**[5] is the only link that fully works.**

---

## THE PREMISE THAT WAS WRONG — corrected before it cost a sprint

The index has carried *"the Trinity fleet is DOWN on Railway, and still is"* since
2026-08-15, with a remedy of **manual redeploy**. A first draft of this document
repeated it and told the lanes to wait for that redeploy.

**Re-measured 2026-08-27 against `v_fleet_truth`: the processes are UP.**

| signal | reading |
|---|---|
| `probe_ok` / `probe_http_status` | **true / 200 on all 12 agents** |
| `minutes_since_probe` | **1.8** — actively probed, not a cached verdict |
| `is_reachable` | **true, 12 of 12** |
| `is_live` | **false, 12 of 12** ← *false negative, see below* |
| `minutes_since_ping` | **~58,250 (≈40.5 days)** on every agent |

40.5 days back from 2026-08-27 lands on **2026-07-17** — the date agent-side
heartbeat writes were deliberately removed. So `is_live=false` is not evidence the
fleet died; it is `last_ping` being starved of a signal somebody turned off.
`.claude/skills/trinity-preflight` documents this exact trap: *absence of a signal
you turned off is not evidence of absence.* The probe columns are the ones that
answer "is the process up", and they say yes.

**A redeploy would have changed nothing, and would have looked like a fix.**

### But the pipeline is doing nothing, which is a different bug

| measurement (2026-08-27) | reading |
|---|---|
| `trinity_tasks`, daily, 08-18 → 08-26 | **exactly 1 per day, nine days running** |
| `hal_classifications` last 1d / 7d | **1 / 7**, most recent stamped 09:15 UTC |
| `ai_dispatch` total / read / replied | **43 / 0 / 0** |
| agents with any work signal | **5 of 12**; oldest recent work ~24h, rest `NULL` |

One task per day at a fixed 09:15 UTC is the nightly smoke cron, not work. HAL's
only traffic is that same smoke.

**So the finding is not "the fleet is down." It is "the fleet is up and idle."**
Twelve live processes answering 200, with nothing feeding them, next to a mailbox
holding 43 messages nobody has opened. That is a supply problem, not an outage,
and it is the same wired-at-one-end shape as every other item here.

**Consequence for sequencing: T12's task is UNBLOCKED.** The reader has a live host
today. Nothing waits on an operator redeploy.

---

## T12 — V1's spine: make one tag round-trip for real

**Unblocks [1] and [2].** The only task here on V1's critical path.

Your lane entry already says "build the executor, re-run `check:spine-reachable`,
iterate." Fold the inbox reader into it: they are the same shape — *build the caller
that makes tested code live* — and apart they are two half-features.

**The trap, and it comes first.** `llm_call_log` shows real primary/fallback
traffic, so something routes live and it is **not** the tested code in this repo —
nothing in `app/` or `lib/` writes that table either. **Find the live decision point
before building the executor.** Build first and the repo has two routers and no
answer to which is authoritative. That discovery is deliverable one, not two.

**Done means:**
- `ever_read > 0` on `ai_dispatch` — the first message ever read in that table's history
- a reply row with `reply_at` and `reply_from` populated
- a human judges the reply worth having
- `check:spine-reachable` shows `harness/router` with a real caller, not a type-only import

**Do not:** mark a message read without producing a reply. That converts an honest
0/43 into a dishonest 43/43, which is worse than today. Do not add a tag with no
reader behind it.

---

## XC — V1's money leg: make the recovery worker exist and fire

**Unblocks [7].**

One agent's daily payment has been authorized-but-never-settled for 8 consecutive
days, every row with `settlement_attempt_count = 0` — **never attempted**, not
attempted-and-failed. `x402_settlement_failures` logged nothing for it.
`x402_recovery_worker_runs`, whose schema exists for exactly this
(`rows_examined` / `rows_recovered` / `rows_abandoned` / `circuit_breaker_tripped`),
has **zero rows in the database's entire history**.

Three tables exist to observe this failure and none has ever been written to.
Neither symptom table has a writer in this repo (repo-wide grep, zero hits), so the
writer lives elsewhere and locating it is the work.

**Done means:**
- `x402_recovery_worker_runs` has rows — the first ever
- a deliberately stalled test row is examined and either recovered or abandoned, outcome recorded
- the circuit breaker trips under forced failure **and says so**
- the real backlog resolves, and the resolution appears **in the run log**, not only in the settlements table

**Do not:** settle the backlog by hand and call it fixed — that destroys the
evidence and leaves the detector dead. Do not read `settlement_attempt_count = 0`
as "retries exhausted"; it means never attempted, a different bug with a different fix.

---

## GA — MVP's honesty leg: no surface may report success it has not earned

**Unblocks [6], hardens [4].** Two instances measured 2026-08-26/27:

- `/api/v1/providers` reports `available: true` for providers that **404 on every
  call** — availability derived from *a key being set*, not from reachability.
- `GET /api/v1/stake/authority/:builder_id` returns
  `{builder_id, stake_total, authority, basis}` — **no outcome, no approximation
  flag** — so the UI renders an authority ceiling as a bare number. The
  `APPROXIMATE` state built for this case has nothing to bind to. The type carrying
  `outcome: MEASURED | NOT_CHECKED` is used by the grants mint path, not this endpoint.

**The trap:** the fix is *not* to make the UI show a status. That invents a status
the backend never returned — precisely the failure the vocabulary exists to prevent.
The endpoint must carry the outcome first.

**Done means:**
- `/api/v1/providers` returns three states per provider; a 404ing provider is never
  reported available — proven by a test pointing one at a dead endpoint
- the authority endpoint carries `outcome` + the approximation flag end to end, and the UI binds to it
- a test asserting the UI **cannot** render a bare ceiling when the endpoint returned `NOT_CHECKED`

**Do not:** fix the UI alone. Do not collapse three outcomes to two anywhere. Do not
derive availability from key presence.

---

## The pattern all three share

Every task here is one defect in three costumes: **a mechanism built complete, with
observability attached, that has never once run.** An inbox with read receipts, 0
read. A recovery worker with a metrics table, 0 rows ever. A provider endpoint
reporting availability from configuration rather than reachability. And now a fleet
of 12 live processes with no work reaching them.

None of these present as failures. They present as **silence**, which is why they
have all survived this long — and why `is_live=false` on a healthy process fooled
this document's own first draft.

Expect the writer to live outside the repo you are reading. That was true for the
router, both x402 symptom tables, and the heartbeat, every time it was checked.

---

## Operator-only, not a lane's

- **Cerebras model id** for `HAL_S2_CEREBRAS_MODEL` — HAL runs 4 of 5. A four-provider
  quorum works, but the family-independence margin is thinner than the green status reads.
  Two guessed ids were already wrong; this needs a real one from the vendor dashboard.
- **Dispatch itself.** See the banner at the top: no cloud agent session can run
  `run-agent.mjs`. Until someone runs it, this file is a document, not an assignment.
