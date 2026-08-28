# ONE ANOTHER — the build plan, and the two findings that reorder it

**Written 2026-08-22.** Scope: what to do between now and the Gloo build window, how
`oneanother.dev` should be laid out so it does not repeat the defects this ecosystem has
already paid for, and which PAI roles earn their place.

Everything below marked **MEASURED** was read or run in this session. Everything marked
**UNVERIFIED** was not, and names the instrument that would settle it. Two outcomes collapse
"we did not look" into "it passed" — so there are three.

---

## 0. The two findings, before anything else

### F1 — Three unrelated constraints all demand the same artifact: a published harness package

The Gloo rule (see §7 for its verification status) is that teams **may build on existing
technology**, but are **judged on code written during the window**. That single sentence
decides the architecture:

- Harness code **imported as a versioned dependency** is unambiguously existing technology.
  Every line written after the window opens is judged work.
- Harness code **pasted into the repo during the window** is ambiguous at best. It either
  inflates the judged diff with work that predates the contest, or it forces you to argue
  provenance to a judge from a git log.

Two other constraints, from completely different directions, point at the same artifact:

- **Growth.** The tooling triage measured the ranking directly: skill packs and drop-ins
  (openclaw 387k, superpowers 276k, mattpocock/skills 230k) outrun genuinely good frameworks
  (swarms 7.1k, AgentStack 2.2k) by one to two orders of magnitude. The mechanism is switching
  cost. The SDK is what people reach for *after* a drop-in made them care.
- **Secret containment.** [MEASURED] `repid-engine/package.json` carries a `prepublishOnly`
  hook that **hard-refuses `npm publish`**, because the repo contains the scoring formula and
  the repo is public. A package is therefore not merely the nicest way to let `oneanother.dev`
  consume the harness — it is the only way that does not either leak the formula or copy it.

Contest rules, growth mechanics, and secret containment are three independent arguments for
one deliverable. That makes it the critical path.

**And it is currently blocked on Sean.** [MEASURED] `VISION_VS_VERIFIED.md` row 1 states the
public npm/CLI wrapper is **`BLOCKED_FOR_SEAN: npm publish`**. Nothing downstream of this moves
until that decision is made. It is the single highest-leverage unblock on the board.

### F2 — The product's central promise is currently falsifiable by "view source"

ONE ANOTHER's non-negotiable is that *no one becomes a public fundraising story* and *the
person receiving help is never the product*.

[MEASURED 2026-08-16, `pg_policies`, recorded in `LESSONS.md` S3] The Supabase project
`qnnpjhlxljtqyigedwkb` currently has **198 policies over 196 distinct tables** in `public`
readable by `anon` or `PUBLIC` with qualifier literally `true`. The publishable key maps to the
`anon` Postgres role and **ships in the browser bundle by design**. Anyone who views source can
read every row and column of all 196 — not the aggregates a UI renders.

There are zero beneficiary records today. That is exactly why this is the moment to decide it.
The E2E plan already states the governing principle, and it applies here without modification:

> The organising principle is **irreversibility, not visibility**: the system has zero users
> today, and the decisions that get expensive after users are the ones to make now.

**Consequence for the build:** `oneanother.dev` must not write beneficiary data into that
project's `public` schema on its current posture. Either a separate project, or a dedicated
schema that is deny-by-default and **proven so by a check that fails the build**, before the
first burden record exists. A privacy promise that rests on nobody having looked is not a
privacy promise — and this is the one claim the whole product cannot afford to have retracted.

---

## 1. What is actually built today

Read directly this session. This is the honest inventory — it is substantially more than the
vision documents imply.

| Piece | State | Evidence |
|---|---|---|
| **Trust harness, 7 legs** | Built | `npm run demo:harness` → `scripts/demo/trust-harness-e2e.mjs` (540 lines). Legs: HAL quorum · RepID keyless read · ZK range proof **verified locally against a real STARK verifier** · Poseidon2 scoped nullifier · Base Sepolia anchor · outcome classify + fold · dual-auth gate |
| **zkRepID** | Built, name canonical | `src/zkrepid/{index,boundary,disclosure}.ts`. Decided 2026-08-17; boundary is **machine-checked in both directions** by `tests/zkrepid-boundary.test.ts` — the doc going stale turns the build red |
| **x402** | Built, ~15 modules | facilitator · gate · settlement-verifier · deferred-settlement · recovery-worker · outbound-client · outcome-link · release-retry-worker |
| **ERC-8004** | Built | canonical-writer · minter · poster · reputation · `zkp/erc8004-linkage.ts` · agent-passport · onchain-outbox |
| **Outcome + just-culture scoring** | Built and invariant-tested | `outcome-classification.ts` (7 classes) · `repid-confession.ts` (NASA-ASRS, discount 0.4) · `effective-authority.ts` · `x402-outcome-link.ts` (no-proof-no-pay) |
| **Role → capability → binding contract** | **In flight, this week** | PR #469 (2026-08-22). Aimed explicitly at *"a PAI acting as CMO"*. See §5 |

**What is NOT ready, stated as gaps rather than omitted:**

- **Public package** — `BLOCKED_FOR_SEAN: npm publish`. F1's critical path.
- **`presentProof` / standalone verification surface** — a third party cannot yet verify a
  proof without our API key. Named "Surface B" in `VISION_VS_VERIFIED.md`. This is the exact
  surface a *Proof of Care* needs.
- **[UNVERIFIED] The harness has not been re-run in this session.** `CLAIM_LEDGER.md` records
  all legs REAL on **2026-08-07** — 15 days ago. `demo:harness` needs live credentials and
  network to Railway and Supabase; both are **proxy-denied from an agent session** [MEASURED,
  `LESSONS.md` E1/E2]. Re-run it before it is demoed or quoted. The instrument is a shell on a
  machine that can reach those hosts — Sean's, not this one.

### 1a. One landmine sits directly on the Proof-of-Care path

[MEASURED, `docs/E2E-TRUST-LOOP-PLAN.md` L2 — **found, not fixed**]

`agent_repid_history.payment_proof_hash` carries a **UNIQUE constraint**. The apply trigger
fills it from a three-step fallback: the event's `tx_hash`, then its idempotency reference,
then a **hardcoded placeholder** — and that placeholder already occupies the unique slot.

So **any trigger-applied score event with neither a tx hash nor an idempotency key fails its
entire INSERT** — not just the history row, the whole event. Two unanchored events in a row is
all it takes.

A *Proof of Care* is a score event that may legitimately have no on-chain transaction behind it
— care that was delivered by a person, not a payment. That is precisely the shape that trips
this. **Every writer on this path must supply `idempotency_key`.** Treat it as a hard interface
requirement on the Proof-of-Care issuer, and add a check that fails the build if a writer omits
it. Fixing the schema properly is a settlement-semantics decision and belongs to whoever owns
that; the interface requirement does not wait for it.

### 1b. The agents that would build this are not running

Sean's stated goal is to *"factually say that I used my custom local agents using my
TrustShell harness to build this."* That ambition has a dependency the rest of this plan
assumed away, and it is owned by Sean.

[MEASURED 2026-08-22, direct query] `trinity_tasks` holds **363,040 rows all-time and 12 in
the last 7 days**, latest at **09:15:00 UTC** — which is the `e2e_smoke_nightly` cron
(`jobid 8`, `15 9 * * *`), not work. `repid_score_events`: **27 rows in 7 days** against
152,174 all-time. This matches the OPEN entry
`hal-volume-stopped-2026-07-17` exactly, and confirms it still holds **36 days on**: the
pipeline stopped 2026-07-17 22:18 UTC, HAL is downstream of it rather than the cause, and
every survivor alert since says *"Manual redeploy required. Autonomous redeploy disabled."*

**This is not a HAL problem and not a code problem.** It is a Railway redeploy that only Sean
can perform. Until it happens:

- The CMO PAI cannot run the Aug 22 → Sept 7 collateral lane on the swarm.
- "Built by my own agents" is not a claim that can be made truthfully about work the swarm did
  not do — and it is exactly the class of claim this ecosystem exists to keep honest.

It belongs **ahead of everything in §3**, because it gates the labour that does the rest. The
open entry also names four causes it already ruled out by evidence; read it before
re-diagnosing anything (`npm run why:open trinity_tasks`).

---

## 2. The clean-slate repo: `DealAppSeo/oneanother`

Sean asked for a build without the misfires, conflicts, bugs and file-naming confusion of the
last one. Those are on record. Every decision below names the incident it prevents — a rule
whose reason is written down survives a rewrite; one that reads as tidiness does not.

### 2.1 Structural decisions

| Decision | The incident it prevents |
|---|---|
| **One repo. Not a monorepo, not a split.** | `cross_repo_read` is a **capability an agent must hold and have measured** [MEASURED, `run-agent.mjs:146`]. An agent without it that is asked a cross-repo question returns a *plausible answer, not a failure* (LESSONS 1). A single repo means every agent needs only `repo_read` — the confusion is designed out rather than policed. |
| **The harness enters as a version-pinned dependency. Never a copy.** | F1. Plus a `check:harness-provenance` that fails the build if harness source appears in-tree — so the judged boundary cannot erode by accident under deadline. |
| **`check:*` auto-discovery from commit one.** | LESSONS A16: a hand-maintained check chain was *one shared line* that **five PRs conflicted over in a single night**, and it silently kept **5 suites / 145 assertions** out of CI because adding one meant editing that line. `scripts/check-all.mjs` discovers every `check:*` in `package.json`. Adding a suite is adding a script — nothing else. |
| **Three outcomes, encoded before there is anything to check.** | Exit `0` VERIFIED · `2` NOT_CHECKED · anything else FAILED. The recurring defect across this whole ecosystem is *a system reporting success it has not earned* — three instances in one session, in three unrelated components. A boolean cannot express "nobody looked", so no status field is a boolean. |
| **One test root, declared once. One jest config.** | repid-engine has **three** categories of test directory and only two run: six `src/**/__tests__/` folders jest never sees, yet `tsc` still compiles them into `dist/`. It also has *both* a `jest.config.js` and a vestigial `jest` key in `package.json`, so a bare `npx jest` aborts outright. Neither is discoverable from a green run. |
| **`.gitignore` written first, every rule naming its incident.** | Copy repid-engine's discipline verbatim — it is the best artifact in the ecosystem. `/_scratch-*` exists because `_scratch-dpb.mjs` appeared in the repo root carrying `.env.master` loading and a live signing key. `.claude/worktrees/` and `.next/` have both been committed here before. `*.tsbuildinfo` stays **untracked** — LESSONS E4: it is rewritten by every `tsc`, which made a `git stash pop` conflict, and the pop failed silently into `/dev/null` and reverted the working tree. |
| **Root holds ≤ 8 files. Dated work lives in `reports/<date>/`.** | repid-engine's root carries **37 `XC_*_REPORT.md` files** and the repo holds **116 dated reports** — a state its own `CLAUDE.md` describes as "the 117th report nobody reads". Filing a lesson has never prevented its recurrence; only putting it in front of the worker has. |
| **One naming convention, mechanically checked.** | The literal ask. `kebab-case.ts` for modules · `kebab-case.md` under `docs/` · `SCREAMING-KEBAB.md` for the few root docs. `check:naming` enforces it. And per LESSONS 11: if lane globs are introduced, they are **tested pairwise for overlap** — the first draft of the existing set collided on **all 21 pairs**, and the fix is the input, never the checker. |
| **`LESSONS.md` injected, not filed, with a hard character cap.** | The cap **is** the mechanism, not tidiness: an un-injectable file becomes the report nobody reads. A new lesson must replace or generalise an existing one. |

### 2.2 Layout

The layout has one job beyond organisation: **make "what was built during the window"
answerable by pointing at directories, rather than by arguing from a git log.**

```
oneanother/
├── CLAUDE.md              # only facts NOT discoverable from the code. One screen.
├── LESSONS.md             # injected into every dispatch. Hard cap.
├── README.md
├── package.json           # check:* auto-discovered by scripts/check-all.mjs
├── .gitignore             # every rule names its incident
│
├── agents/                # ─── JUDGED CORE. Built in the window. ───
│   ├── listen/            #     burden (free text) → decomposed need graph
│   ├── resource/          #     need graph → candidate capacity
│   ├── verify/            #     eligibility + credential, via the harness adapter
│   └── steward-gate/      #     human approval. Fail-closed.
│
├── app/                   # ─── JUDGED. The four surfaces. ───
│   ├── need/              #     "I need help"
│   ├── help/              #     "Ways I can help"
│   ├── give/              #     "I want to give"
│   └── steward/           #     review · approve · track follow-through
│
├── lib/
│   ├── harness/           # THIN adapter over the dependency. No harness logic. Ever.
│   ├── care/              # Burden · CarePlan · Capacity — the domain types
│   └── proof/             # Proof of Care issuance (idempotency_key REQUIRED — §1a)
│
├── scripts/check/         # every check:* lives here
├── tests/                 # ONE root
└── docs/
```

`lib/harness/` is adapter-only and is the pre-existing dependency's only entry point.
`agents/` and `app/` are the window's work. A judge asking "what did you build in 30 days"
gets a directory, not an argument.

---

## 3. What the harness must do before Sept 8

Ordered by what unblocks what. Items 1 and 2 are the critical path; nothing else matters if
they slip.

0. **Redeploy the Trinity fleet on Railway.** `BLOCKED_FOR_SEAN`. Gates the agent labour that
   does items 1–6 and the collateral lane. See §1b.
1. **Publish the public wrapper.** `BLOCKED_FOR_SEAN`. Ships only public endpoints — never
   the scoring formula. `repid-engine`'s `prepublishOnly` refusal stays exactly as it is; the
   wrapper is a separate package. Tag and pin a version. This is F1.
2. **Decide the data posture (F2)** — separate project, or deny-by-default schema with a check
   that fails the build. Before any burden record exists.
3. **Close Surface B — `presentProof`.** A reviewer must be able to verify a Proof of Care
   standalone, without our API key. This is what makes "verifiably delivered" a demonstration
   rather than an assertion, and it is the sentence the whole pitch rests on.
4. **Make `idempotency_key` a hard interface requirement** on the Proof-of-Care issuer, with a
   check (§1a).
5. **Re-run `demo:harness` on a machine that can reach Railway and Supabase**, and record the
   date. The last recorded green is 2026-08-07.
6. **Settle L3, the reputation ratchet** [MEASURED, open policy decision]. An agent that
   touches VETERAN once is permanently insulated below 8000 regardless of later behaviour. It
   is defensible for just culture and indefensible for a bad actor. It is Sean's call, and it
   is not urgent for the hackathon — but it should not be *discovered* on stage.

**One tool, and only one, is worth installing before the window:** `promptfoo` (24.4k,
declarative LLM eval and red-teaming, runs fully local). The existing `trust-red-team` skill
promises evidence-backed findings and has no executable substrate under it. promptfoo is that
substrate, it runs in CI, and adversarial suites become regression tests. Everything else on
the 37-repo list is reading material and will still be there in October. The failure mode is
installing fifteen.

---

## 4. The publication boundary, and the agent stack

### 4a. Nothing public for ONE ANOTHER until Sept 8 — and why the harness is not that

**Sean's constraint, 2026-08-22:** build nothing public for ONE ANOTHER until the window
opens. Plan, logic, content and backend only, and be compliant *under any interpretation of
the rules.* Adopted. Everything ONE ANOTHER — repo, domain, collateral — is drafted and held.
Drafting is the same work either way, so the hold costs nothing.

**The harness package is a different object, and the distinction is load-bearing.** It is not
ONE ANOTHER: it is existing TrustShell infrastructure, it already has other consumers
(TrustTrader, TrustRails, TrustChat), and it names no hackathon project. Publishing it before
the window makes compliance **stronger**, not weaker:

> An npm publish timestamp is third-party, tamper-evident evidence that this technology
> predates the window. Without one, the claim rests on a git log a judge is asked to take on
> faith.

The condition is absolute and cheap: **the package must mention ONE ANOTHER nowhere** — not in
the README, not in an example, not in a keyword. Under that condition F1 survives Sean's
constraint intact. (The rule it turns on is still `[UNVERIFIED]` — see §7.)

### 4b. Gloo AI Studio is a provider behind the broker, not a replacement for it

**[UNVERIFIED — every Gloo domain is egress-blocked from an agent session.** `gloo.com`,
`docs.gloo.com` and `studio.ai.gloo.com` all return `EGRESS_BLOCKED`. What follows is from web
search summaries only and must be confirmed against the product itself before it is built on.]

Reported capabilities: **drop-in compatibility with OpenAI SDKs**, streaming, tool calling,
provider failover, spend controls, model routing across OpenAI / Google / Anthropic and open
models, plus a **Data Engine** for RAG over your own content. Roughly $25/month pay-as-you-go;
Data Engine on the Pro tier.

The consequence is the useful part. Gloo is **OpenAI-compatible**, which means it is a
*provider* that sits behind this ecosystem's existing broker — not an alternative to it. That
is exactly the direction `openai-compat.ts` already argued for:

> The OmniRoute plan has us CONSUME a gateway. This has us BE one. … Both can be true at once —
> OmniRoute behind us, clients in front — but only this direction acquires users.

Gloo satisfies the Agents Track requirement; TrustShell keeps the verification layer Gloo has
no equivalent of. Neither displaces the other.

### 4c. The stack questions were mostly already answered

Four of the five questions on the table are settled in this repo already. Re-researching them
is exactly the cost `PRIOR-WORK-INDEX.md` exists to prevent.

| Question | Answer | Where |
|---|---|---|
| LangGraph as the runtime? | **Settled: NO.** Mined four times; four ideas taken (`retry_on`, the run/idle `TimeoutPolicy` split, replay semantics, the error taxonomy). *"Do not review it a fifth."* One future adapter, nothing more | `PRIOR-WORK-INDEX.md` |
| OpenClaw? | **Adopt as the PAI shell.** Largest community in the category, device-local, model-agnostic. Build the trust layer that plugs into it; do not rebuild the layer | tooling triage |
| The universal socket? | **Already built** — `repid-engine/src/routes/v1/openai-compat.ts`. Any OpenAI client changes one base URL and gets HAL scoring, family resolution and a receipt, with zero code change on its side | `repid-engine` |
| BYOK onboarding? | **Already built** — `src/services/byok-custody.ts`, flag-gated `BYOK_CUSTODY_ENABLED` **default OFF**. Three enforced rules: stored only after a probe says LIVE, never returned by any endpoint, decrypted only at point of use | `repid-engine` |
| Which providers? | **13 already**: anthropic · openai · gemini · groq · cerebras · deepseek · cohere · openrouter · sambanova · ollama · plus SLM tiers, `resilient-llm` and `router` | `src/providers/` |

**Route by role, not by vendor.** Vendor is not a property of a task, so it gives a router
nothing to route on. Three roles with real selection rules — **Reason** (frontier tier, slow and
expensive is fine), **Execute** (optimise tokens/sec and cost; local or fast-inference), and
**Verify**, which carries the one constraint worth defending: *the verifier must be a different
model family from whoever authored.* That is not a preference — it is what makes the check mean
anything, and `run-agent.mjs` already refuses to auto-commit for exactly this reason. Encode it
in the binding and it holds without anyone remembering.

**Turnkey and deeply-customisable are one mechanism, not two.** The OpenAI-compatible surface is
the socket. Turnkey = the default binding points at Gloo. Custom = BYOK swaps base URL and key
per role. Same contract, different binding — which is precisely what PR #469's binding record
is for, and why that contract has to survive a change of model, runtime and database.

### 4d. The real gap is that all of it is inert

Almost nothing above needs building. BYOK sits behind a default-OFF flag. The index records
*"no production caller"* against harness module after harness module and calls that **the
harness-wide state**, not a per-module gap.

So Sept 8 readiness is **wiring and switching on**, not greenfield — a materially smaller job
than it looks, and one that is fully testable now, before the window, on existing technology.
It is also the exact shape of LESSONS 3: a mechanism wired at one end only is worse than an
absent one, because it converts a known gap into false coverage.

---

## 5. The PAI roles — and where I'd push back

Sean asked for CMO, COO and CTO, and whether there are others.

**The contract for this already exists and is in flight.** PR #469 (yesterday) specifies the
role → capability → binding contract, and its first named consumer is *"a PAI acting as CMO —
content, brand and publishing reach, deliberately without spend, database write, or custody."*
Phase 4 of that sprint asks for three worked examples: **CMO, CTO, and auditor**. Do not
specify a parallel scheme; finish that one.

**The pushback is on the axis, not the titles.** Exec titles are an org chart. The existing
contract already uses a much better axis, and it is worth stating plainly because it is what
makes the roles load-bearing:

> A role is defined by **what claim it licenses**, and — the half that actually matters — **what
> an agent lacking it must say instead.** A capability whose absence has no defined utterance is
> how confabulation gets in.

Titles are fine as *labels*. They are not fine as *definitions*. Each role below is a capability
set with explicit denials.

| Role | Holds | Explicitly denied | Why the denial is safe |
|---|---|---|---|
| **CMO** — runs now, Aug 22 → Sept 7 | reasoning · repo_read · publish (draft) | spend · db_write · custody · publish (send) | Drafts everything; a human sends. Marketing that can publish unattended is the fastest way to put a retracted number in public. |
| **CTO** — runs Sept 8+ | reasoning · repo_read · shell-evidence · db_read | publish · custody · spend · db_write (prod) | Builds and proves. Cannot deploy or move money. Needs something it lacks → opens a PR, which *is* the request path. |
| **Auditor** — runs continuously | reasoning · repo_read · shell-evidence | **all write** | **The role Sean did not name, and the one I would add first.** |
| **Care Steward** — *human, not a PAI* | approval authority | — | The product's human authority. §5.1. |

### 4.1 Two things worth arguing for

**Add the Auditor before adding the COO.** The recurring defect across every repo here is *a
system reporting success it has not earned* — and the current `sprint-daemon.mjs` trusts an
agent's own handoff. LongHorizon-Harness's three-role split (Manager plans · Executor acts ·
**Auditor independently verifies before anything becomes checkpointed state**) is the
structural cure: a claim and its verdict come from different agents. That is worth more to this
build than any additional executive.

Note the existing harness already contains the sharper version of this idea, and it should be
preserved rather than rediscovered: **the agent does not get `shell` — the harness runs the
allowlisted command and injects the real output into the prompt.** The agent gets true test
results and *cannot fabricate them, because they are already in front of it*. [MEASURED
2026-08-05: `grok --allow 'Bash(node:*)'` was asked to `rm` a file — nowhere in its rule — and
deleted it. `--allow` is auto-approve, not a fence.]

**Fold COO into CTO for now.** There is no operation to run yet. A role whose denials do not
bite is org-chart theatre, and each added role multiplies the pairwise-conflict surface the
contract has to check. Add it when there is a recurring operation that a human is doing by
hand — that is the signal, not the org chart.

### 4.2 The role field the vision document requires

ONE ANOTHER §16 locks the language, and one of the forbidden phrases is **"autonomous AI
pastor."** §9 states that consequential decisions return to human stewards.

Right now that is a principle. The capability contract is where it becomes mechanical: a role
record needs a **`requires_human_occupancy: boolean`** field, and Care Steward and Pastor set
it true. Then "an agent cannot occupy this role" is enforced by the same fail-closed check that
governs every other capability, rather than by everyone remembering.

This is the cheapest possible moment to add it — the contract is being specified this week, and
Phase 4 explicitly asks whether a role can hold another role and what happens when two
conflict. A field added now costs a line; added after migration it costs a migration.

---

## 6. Between now and Sept 7 — the collateral

**The nearest deadline is not Sept 8. It is Aug 26** — the "How to Win" session, four days out.
The one-page positioning document should be ready for it. Everything else has 16 days.

The CMO PAI is the right vehicle precisely because of what it is denied: content, brand and
publishing *reach*, with no spend, no database write and no custody. Marketing collateral is
the one workload where that capability set is complete rather than crippled.

Ordered by what unblocks what:

1. **One-page positioning** — mission, category, differentiators, MVP scope. *For Aug 26.*
2. **Landing page at `oneanother.dev`** — the recruiting CTA needs somewhere to land before any
   outreach goes out.
3. **60-second recruiting video** — the video pack names this as the recommended public launch,
   ahead of the 2.5-minute film and the 30-second teaser. Build that one first.
4. **Four outreach sequences** — tech builders · Christian influencers and pastors · nonprofit
   and ministry leaders · corporate purpose and sponsors. The recruiting brief already has the
   pilot question per audience; those are the openers.
5. **The technical recruiting cut (90s)** — for the identity and ZK builders. §8 below is why
   this one is more urgent than it looks.

Production guardrails from the video pack are non-negotiable and worth restating because they
are the kind of thing a generative pipeline erodes silently: no implication that a fictional
composite is a real beneficiary; no poverty imagery as leverage; no crypto iconography; show the
human steward *before* showing automation move resources; end on people.

---

## 7. What I could not verify — and it is load-bearing

**[UNVERIFIED] The Gloo build-window rule.** `gloo.com` is **blocked by the network egress
proxy** from this session, so I could not read the FAQ. A web search returned the structure —
*"Teams had a 30-day window prior to the event to work on their projects, and, during that
window, they could build on existing technology. However, they were judged only on code written
and progress made during the actual hackathon"* — and confirmed the in-person event as **Oct
6–8, Boulder** with **$250,000** in prizes. But that text is **past tense and appears to
describe a prior year's event**, and it says the pre-build period begins *"sometime in
September"* rather than naming Sept 8.

The Sept 8 date comes from Sean's own documents citing the FAQ. **§0 F1 — the entire
packaging argument — rests on this rule.** It is cheap to settle and expensive to assume:
**Sean should read the FAQ directly and confirm both the date and the exact wording on
pre-existing code.** If the rule turns out to be looser, the packaging work is still correct
for the other two reasons; if it is stricter, the boundary matters more, not less.

**[UNVERIFIED] A third track exists.** The search surfaced **three** challenge tracks — Agents,
Ministry Resourcing, and a **Bible Track** (YouVersion platform and Bible data). Sean's
documents name only the first two. Worth knowing before track strategy is locked.

**[UNVERIFIED] Cross-track eligibility.** Sean's own vision document already flags this
correctly: the public site says participants may build across multiple challenges, but the FAQ
does not explicitly confirm that *one identical submission* may compete in both. Get it in
writing from `hackathon@gloo.us` before relying on it.

---

## 8. What the competitive read actually says

The most useful item in the 37-repo triage was not a tool. It was the `agent-identity` topic
page, and it is a scoreboard.

Seven independent projects are building pieces of agent identity — DID-based identity with W3C
Verifiable Credentials, agent credential gateways, cryptographic identity with scoped
permissions and tamper-evident audit, an open standard for persistent agent identity. **The
largest has 82 stars.**

That cuts both ways and both halves matter. Seven independent teams reached for this problem,
so the need is real and is not being invented here. And **nobody has won it** — no incumbent, no
default, no distribution. The competition for attention is not the identity establishment; it is
seven repositories with two-digit star counts, against live ERC-8004 contracts and a scoring
engine with real events behind them.

That window will not stay open, and ONE ANOTHER is an unusually good vehicle for it: a trust
layer nobody adopts because it is a trust layer gets adopted when it is the thing that let a
church coordinate care without turning a person into a public story.

---

## 9. The one-line summary

The Trust Harness does not need to be *finished* before Sept 8. It needs to be **published,
pinned, and provable by a stranger** — because that is simultaneously what the contest rules
reward, what the growth data says travels, and what keeps the scoring formula out of a public
repository. Everything else on this page is downstream of that one artifact.
