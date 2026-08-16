# Red team charter — briefing an external agent (XAI / Grok / Gemini / a human)

This is the document you paste to another model, or hand to a contractor, when
you want them attacking the Trinity / TrustShell trust layer. It is written to
be used whole. Section 4 is the paste-ready block.

Companion pieces: the skill Claude runs from is
`.claude/skills/trust-red-team/SKILL.md`; the executable suite is
`npm run check:redteam`; triaged findings live in `scripts/redteam/ledger.json`.

---

## 1. The division of labour, and why it is drawn here

An external agent gets **collection and hypothesis generation**. It does not get
**judgement**.

That is not a comment on any particular model's ability. It follows from what
each side can be held to:

- An observation is **checkable**. If Grok fetches `/api/version` and writes down
  the response, a wrong reading of that response does not corrupt the file — the
  bytes are still what the endpoint said, and a probe here re-reads them.
- A verdict is **not checkable** without redoing the work. "This endpoint is
  vulnerable" imports the reasoning wholesale, and if the reasoning is wrong
  there is nothing left to catch it.

So the pipeline is:

```
external agent          this repo
──────────────          ─────────
fetch a live surface ─> scripts/redteam/evidence/*.json ─> a probe judges it
propose an attack    ─> a probe implements it          ─> the runner scores it
```

Both arrows narrow. Nothing an external agent says becomes a finding without
passing through executable code that lives here and that a reviewer can read.

**This applies to Claude too.** The two probe bugs that produced fabricated
findings during the first campaign were written by Claude, and were caught by
probe anchors rather than by anyone's judgement. The mechanism is the point, not
who is on which side of it.

## 2. What an external agent is genuinely better at

Not a consolation prize — these are the jobs worth handing over:

1. **Network reach.** Every custom domain here is proxy-denied from a Claude
   agent session. An agent with ordinary egress can collect what this one cannot.
2. **Running the external scanners.** Garak, PyRIT and Promptfoo want a live
   endpoint, a Python environment and time. None is installed here.
3. **Adversarial breadth.** Generating attack *hypotheses* — especially
   multi-turn and social ones — is exactly where a second model with a different
   prior pays. Send hypotheses; they become probes.
4. **Independent replication of a specific claim.** "Here is finding PAY-001 and
   the payload; try to refute it" is a well-posed job with a checkable answer.

## 3. Scope and fences — non-negotiable

**In scope**

- `lib/trustshell/**`, `lib/trust/**`, `app/api/**` in `DealAppSeo/trinity-ecosystem`
- `app.aitrinitysymphony.com`, `www.aitrinitysymphony.com` (read paths)
- Base Sepolia **testnet** ERC-8004 identity and reputation registries
- The published `@hyperdag/*` packages, as installed artifacts

**Out of scope — hard stops**

- Any mainnet transaction, any wallet holding real value. Devnet/testnet only.
- Denial of service, load generation, or anything that degrades a live surface
  for real users. This is a correctness engagement, not a resilience one.
- Third-party systems: Supabase, Vercel, Railway, GitHub as *platforms*. Our
  configuration of them is in scope; their infrastructure is not.
- Writing to production tables to demonstrate that a write is possible. Prove it
  at the privilege level, or on a row you created and then removed — and say
  which one you did.
- Anything requiring a credential you were not explicitly given. Do not attempt
  to obtain one.

**Report, do not exploit.** If you find a live path to real value, stop, capture
the minimum evidence that establishes it, and report immediately.

## 4. The brief — paste this block

> You are running a **constructive red team** against the Trinity / TrustShell
> trust layer. Your job is to find weaknesses and make them reproducible. You are
> a hardening partner, not an attacker: every finding must arrive with evidence
> somebody else can re-run.
>
> **Targets.** HAL (hallucination assessment, scoring, veto, cross-LLM quorum,
> the audit chain). RepID and ERC-8004 (score integrity, tier logic, proof
> presentation, manipulation resistance). TrustShell (evaluate / verifyOutput,
> receipts, keyless vs credentialed paths, wrapper bypass). TrustMarket / x402
> (payment gating, service discovery, settlement integrity). Related surfaces:
> MCP tools, agent wrappers, ZKP verification.
>
> **The rule that governs everything you report.** Three outcomes, never two:
> **HELD** (the attack ran and the system refused), **BREACHED** (the attack ran
> and succeeded), **NOT_CHECKED** (you could not run it). If you could not reach
> something, write NOT_CHECKED and say what would let you run it. Do not infer
> that a control is sound because a page returned 200 — reporting an untested
> control as safe is the single worst outcome of this engagement, worse than
> missing it entirely, because it will be believed.
>
> **Evidence is mandatory.** Never claim a successful attack without the exact
> request, the exact response, the status code, and the receipt / proof object /
> on-chain data. A finding without a transcript will be discarded, not
> investigated. If your evidence is derived from reading code rather than
> running it, say so in the finding, in those words.
>
> **State the boundary of every finding.** One line: "this establishes X; it does
> not establish Y." A finding without a stated boundary is read at its largest
> possible interpretation, and that is how a security report becomes wrong.
>
> **You do not decide what is a finding.** Send observations and reproductions.
> A probe in the repository judges them. This is the same rule the internal
> agent operates under.
>
> **Rules of engagement.** Testnet and devnet only — never move real mainnet
> value. No denial of service, no load generation, no degrading a live surface.
> No third-party infrastructure. No writes to production tables to prove a write
> is possible. Do not attempt to obtain a credential you were not given. If you
> find a live path to real value: stop, capture the minimum evidence, report
> immediately.
>
> **Prioritise, in this order.** (1) Controls that should fail closed and might
> not — an unreadable limit, an unevaluated check, a missing credential: does the
> system refuse, or does it proceed? (2) Independent verifiability — can a third
> party check a receipt or proof without trusting us, and does the object commit
> to everything it appears to? (3) Identity and reputation manipulation — which
> inputs to a score does the subject control, and what do they buy? (4) Type
> confusion on numeric gates — `NaN > limit` is `false`, so an unvalidated amount
> can *pass* a limit rather than fail it; probe negative, NaN, Infinity, numeric
> strings, null and arrays against every threshold.
>
> **Deliver, per finding:** ID, title, component, severity
> (Critical/High/Medium/Low/Informational), description of the *mechanism*,
> evidence transcript, what it does NOT establish, impact and how reachable the
> path is today, the smallest fix that closes it, and a re-test plan. Then a
> coverage map: what you tested, what you could not test and why, what you did
> not attempt. End with residual risk.

## 5. Collecting live evidence

If your job is collection, write one file per surface into
`scripts/redteam/evidence/` following that directory's README:

```json
{
  "surface":      "www.aitrinitysymphony.com",
  "url":          "https://www.aitrinitysymphony.com/api/version",
  "collectedAt":  "2026-08-16T17:16:21.245Z",
  "collectedBy":  "grok-4 via <operator>",
  "collectedVia": "curl from <where>",
  "statusCode":   200,
  "body":         { "...": "verbatim response body, unedited" }
}
```

`collectedBy` and `collectedVia` are the fields people skip and the reason this
is evidence rather than an assertion: they record who looked and by which egress
path. That matters concretely here — `pg_net` and `curl` reach different sets of
hosts, so a failure on one says nothing about the other.

Do not reformat, filter or summarise `body`. A collector that edits the body has
started judging.

## 6. Handing back a proposed attack

The most useful thing an external agent can return, after evidence, is a probe
we can run forever. Send:

1. **The threat in one sentence** — who gains what.
2. **The exact inputs**, including the ones expected to be *refused*.
3. **The anchor**: an input that must still succeed. Without it we cannot tell a
   hardened target from a broken probe, and that has already produced fabricated
   findings twice in this project.
4. **What a breach looks like** versus what safe degradation looks like.

That maps one-to-one onto a file in `scripts/redteam/probes/`, which is how a
one-off attack becomes a permanent regression test.

## 7. What is already known — do not re-report

Check both before writing anything up:

- `scripts/redteam/ledger.json` — triaged, owned, with a review date.
- `docs/PRIOR-WORK-INDEX.md` — closed findings, and a **RETRACTED** list of
  figures that must never be cited again.

A report that re-reports a known finding as new gets the whole report discounted,
including the parts that were right.
