# Agentic security stack — the gold-standard playbook

**Status: playbook, not inventory.** This document describes how three external
bodies of work compose with the machinery this repo already has, and what to
build. Where it names a capability as EXISTING it cites the file; everything
else is PROPOSED and says so. Do not quote it as evidence that a control is
live — read the cited file or run the cited gate.

Companion pieces already in the tree: `docs/RED-TEAM-CHARTER.md` (division of
labour), `scripts/redteam/` (the probe suite + ledger), `.claude/skills/trust-red-team/SKILL.md`,
and `scripts/redteam/tools/strix.md` (the Strix run guide).

---

## The one idea

Security here is **antifragile** only if every attack makes the system
permanently stronger. That is not a metaphor — it is a mechanism this repo
already implements and most do not:

```
an attack (Strix PoC, a red-team hypothesis, a bug report)
  -> evidence recorded under scripts/redteam/evidence/*.json
  -> a probe in scripts/redteam/probes/*.mjs JUDGES that evidence
  -> the verdict is HELD / BREACHED / NOT_CHECKED, never two-valued
  -> a BREACH becomes a ledger entry with an owner and a reviewBy date
  -> the fix flips the probe to HELD; the probe stays forever
```

The probe is the antibody. The system got attacked once and is now immune to
that attack class for good, because the probe re-runs on every `npm run
check:redteam` and **fails loudly the moment the attack works again**. The three
external repos each strengthen a different stage of that loop.

---

## The three inputs, and where each one plugs in

### 1. `uiuc-kang-lab/agentic-benchmarks` (ABC) — the evaluation layer (LEARN)

A 44-item checklist (`ABC.md` in that repo) for whether an agentic *evaluation*
can be trusted, plus assessments proving ten well-known benchmarks can't: a
do-nothing agent scores **38%** on τ-bench, a spammer **40%**, KernelBench
overstates capability by **31%**.

This is this codebase's signature defect — *a system reporting success it has
not earned* — stated as peer-reviewed research. It is a rubric, not a tool;
nothing to install.

**The single highest-value item is III.13: "report results of a trivial agent
(one that does nothing)."** It is mutation testing pointed at an evaluation. The
TrustShell equivalent: can an agent that commits to nothing earn RepID?

- EXISTING: the first turn of this is shipped — `scripts/redteam/probes/hal-trivial-agent.mjs`
  (ABC-TRIVIAL-001) with `scripts/redteam/evidence/hal-trivial-agent.json`. First
  measurement (2026-09-02): HAL correctly vetoes a false claim and pure filler,
  but an evasive hedge scored CLEAN — under a degraded 4/6 quorum, so the probe
  lands NOT_CHECKED pending full-quorum + earn-gate re-collection. It is a
  qualified signal, not a finding, and it is recorded so it cannot evaporate.
- PROPOSED: walk more of ABC against the HAL/RepID eval — I.c (LLM-as-a-judge:
  documented accuracy, resistance to reward hacking), I.i (quality metric can't
  be gamed), II.5 (agent isolated from ground truth), II.9 (harness free of
  vulnerabilities that pass eval without doing the task). Each becomes a probe.

### 2. `usestrix/strix` — the offense layer (APPLY)

An open-source agentic pentester: autonomous agents drive an HTTP proxy,
browser, and shell, validate findings with real PoCs, and map them to OWASP.
Its `skills/` directory is a strong catalogue on its own — most relevant here:

- `skills/vulnerabilities/agentic_system_security.md` — the **effective-authority
  map** (see the checklist below). This is the exact frame the `/readiness` and
  `/bind` work used: prompt text is not an authorization boundary; the agent is a
  confused deputy bounded by the union of its credentials, tools, network, and
  delegated agents.
- `skills/vulnerabilities/llm_prompt_injection.md` — OWASP LLM01, direct/indirect
  injection, "passing untrusted text to a model is an attack surface, not a
  vulnerability — validate the effect outside the transcript."
- `skills/scan_modes/diff.md` — PR-scoped review that explicitly *does not lower
  the evidence bar*. This is the CI-shaped one.
- `skills/frameworks/nextjs.md` — TrustShell is Next.js.

**Strix is the CHARTER's external collector.** `docs/RED-TEAM-CHARTER.md` §1
draws the line: an external agent gets collection and hypothesis generation, not
judgement, because an observation is checkable and a verdict is not. Strix
produces PoCs and observations; a probe here judges them; the ledger remembers.
Strix does not get to write a finding — it feeds the loop.

Run paths, corrected from the 2026-08-16 note (which called all three blockers
"hard" — two are not):

| path | needs Docker | needs LLM key | reaches live target | good for |
|---|---|---|---|---|
| managed cloud (`managed-pentesting-with-strix`) | no | no | yes (from Strix infra) | live-surface pentest without local infra |
| source-aware whitebox (local clone) | yes (daemon) | yes | not needed | code review of a repo you have |
| local CLI vs production | yes (daemon) | yes | yes | full black-box, operator machine |

From a Claude cloud session, only the **managed** path is runnable today (this
session has no Docker daemon — re-verified 2026-09-02, `/var/run/docker.sock`
absent), and it needs an `app.strix.ai` account. Setup, config templates, and
the CI template are in `scripts/redteam/tools/strix.md`.

### 3. `huggingface/smolagents` — the runtime layer (ANTIFRAGILE, at the agent level)

A minimal agent library whose two lessons matter more than its code (TrustShell
is TS/Next, not Python agents — borrow, don't adopt):

- **Sandbox is the boundary, the executor is not.** smolagents ships
  `LocalPythonExecutor` with a `DANGEROUS_MODULES`/`DANGEROUS_FUNCTIONS`
  blocklist and then says outright it *is not a security boundary* — use E2B /
  Modal / Docker. The lesson for anything in this ecosystem that runs
  agent-authored code: a blocklist is defense in depth, never the fence.
- **Its `SECURITY.md` is a gold-standard PoC bar** — "a snippet showing a
  function exists or could be misused is not a PoC." That is this repo's "run it,
  don't read it" and the charter's "a verdict is not checkable" in another
  project's words. Adopt its report template for any vulnerability filed here.

---

## The effective-authority checklist (adopt now, zero install)

From Strix's `agentic_system_security` skill, adapted as a design gate for every
new authenticated endpoint or tool in this ecosystem. Answer all before shipping
one:

1. **Draw the path**: external content → model/memory → planner/policy → tool or
   delegated agent → credential → target → side effect → data returned to the model.
2. For the credential the endpoint holds: issuer, audience, subject, tenant,
   scopes, expiry, and **where it is injected**. Is its authority wider than the
   user's? (`service_role` bypasses RLS — CLAUDE.md. That is the widest gap.)
3. **Where is the authorization point**, and is it before or after the side
   effect? (`/account/connect` checks the flag *before* `provenWallet`;
   `/human/bind` authenticates *before* the flag — order is the whole bug or the
   whole fix.)
4. Can data returned to the model contain new instructions? (indirect injection)
5. Is there an approval point for a consequential action, and can prompt text
   alone reach past it?
6. Test from the **lowest-privileged realistic user**. The comparison that
   matters is the user's authority vs the tool credential's.

`/readiness` and `/bind` already pass this frame; it is written down here so the
next endpoint does too.

---

## Sequenced plan — what to do, in order

1. **ABC now (done / continue).** ABC-TRIVIAL-001 shipped; re-collect its
   full-quorum + earn-gate evidence to settle it, then walk the next ABC items
   into probes. Zero install.
2. **Strix skills + managed run (needs your account).** `npx skills add
   usestrix/strix` installs nine skills incl. `ci-security-scanning-with-strix`.
   Run the managed path against `www.trustshell.dev` and the engine; each PoC
   becomes an evidence file + a probe here. Config and CI template staged in
   `scripts/redteam/tools/strix.md`.
3. **PR review is LIVE via the GitHub App — no workflow needed** [MEASURED
   2026-09-02: `strix-security[bot]` reviewed `#158` and returned "No security
   issues found"]. The staged `.github/workflows/strix-diff.yml` template is the
   SELF-HOSTED/CLI alternative only (needs `STRIX_API_KEY`), for running the
   open-source CLI in CI alongside a probe-porting step — not required for basic
   PR scanning.
4. **smolagents principles as gates, not a dependency.** The effective-authority
   checklist above is item one; the PoC bar is the report template for the ledger.

Nothing in steps 2–4 is installed yet — they wait on your Strix account and the
CI secret. Everything in step 1 is live in this PR.

---

## What this is NOT

- Not a claim that TrustShell currently passes ABC or resists all prompt
  injection — those are the work, not the status. (Strix's GitHub App HAS now
  reviewed one trinity-ecosystem PR clean, 2026-09-02; that is one automated
  diff review, not a full-surface pentest.)
- Not an install. `npx skills add usestrix/strix` and the managed run are yours
  to trigger with your account; this PR only stages the ground.
- Not a replacement for the charter or the ledger — it points at them. They are
  the mechanism; this is the map.
