---
name: trust-red-team
description: >
  Constructive red team for the Trinity / TrustShell trust layer — HAL, RepID,
  TrustShell evaluate & receipts, TrustMarket / x402 gating, and the identity
  spine. Use when asked to red team, attack, probe, stress, or adversarially
  verify any of those; when asked whether a control actually fails closed; when
  triaging a security finding against them; or when briefing an external agent
  (XAI / Grok / Gemini) to run an attack campaign. Runs executable probes and
  produces evidence-backed findings, never asserted ones.
---

# Trust Layer Red Team

You are a **verification and hardening partner**, not a destructive attacker.
Your job is to make this system's promises falsifiable, and to say plainly which
ones survived and which did not.

Everything below exists because a red team report is a claim about safety, and a
wrong one is worse than none: it either raises an alarm that costs a sprint, or
it certifies a hole. This repository has already had to retract four published
numbers. Assume you can do the same, faster, on a subject where people will act
on what you say.

---

## 0. Before anything: preflight

Run the `trinity-preflight` skill first. It is not optional here.

It fixes three things this campaign depends on: whether the fleet is paused,
what is already settled and must not be re-litigated, and the **fences** — no
production rows, proofs or agent ids as git fixtures; no merge, publish,
destructive DDL, key rotation or `global_pause` change without Sean. A red team
campaign brushes against every one of those.

Then read `docs/PRIOR-WORK-INDEX.md`. **A finding already recorded there is not
a finding.** Re-reporting closed work as new is the fastest way to make a
security report ignorable.

---

## 1. The three outcomes — the load-bearing rule

Every probe reports exactly one of:

| outcome | meaning |
|---|---|
| **HELD** | the attack ran and the system refused or degraded safely |
| **BREACHED** | the attack ran and succeeded — this is a finding |
| **NOT_CHECKED** | the probe could not run: endpoint unreachable, no credential, module would not compile |

`NOT_CHECKED` is the one that earns its keep, and it is not a formality here.
**Most of this project's live surfaces are proxy-denied from an agent session**
(`CLAUDE.md` § Network). A two-outcome red team in this sandbox reports "no
vulnerabilities found" over zero executed attacks — the exact defect `CLAUDE.md`
names as this codebase's recurring one, arriving through the door marked
security, where it reads as an all-clear.

So: **if you could not run it, write NOT_CHECKED and say what would run it.**
Never infer a control is sound from a healthy-looking response.

---

## 2. Run it; don't read it

A finding derived from reading code is an opinion. A finding derived from
executing code carries a transcript.

Reading is for **generating hypotheses**. Executing is for **publishing them**.
Where you genuinely cannot execute — a live host you cannot reach, a route that
needs a running Next server — say so *in the finding*, in the words "this
establishes X, it does not establish Y". `PAY-001` does exactly that and is
worth reading as the template.

**Every probe needs an anchor.** An attack battery with no known-good case
cannot distinguish a hardened target from a broken probe. Two of the first three
findings this suite produced were bugs in the probes, and the anchors are what
caught them:

- a fixture placed a chain's genesis entry after the cutover date, so the
  verifier correctly flagged a missing link and the "clean chain" anchor failed;
- a receipt probe sent `txHash` where the real field is `solanaTxHash`, so all
  eleven variants differed in a key the preimage never reads and every one
  "collided" — **four fabricated Critical findings, one commit from publication.**

Neither was caught by review. Both were caught by a case that was supposed to
pass and didn't.

---

## 3. The suite

```bash
npm run check:redteam                        # every probe
npm run check:redteam -- --probe PAY-002     # one
npm run check:redteam -- --json              # machine-readable, for reports
```

Discovered automatically by `scripts/check-all.mjs`, so it runs in `npm run check`.
Exit codes follow the repo convention: **0 VERIFIED, 2 NOT_CHECKED, 1 FAILED.**

### The ledger, and why a finding expires

`scripts/redteam/ledger.json` holds triaged findings. The runner's verdicts:

| probe says | in ledger? | verdict |
|---|---|---|
| BREACHED | no | **FAILED** — a new hole |
| BREACHED | yes, in date | KNOWN_OPEN — printed loudly, exit unaffected |
| BREACHED | yes, past `reviewBy` | **FAILED** — the debt came due |
| HELD | yes | **FAILED** — stale entry; the record lies |

That last row is the one people miss. A ledger claiming a hole that is fixed
also *hides the regression if it reopens*, because forever after it reads as the
known-open case. Delete an entry the moment its probe holds.

Every entry needs an `owner`, a `reason` and a `reviewBy`. The runner refuses to
start without all three, because an accepted finding with no date is just a
silenced test.

### Adding a probe

One file in `scripts/redteam/probes/`, default-exporting
`{ id, title, component, severity, threat, run() }`. `run()` returns
`held(detail, evidence)`, `breached(detail, evidence)` or
`notChecked(detail, howToRun)` from `../harness.mjs`.

`breached()` **throws if you pass no evidence**, and `notChecked()` throws if you
pass no route to running it. Both are deliberate: an unevidenced finding is
indistinguishable from a hallucinated one, and a gap with no route to closing it
is invisible.

---

## 4. Where you can actually reach

Check this before designing a campaign — it decides which probes are even
possible from where you are sitting.

| target | from an agent session | note |
|---|---|---|
| `lib/**` modules | **yes**, compile and drive them | highest signal per minute; the whole spine is here |
| `app/api/**` route handlers | **no** — no running server | source-derived only; say so in the finding |
| `app.aitrinitysymphony.com` | **no** to `curl`/browser; **yes** via `pg_net` | Railway |
| `www.aitrinitysymphony.com` | **no** to `curl`/browser; **yes** via `pg_net` | Vercel; separate env from `app` |
| `*.vercel.app` previews | **no** — SSO 302s every request | not a proxy problem |
| Supabase SQL | **yes** via the Supabase MCP tools | PostgREST over `curl` is denied |
| a specific key's role | **no** from here | the MCP path answers about *its own* connection, not your key — see `CLAUDE.md` |
| GitHub, npm registry | yes | |

`pg_net` egresses from Supabase infrastructure, which is why it reaches hosts
`curl` cannot:

```sql
select net.http_get(url := 'https://www.aitrinitysymphony.com/api/version',
                    timeout_milliseconds := 45000);
select status_code, headers, content from net._http_response where id = <id>;
```

**Anything that only exists after React mounts is NOT CHECKABLE from here.** SSR
HTML renders identically whether or not a client-side effect throws. Say
NOT_CHECKED rather than inferring from healthy-looking markup.

---

## 5. Collection vs judgement — how to use an external agent

Live surfaces need a collector with network reach. That collector may be a
human, a CI runner, `pg_net`, or an external agent (XAI / Grok / Gemini).

**A collector contributes observations. It never contributes verdicts.**

Observations land in `scripts/redteam/evidence/` in the shape documented in that
directory's README — verbatim response body, plus who collected it, when, and by
which egress path. A probe here judges them, deterministically, and treats
evidence past its expiry as NOT_CHECKED.

This is the whole safety argument for pointing another model at the system. An
external model that misreads a status word still produces a file containing
exactly what the endpoint said; a probe that trusted its *conclusion* would have
no such floor. Brief external agents with `docs/RED-TEAM-CHARTER.md`, which is
written to be pasted whole.

---

## 6. Targets and what to attack in each

Sharpest questions first. In every case the highest-value probe is **not "can I
forge it" but "which inputs does the subject control, and what do they buy?"**

### HAL — hallucination assessment and the audit chain
- Does a verdict degrade when a check could not run, or does it pass?
- Can a chain be **truncated** and still verify? (A deleted stretch leaves
  everything remaining internally consistent — this is the attack most chain
  verifiers miss.)
- Is the strongest verdict *reachable* on a fully anchored window at all?
  Compute that before reporting anything about the verifier's strength.
- Cross-LLM quorum: is high agreement treated as confidence? The BFT panel is
  **non-monotonic in agreement** — it vetoes when spread is too small. A tier
  that reads its veto as "ask another model" inverts the signal.
- Scale poisoning: `hal_score` is written on two different scales across
  `hal_mode`. Any threshold or comparison pooling them is measuring the mode.

### RepID / ERC-8004 — score integrity and the tier ladder
- Which score inputs are **self-asserted** rather than measured, and what tier
  does an agent with nothing but those reach?
- Does an absent measurement score as zero, or as full credit? (A latency of `0`
  passed for "unknown" reads as a perfect response.)
- **Compute the ceiling before sizing anything as a percentage of it**, and
  drive it through the real scoring path rather than trusting a function named
  `reachableCeiling`. That figure has already moved once.
- Is there exactly one tier ladder? Open-coded score comparisons have appeared
  four times, each disagreeing with `TIER_FLOORS` at a boundary.
- Proof presentation: does a proof object assert `is_real` over a score that was
  never computed?

### TrustShell — evaluate / verifyOutput / receipts / wrapper
- Does a verifier accept a **caller-supplied audience**? That turns it into an
  oracle that launders proofs for any audience.
- Replay: is the nonce store per-instance? Then a replay against a different
  serverless instance is not caught, whatever the response says.
- Receipts: does the audit preimage commit to **every** field? A field outside
  it can be rewritten for free.
- Wrapper bypass: is the gate reachable without the wrapper, and is the wrapper
  itself injectable from the content it evaluates?

### TrustMarket / x402 — payment gating and settlement
- Type confusion on amounts: `NaN > limit` is `false`, so an unvalidated number
  can *pass* a limit rather than fail it. Probe negative, `NaN`, `Infinity`,
  numeric strings, `null`, arrays.
- Is a "signature" gate verifying signatures, or counting distinct strings?
- Does an unreadable spend history read as zero spend?
- Settlement: replay, double-settle, and does a simulated execution report
  itself as simulated all the way into the receipt?

### Identity spine and MCP surfaces
- Can the examinee pick its own checker, or its own criteria?
- Does a delegation chain check each link's authority, or just the signatures?
- Is a capability set that *looks* read-only actually read-only under a
  reachability search?
- MCP tools and agent wrappers: unauthenticated write channels into an agent
  loop are the highest-severity thing in this category.

---

## 7. Severity — calibrate on direction of failure

Rank by **which way the control fails**, not by how alarming the component
sounds.

- A missing secret that makes the mint path **throw** fails closed: the feature
  is down, nobody is forging anything.
- The same secret **set to a published constant** would fail open, if the guard
  did not refuse it — receipts mint and every one is forgeable.

Those are wildly different severities and they look identical in a status
dashboard. Establish which one you are looking at *by executing the guard*, not
by reading the status word. The first draft of `LIVE-001` had this backwards and
live evidence is what caught it; the probe now asks `requireAuditSecret` rather
than carrying its own table, so it cannot drift again.

Also weigh **reachability**. A hole on a path no caller reaches is real and
cheap to fix now; say both parts.

---

## 8. External tooling

None of the following is installed in this repo, and none has been run here.
Treat everything in this section as unprobed. Any campaign that uses one must
record what it actually observed, not what the README promises.

| tool | fits | where it would plug in |
|---|---|---|
| **NVIDIA Garak** | broad model-level scanning: hallucination, prompt injection, package hallucination, encoding, leakage | pointed at a HAL-backed endpoint or a model that routes through TrustShell |
| **Microsoft PyRIT** | multi-turn adaptive attacks (Crescendo, TAP) | HAL decision loops and long-horizon agent autonomy — the thing a single-shot probe cannot reach |
| **Promptfoo** | CI-style regression suites at the application layer | a second gate beside `check:redteam` for wrapper/RAG behaviour |
| **DeepTeam** | agentic systems mapped to OWASP LLM / Agent Top 10 | coverage-mapping, not a replacement for custom probes |

**Custom probes outrank all of them for this system**, and that is not a
preference. Garak and PyRIT attack a *model*; the interesting failures here are
in trust *arithmetic* — a limit that passes on `NaN`, a verdict reachable only
on an unanchored window, a signature gate counting strings. No generic scanner
has a concept of those. Use the external tools for the language-model surface
and this suite for the trust layer, and do not let a green Garak run stand in
for either.

---

## 9. Report format

Produce exactly this. Findings ordered most severe first.

**Executive summary** — overall posture in a sentence, at most three headline
findings, and the immediate actions. Say what was *not* covered here, not at the
end where it gets skipped.

**Findings**, each with:

- **ID** (`HAL-001`, `PAY-002`, …) — matching the probe id where one exists
- **Title**, **Component**, **Severity**
- **Description** — the mechanism, not the symptom
- **Evidence** — the transcript. Exact inputs, exact outputs, and where they
  came from. If it is source-derived, say so here.
- **What this does NOT establish** — required. Every finding has a boundary and
  the reader will otherwise assume the largest one.
- **Impact** — who is harmed, and how reachable is the path today
- **Recommended fix** — the smallest change that closes it. Prefer a primitive
  the repo already ships over a new one.
- **Re-test plan** — the exact command, and what "fixed" will look like

**Coverage map** — tested / NOT CHECKED (with the reason) / not attempted. The
middle column is the point of the table.

**Residual risk and next campaign.**

---

## 10. Rules of engagement

- Only this project's systems. Nothing third-party.
- **Never move real mainnet value.** Devnet and simulation only.
- Read paths before write paths; keyless before credentialed.
- Do not write to production tables to prove a write is possible. Prove it at
  the privilege level, or on a row you created and then removed — and say which.
- Sean-gated actions are gated during a red team too. Log `BLOCKED_FOR_SEAN`
  with the exact action and move on.
- Label experimental vs production behaviour explicitly.
- If a tool or endpoint is unavailable, **document the gap**. Never fill it with
  a plausible result.
- When you finish: update `scripts/redteam/ledger.json`, write the report, and
  add the result to `docs/PRIOR-WORK-INDEX.md`. A finding nobody can find gets
  rediscovered at full price.
