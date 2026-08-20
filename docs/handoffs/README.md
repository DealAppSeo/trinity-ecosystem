# Handoffs — the shared inbox between CC, XC, and GA

**Why this exists.** `repid-engine/LESSONS.md` is injected into every XC/GA dispatch — it's
durable, but it's one-way (CC → XC/GA) and capped at 6000 characters by design, meant for
standing lessons, not live task handoff. `scripts/dispatch/run-agent.mjs` (repid-engine) already
reads a per-agent inbox file — `INBOX_XC.md` / `INBOX_GA.md` — but by default from a path on the
operator's own machine (`DISPATCH_HANDOFF_DIR`, defaulting to a local Windows drive), which no
session (mine, XC's, or GA's) can read back later, and which leaves no durable record once acted
on. This directory is the same convention, git-hosted, so it's readable by every party and
survives past a single session.

## The three files

- **`INBOX_XC.md`**, **`INBOX_GA.md`** — tasks/handoffs addressed to each lane. Point your local
  `DISPATCH_HANDOFF_DIR` at a clone of this directory and `run-agent.mjs` reads these with no code
  change — it already expects exactly this filename and the newest-`##`-section-on-top format
  (see the script's own header comment).
- **`INBOX_CC.md`** — reports/handoffs addressed to Claude (this session or a future one). Nothing
  auto-invokes on this one the way `run-agent.mjs` invokes XC/GA — a human still has to either
  relay its contents directly, or a session has to be told to check it. It exists so a report
  isn't lost if it only ever lived in one session's chat transcript.

## Format (newest entry on top, matching `run-agent.mjs`'s existing convention)

```markdown
## 2026-08-20 — from CC — one-line subject

Body. Be self-contained — the reader has no chat context, only this file, `LESSONS.md`
(XC/GA only), and whatever canon docs are cited.
```

## Cross-repo facts and the `--requires` gate — read before writing a task for GA or XC

`run-agent.mjs` already has a real capability gate (`capabilityRefusal()`, the measured port of
`src/orchestration/lane-registry.ts`'s `canAssign()`), built from a real 2026-08-05 incident: GA
was dispatched to review another repo and fabricated a report, because it was asked for something
its sandbox structurally cannot reach (`read_file` outside its workspace → `"Path not in
workspace"`). Measured, not assumed: **GA and XC both hold `repo_read` but not `cross_repo_read`
— only CC does, of every lane in the registry.**

**The gate is real but opt-in, not inferred.** `required` capabilities come from a `--requires`
flag on the dispatch command, and it defaults to `reasoning` — the one capability every lane has —
if the flag isn't passed. That default is deliberate (the script's own comment: *"a task that
names no requirements is assumed to need only reasoning... anything that must READ, RUN or FETCH
has to say so"*), and it's the right call on its own axis — it never GRANTS more than declared.
But it means the gate only catches a mismatch the dispatcher already recognized and declared; a
task framed as "document our endpoints" doesn't visibly announce that answering it accurately
requires reading a **different** repo. That's exactly the shape of the 2026-08-20 recurrence this
directory's `INBOX_GA.md` corrects: a task about `repid-engine`'s real routes, dispatched to GA
while it worked in `trinity-ecosystem`, with no `--requires cross_repo_read` set — so the gate saw
a task needing only `reasoning`, which GA has, and let it through.

**Before writing a task for GA or XC, ask: does answering this correctly require a fact that
lives in a repo other than the one the task runs in?** If yes, do one of:

1. **Inline the fact directly in the task text** — quote the real file path, route, or value, so
   the agent has it without needing to fetch it. This is the safer default: it works regardless of
   whether the dispatcher remembers to set the flag.
2. **Pass `--requires cross_repo_read` (or `http`/`db_read`/whichever's genuinely needed)** on the
   dispatch command — the existing gate then does its job and refuses cleanly instead of producing
   a well-formed, wrong answer.

Neither this file nor any session can fix the *default* — that's `run-agent.mjs`, tooling on the
operator's own machine, and its permissive-by-default design was a deliberate, reasoned call, not
an oversight to silently override. Flagged here as guidance, not changed as code.

## What this is not

- Not a replacement for `LESSONS.md` (durable, capped, injected every dispatch) or the dated
  canon docs (`SPRINT-DECISIONS-*.md`, `TRUST-HARNESS-STATUS-*.md`, `PRIOR-WORK-INDEX.md`) — this
  is task-level handoff, not standing policy or status.
- **Not, by itself, a wake mechanism.** A commit to one of these files generates no notification
  to any session. The channel that actually delivers a prompt response tonight is a PR — a
  webhook-subscribed session gets woken by commits/CI/comments on a PR, not by an arbitrary file
  changing on a branch with no PR open. Wrap a handoff in even a trivial PR if it needs a prompt
  response; use these files directly only for content a periodic check-in sweep is an acceptable
  latency for.
- Not a place for secrets, credentials, or anything CLAUDE.md's public-repo warnings cover — this
  directory is exactly as public as the rest of the repo.
