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
