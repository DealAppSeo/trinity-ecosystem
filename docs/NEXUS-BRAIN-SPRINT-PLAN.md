# NEXUS / Founder OS sprint — the scoped first slice

**Status: PROPOSED 2026-08-26.** This is the working plan for the "one recursive
experiment" directive (PAI → TrustShell → HAL → Jury → RepID → memory → content),
translated from the full strategy document into what can actually start today,
verified against what this session found live. The full document is preserved
below in [What's deliberately deferred](#whats-deliberately-deferred) — nothing
in it is wrong, most of it is just not this week's slice.

## The one rule this plan follows

> Do not try to "finish HAL," "finish RepID," "finish Trinity," or migrate to
> another harness. Build one demonstrable loop.

That's the directive's own words. Everything below is in service of ONE loop,
not twelve new tables and five parallel workstreams launched simultaneously.
`LESSONS.md` A32–A34 are three fresh, dated examples of what launching
unverified infrastructure costs in this specific codebase — a schema column
with no consumer since the day it was added, a cron nobody wired a recovery
path for, a Redis client nobody circuit-broke. The plan below is sized to not
add a fourth.

## What's already built and load-bearing (use it, don't rebuild it)

The directive asks for a "Company Brain": durable doctrine, decisions,
settled facts, experiments, failures, lessons. **That already exists and has
been running all sprint:**

- `docs/PRIOR-WORK-INDEX.md` — CLOSED / OPEN / RETRACTED tables, exactly the
  PROPOSED → EVIDENCED → VERIFIED → SUPERSEDED lifecycle the directive asks
  memory to have, already enforced by `check:prior-work` and `check:open-work`
  in CI. A claim here cannot cite a retracted figure; a diff that touches an
  OPEN item's scope must cite it or update it. That's memory with teeth,
  already shipped.
- `LESSONS.md` — the durable failure log, append-only, grouped by what would
  have prevented each entry.
- `scripts/check-dormancy.mjs` — the existing mechanism for "this exists,
  is tested, and has zero live callers" (harness/router, ZKPAttestation, and
  30+ others are already tracked this way).

**Do not stand up a parallel memory system next to these.** If the directive's
`goals` / `task_graphs` / `decision_packets` / `jury_votes` schema turns out to
be needed, it gets added to the SAME PRIOR-WORK-INDEX discipline, not a second
one that agents have to remember to check.

## The first loop — TrustShell audits TrustShell

This is the directive's own answer to "what's the first mission," and it's
right: it exercises memory, delegation, verification, and correction in one
pass, against a system that already exists and already has a public surface
disagreement, cheaply — no new infrastructure required to start.

**Already underway, not hypothetical:**

- `DealAppSeo/trustshell#72` (draft) — the first real finding. `package.json`
  says `1.3.0`, confirmed against the live npm registry. Four other places in
  the same repo said `1.2.0`, `1.1.0`, `1.0.0`, and `1.1.0` — including
  `MCP_VERSION`, a hardcoded literal with the *exact* bug `resolveVersion()`
  in the CLI already fixed once, never generalized past that one file. Fixed
  by extracting a shared `resolvePackageVersion()` helper and replacing the
  test that pinned the stale literal (the test is what let it drift a whole
  release unnoticed) with the same drift-proof pattern the CLI's test uses.
- The on-chain-writes-paused claim (`components/live-on-chain.tsx`,
  `STATIC_FROZEN_AT = '2026-06-22'`) needs re-checking against this sprint's
  own `erc8004_reputation_writes` finding (LESSONS A33): a real write landed
  as recently as 2026-08-16. Whether the site's LIVE endpoint already
  reflects that (making the static fallback text merely a display-time
  default, not wrong) or whether it's actually stale is **NOT YET CHECKED** —
  next slice of this same audit, not a new mission.

**Loop-friendly, not a one-shot:** every remaining public claim (SDK install,
MCP discovery, HAL PASS/FLAG/VETO, RepID read, ERC-8004 anchoring, x402
capability) gets the same treatment — check the claim against a live call,
not against the doc that asserts it — and gets classified LIVE / PARTIAL /
EXPERIMENTAL / PAUSED / PLANNED with the evidence that earned the label. This
IS the acceptance-suite table from the directive; it doesn't need to be built
before starting, it gets filled in one row at a time as each claim is
checked.

## Delegated, by name, same as every other OPEN item this sprint

- **XC** — issue [#136](https://github.com/DealAppSeo/trinity-ecosystem/issues/136)
  *(filed this sprint)*: continue the TrustShell audit past the
  version-number finding — the on-chain-paused claim, the SDK install path,
  MCP tool discovery. Same "measure before fixing" discipline as every other
  XC item this week.
- **GA** — issue [#137](https://github.com/DealAppSeo/trinity-ecosystem/issues/137)
  *(filed this sprint)*: draft the smallest possible
  Tool Capability Registry — NOT twelve columns, just enough to answer "which
  of my tools can do X, and is it currently reachable" for the tools this
  session has already had to rediscover by hand three times this sprint
  (Railway, Supabase `pg_net`, GitHub). Scope it to what exists today, not
  what might exist later.
- **T12** — no new issue; #130 (harness/router) already IS a slice of the
  "long-loop executor" the directive asks for in P2. Building the loop
  executor that #130 describes and building the Founder OS orchestrator are
  the same missing piece looked at from two altitudes. Solving #130 first is
  the cheaper, already-scoped version of P2.

**Standing fact, stated plainly rather than assumed away:** T12, XC, and GA
have shown zero activity on any delegated issue this entire sprint (#130,
#132, #134 all still unassigned, uncommented, `updated_at == created_at`).
This plan routes work to them the same way prior work did — clean, scoped,
loop-friendly GitHub issues — but does not claim work is happening in
parallel with them until it demonstrably is. If they wake up mid-sprint, this
plan and its issues are what they pick up.

## What's deliberately deferred (the directive's own list, kept)

Direct quote from the source document, because it already says this better
than a paraphrase would:

> Do not migrate T12 to Omnigent or DeepSeek Harness... Do not redesign the
> entire RepID equation. Do not build ONE ANOTHER before September 8. Do not
> build a universal PAI UI. Do not spend the sprint adding more models.

Added to that list, specific to what this repo's own history says about
premature infrastructure (LESSONS A32–A34, Sprint K's declined
`hal_quorum_receipts` migration): **do not stand up the full memory schema
(`goals`/`task_graphs`/`decision_packets`/`jury_votes`/etc.) before the one
loop above has run end to end at least once.** A schema built ahead of its
first real consumer is exactly the shape of every dormant-table finding this
sprint surfaced. If the TrustShell-audits-TrustShell loop needs a place to
record findings that `PRIOR-WORK-INDEX.md` genuinely can't hold, that's the
moment to add ONE table, sized to what that loop actually needs — not the
twelve-table schema in advance of any evidence it's the right shape.

## Definition of done for this slice

Matches the directive's own exit criteria, narrowed to what this slice
covers:

- Every public TrustShell claim (SDK, MCP, HAL PASS/FLAG/VETO, RepID,
  ERC-8004, x402) has an evidence-backed LIVE/PARTIAL/EXPERIMENTAL/PAUSED/
  PLANNED classification, sitting in `trustshell`'s own docs or in this file.
- Every discrepancy found is either fixed (like #72) or has an issue filed
  against it, same as every other finding this sprint.
- T12's #130 (or a direct successor) demonstrates one real long-loop
  execution: a goal that decomposes, delegates, and reaches completion
  without a human re-prompting it mid-loop.

Nothing above requires a Decision Jury, a harness adapter layer, or Gloo
integration to be true. Those are real, and P3 onward in the source document
names them correctly as the next loop once this one is proven — not before.
