# Agent hosting — where an agent runs, and where its governance lives

**These are two different questions, and conflating them is the expensive
mistake.** Every platform now offers to host an agent. None of them offers to
govern one in the sense this repo means by the word.

**What this document is not.** It does not re-cover harness *design* — the
evaluator-trust problem, sprint contracts, role isolation and context resets are
settled in `docs/HARNESS-RESEARCH-2026-08-15.md` and
`docs/TRUST-HARNESS-DESIGN-2026-08-15.md`, and our own harness's six dimensions
are in `docs/HARNESS-SPEC.md`. This document is about the layer underneath
those: which vendor's compute the loop runs on, which vendor's credentials it
holds, and which single place is allowed to say no.

---

## 0. Source status — read before quoting anything below

| source | how obtained | status |
|---|---|---|
| The Tool Nerd, *"10 Agent Harnesses Every AI Builder Should Know in 2026"* | Fetched 2026-08-16 via `pg_net` (`thetoolnerd.com` is egress-blocked from an agent container; the page is also JS-gated, so the body was extracted from the Substack hydration payload, not the served HTML) | **VERIFIED** as to what the article *says*. HTTP 200, full body, 2,246 words |
| That article's product roster — star counts, repository owners, launch dates | not independently checked | **NOT CHECKED.** Several repository paths in it do not match what I would expect for those projects. Treat the whole roster as marketing |
| `Omnigent` (Databricks), `HarnessAgent` in Vercel AI SDK v7 — cited there as "meta-harnesses" | not independently checked | **NOT CHECKED.** I could not confirm either exists as described. The *category argument* is sound; the two named examples are unverified |
| GitHub Copilot cloud-agent settings on `DealAppSeo/repid-engine` | read from a screenshot supplied by Sean, 2026-08-16 | **NOT CHECKED against the API.** Toggle states below are as displayed, not as queried |
| Cloudflare account posture | — | **NOT CHECKED.** The Cloudflare MCP server requires authorization and this session is non-interactive. No claim here rests on inspecting the account |
| `service_role` has `rolbypassrls = true` | `pg_roles`, 2026-08-15 | **VERIFIED.** See `CLAUDE.md` |
| Whether the `trustrails` Vercel project sets `SUPABASE_SECRET_KEY` in production | no tool exposes env var *names*; no `VERCEL_TOKEN`, no `vercel` CLI | **NOT CHECKED.** Already tracked as OPEN in the index. Needs the dashboard |

The article is a newsletter roundup with an obvious interest in the conclusion
that harnesses matter more than models. Its taxonomy is useful. Its comparative
claims — "the same model scores noticeably higher inside this harness" — arrive
without citation and should be treated the way this repo treats any uncited
number.

---

## 1. Three categories that all get called "build an agent here"

The offers are not the same kind of thing. Sorting them is most of the analysis.

| category | the service is the… | examples | you are buying |
|---|---|---|---|
| **1. Acts on the service** | *subject* — the agent edits the thing the vendor hosts | GitHub Copilot cloud agent; Claude Code on the web | proximity to the artefact, and a pre-solved auth story against it |
| **2. Runs on the service** | *substrate* — generic compute that neither knows nor cares the workload is an agent | Cloudflare Workers; Railway; Vercel functions | runtime characteristics: cold start, statefulness, CPU ceiling, cost shape |
| **3. Embedded in the data plane** | *state* — the agent runs beside the data under one auth model | Supabase Edge Functions | adjacency to the data, and the database's own permission model |

A realistic deployment uses one from each category. **The interesting design
question is not which to pick — it is what sits between them.**

---

## 2. The component checklist, and where we actually stand

The one durable contribution of the source article is a decomposition of a
harness into named parts. Used as an audit checklist against our spine
(`lib/trustshell/`, PR #52), the picture is lopsided in a way worth stating.

| component | ours | note |
|---|---|---|
| Core model | — | not our layer |
| Agent loop | **built** | `harness/loop.ts`; composed as `runContractedWork()` |
| Execution tools | **built** | |
| Sandbox | **inherited** | the container, not something we designed |
| Filesystem + git | **inherited** | |
| Memory (`AGENTS.md` / `CLAUDE.md`) | **strong** | see below |
| Context engineering | **partial** | compaction is the platform's; offloading and progressive disclosure are implicit, not designed |
| Skills & prompts | **strong** | `docs/AGENT-LOOP-PROMPTS.md` |
| Subagents | **built** | |
| MCP | **built** | `mcp/client.ts`, `docs/MCP-FLEET.md` |
| Guardrails | **scattered** | real but conventional — see §4.3 |
| Observability | **built, and the wrong question** | see §3 |

**Where we are already past the field: memory and skills.** The article's own
line — *"every rule in a good AGENTS.md traces back to a real failure someone
saw"* — is a description of `LESSONS.md` → `CLAUDE.md` → `docs/PRIOR-WORK-INDEX.md`,
except that we mechanised it. `npm run check:prior-work` fails the build when a
new file cites a retracted figure, and again when a doc is invisible to the
index. No harness in the roster claims anything of that shape. The article
imagines memory as a file the agent reads; ours is a file the build enforces.

---

## 3. Observability is not verification, and every harness on offer confuses them

Every harness in the roster defines observability as **logs, traces, cost
metering, latency**. All of that answers *what did the agent do*.

None of them answers *did the agent earn the success it reported* — which is the
thesis this repo was built on (`docs/TRUSTSHELL-V1.md` §1) and what
`runContractedWork()`, the distinct checker key, and the mutation gate exist to
establish.

This is not a small distinction and it is not ours alone. `HARNESS-RESEARCH`
§1 records the same conclusion reached independently by Anthropic and by
LongHorizon; §2 records that **both of their designs still have the hole** —
they put a verifier next to the worker and cannot tell you why to trust the
verifier.

**The operational consequence for hosting: a green check from any hosted agent
platform is the exact artefact this repo treats as untrustworthy by default.**
Adopting a platform from category 1 or 2 does not import verification, and must
not be scored as though it did. Three outcomes, never two — a vendor's console
has two.

---

## 4. Three things worth borrowing

### 4.1 Plan/Act as a hard capability boundary, not a prompt

Two harnesses in the roster ship a read-only planning agent alongside the
write-capable one (OpenCode's plan agent; Cline's Plan/Act modes). The idea is
cheap and the mapping to our history is exact: our most expensive documented
failure was two sprints spent optimising a component already near its
theoretical bound, because nobody computed the bound first.

We currently enforce "measure the ceiling before optimising toward it" with
**prose in `CLAUDE.md`**. These harnesses enforce the analogous rule with **tool
grants** — the scoping agent physically cannot write. `HARNESS-SPEC.md` §2.5
already has the authority ladder this would hang from, and `HARNESS-RESEARCH`
§4.4 already recommends read-only roles. This is the concrete form.

**Not yet built. Not yet costed.**

### 4.2 Deliberate tool minimalism

One harness in the roster ships six tools — Read, Bash, Edit, Write, Find, LS —
and no MCP integrations by default, treating extension as the user's job.

Contrast the observed state of this session: on the order of **290 deferred MCP
tools connecting and disconnecting repeatedly mid-task**, across servers with no
relationship to the work. A tool surface that changes underneath you cannot be
audited, and **enumerable tools are a precondition for §5** — you cannot state
what an agent may touch if you cannot state what it can reach.

### 4.3 Tool approvals as a first-class primitive

We have this as scattered convention: *"never publish on your own initiative"*
in `CLAUDE.md`, the checker-key refusal in the spine, the confirm-before-
destructive habit. Each is real. None of them is a chokepoint — they are
agreements, and an agreement is enforced by whoever remembers it.

Promoting them to one interception point is §5.

---

## 5. The broker — and why governance is not composition

**Recommendation: centralise the policy and receipt layer. Do not centralise the
reasoning.**

A "manager agent" that reasons about what sub-agents should do inserts a
nondeterministic hop into something that wants to be deterministic, and it fails
in the most expensive way available — plausibly. What is wanted is a **broker**:
one chokepoint that

- holds credentials and issues scoped, short-lived ones downward — no agent ever
  holds a root key;
- enforces an allowlist of what each agent may reach;
- emits a uniform receipt per action;
- is boring code, not a model.

That is the shape of the spine already shipped — `runContractedWork()`, the
checker-key refusal, the signing identity. **The move is not to build a new
manager. It is to extend the spine into the broker role and let vendor-hosted
agents be workers that call through it.**

### 5.1 The distinction the source article blurs

The article names an emerging "meta-harness" category: run several harnesses
under one environment with consistent sessions and policies. Its examples are
NOT CHECKED (§0). But the category argument contains a conflation worth naming,
because buying the wrong one would read as solved on a slide:

| axis | what it gives you | what it does not |
|---|---|---|
| **Composition** (what the article describes) | one interface driving many harnesses | any opinion about credentials, blast radius, or whether a reported success was earned |
| **Governance** (what we need) | one place that holds keys, bounds reach, and emits receipts | convenience across vendors |

A composition layer sits **above** a broker. It does not replace one.

### 5.2 Where the broker should run — a recommendation, not a measurement

Of the four platforms in play, **Cloudflare is the best structural fit**:
Workers give a low-cost hop; Durable Objects give one serialised state machine
per agent run, which is simultaneously the concurrency control and the natural
place to append the receipt log; and it is the only one of the four that is
credential-neutral — not GitHub's opinion of the repo, not Supabase's opinion of
the data.

**This is reasoning from documented platform primitives, NOT a measurement.**
Nothing has been benchmarked, no Worker has been deployed, and the Cloudflare
MCP server was unauthorised in the session that wrote this (§0). Before this is
acted on, the broker hop's added latency must be measured against the
alternative of hosting it on Railway beside `repid-engine`. **Do not cite §5.2
as a settled choice.**

---

## 6. Per-platform notes

### 6.1 GitHub — category 1

The settings observed on `repid-engine` are the right ones. Specifically:

- **"Require approval for workflow runs" — keep ON.** The warning shown beside
  it is not boilerplate. Agent-pushed code running Actions without approval
  means unreviewed code with write access to the repository and access to its
  secrets.
- **"Only allow automations to be triggered by users with write access" — keep
  ON.** This is the prompt-injection control. An issue body from a stranger is
  untrusted input to any agent that reads it.
- **Firewall + recommended allowlist ON**, custom allowlist kept minimal.

**The gap that is not on that settings page: secret scoping.** `CLAUDE.md`
already records the `NPM_TOKEN` trap — a token in the Variables tab makes
`${{ secrets.NPM_TOKEN }}` resolve to an empty string with no error. The
generalisation for agents: an agent-triggered workflow should run against an
Actions *environment* with its own narrow secret set, never the repository-wide
set. **Not currently configured; NOT CHECKED whether any environment exists.**

Keep the rule we already follow: agents propose via PR, never push to a default
branch.

### 6.2 Cloudflare — category 2

Workers for the broker; Durable Objects for per-run state and serialisation;
Queues for retry with backoff **rather than retrying inside the agent loop**, an
in-loop retry pays full token cost on every attempt. Secrets via `wrangler
secret`, never `wrangler.toml`. The binding constraint is the CPU ceiling: a
long agent loop must be split across invocations or driven from a Durable Object
alarm. All of this is from platform documentation; **none of it is measured
here.**

### 6.3 Supabase — category 3

This is where our own settled facts bind hardest.

**An agent must never hold an `sb_secret_…` key.** That key authenticates as
`service_role`, which has `rolbypassrls = true` [VERIFIED 2026-08-15, `pg_roles`]
and therefore consults no policy at all. An agent holding it has unmediated
access to every table in the project, and **RLS is not a control on that path** —
it cannot be made into one.

The pattern that works: an Edge Function holds the secret and exposes only the
narrow operation; the agent calls the function. That keeps the privileged key on
one side of a boundary the agent cannot reach around.

Two standing facts that bear on any agent given the publishable key: it maps to
the `anon` role and ships in the browser bundle, and the anon exposure sweeps
recorded in the index deliberately left **17 tables with anon INSERT** as genuine
public-form targets. An agent authenticating as `anon` inherits exactly that
surface — no more, and no less.

### 6.4 Railway — category 2

Fine as generic compute for a long-running worker, with no Workers-style CPU
ceiling. It is the weakest of the four on identity primitives — it is a
container host. **Treat it as where the agent process runs, not where agent
policy lives.** `repid-engine` already exposes `deployed_commit` at `/health`,
which is the right instinct and the thing to extend.

### 6.5 Vercel — category 2

Relevant here mainly as a caution already paid for: **two projects in this
account are named after domains they do not serve**, and both produced a wrong
finding (`CLAUDE.md`). Before concluding anything about a live surface from a
Vercel project — including anything about an agent deployed to one — check the
project's `domains` array. Matching the name is not evidence.

---

## 7. Where a new person should build

**Not on any of these first.** Build locally against the model provider's SDK
directly. The failure modes that must be internalised — the loop that will not
terminate, the malformed tool schema, the context blowout, and above all the
model that confidently reports success it has not earned — are all plainly
visible locally and all obscured behind a hosted runtime's green check.

Then, in order of what each teaches:

1. **Local SDK** — you see the loop, so you learn what a harness is for.
2. **A minimal open-source harness** — you see what the harness adds, because
   the surface is small enough to read.
3. **A hosted platform** — you get throughput, having already learned what its
   green check does and does not mean.

A cloud agent that opens PRs for you is the *easiest* entry and teaches the
least, because it never shows you the loop. That is a fine trade when you want
output and a bad one when you want judgement.

---

## 8. What this document does not establish

- **No product recommendation is measured.** §5.2 reasons from documented
  platform primitives. No Worker was deployed, no Durable Object was created, no
  latency was measured, and the Cloudflare account was never inspected.
- **The source article's roster is NOT CHECKED** and probably contains errors
  (§0). Nothing in §4 depends on any specific product existing as described —
  the three borrowed ideas stand on their own merits, which is why they are
  stated as ideas rather than attributed as features.
- **The meta-harness examples are unverified.** The *category* distinction in
  §5.1 is an argument, not a survey.
- **No cost model.** Per-invocation billing against data-dependent loop lengths
  is the obvious risk in every category-2 option and is not priced here.
- **The GitHub settings are as displayed in a screenshot**, not as queried from
  the API, and whether any scoped Actions environment exists is NOT CHECKED
  (§6.1).
- **Nothing here has been built.** This is a placement argument for work that
  does not exist yet. Its purpose is to stop the broker being built three times
  in three places, which is the failure mode `PRIOR-WORK-INDEX.md` exists to
  prevent.
