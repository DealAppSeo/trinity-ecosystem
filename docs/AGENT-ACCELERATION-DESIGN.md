# Agent acceleration design — PAI, loadouts, and the accelerator ledger

**Status:** DESIGN, written 2026-09-03. This is a plan, not a measurement. Every
number quoted for an *existing* mechanism is dated and traced to where it was
measured; every number for a *proposed* one is written `UNMEASURED` beside the one
cheap measurement that would size it. Per this repo's founding lesson —
**measure the ceiling before optimising toward it** — no proposal below is
approved for building by appearing here. It is approved for *measuring*.

**What this answers.** Three questions Sean raised together:

1. When a user signs up and creates an agent, they get **one PAI** — the agent
   that can create more agents and holds the most access. How is that access
   granted, delegated to the children, and bounded?
2. Can skills be **readily available without every MCP / plugin / service / skill
   being installed at once** — so a CMO agent carries marketing/social/creative
   loadout and not finance, a CFO carries finance and not legal, a CLO legal?
3. What **acceleration techniques** — borrowing from video games, routing /
   compression, and known formulas — could raise performance, and which pay?

**CMO is the worked example throughout.** Where a mechanism needs a concrete
agent to make it legible, it is a Chief Marketing Officer PAI, contrasted with
CFO and CLO on the axes where they differ.

**The one fence stated up front.** Top-1 expert routing is **CLOSED at 98.16% of
the omniscient bound** (24 paired seeds — CLOSED table, Sprints L/X). The prize
left for any router / scheduler / capacity change is **1.84pp**. CLAUDE.md opens
on the two-sprint cost of optimising a component already at its bound because
nobody had measured the bound; the router is that component. **No accelerator
below is a re-skin of top-1 routing**, and the two that look like routing
(speedrun-memoisation, hierarchical) are scoped to *latency* and *sub-task
granularity*, which are different ceilings, and are marked so.

---

## 1. The identity spine: Principal → PAI → child

The PAI is not a super-user. It is the **root of a delegation chain that only ever
narrows**, and every link is checked mechanically rather than trusted to the
delegator behaving. The mechanism exists today.

```
   Human (Principal)                 ControlProof terminates the chain at a human
        │                            (identity/control-proof.ts). No agent is a root.
        ▼
   PAI  ── holds the WIDEST grant a human ever signs for this account.
        │   Can mint children and skills. Still not a master credential:
        │   its authority is a set of capability NAMES with expiries, never
        │   a wallet, token, or key (capability.ts header).
        ├──────────────┬──────────────┐
        ▼              ▼              ▼
   CMO child       CFO child      CLO child     depth 1
        │
        ├────────────┐
        ▼            ▼
   "draft a post"  "schedule"                    depth 2  (a worker the CMO spawns)
        │
        ▼
   one-shot tool call                            depth 3
```

**Four things attenuate at every link** (`identity/delegation.ts`, the ONE RULE:
authority only ever narrows):

1. **capabilities** — child ⊆ parent, wildcard-aware (`capability.ts`
   `isSubCapability`; `attenuate` refuses to widen: `fs.write` → `fs.write.scratch`
   is allowed, the reverse is rejected).
2. **audience** — a chain is minted for one verifier; a link cannot retarget it.
3. **time** — `child.expiresAt <= parent.expiresAt`. This is the one people
   forget, and it is load-bearing: expiry is the *only* revocation this system
   has (no revocation registry, by design — `did.ts`), so a child that could
   outlive its parent could never be revoked.
4. **start** — `child.notBefore >= parent.notBefore`.

**Subject continuity** is checked too: each link's delegator must be the principal
the previous link authorised, so a chain cannot be a pile of individually-valid
signatures assembled by someone who was never granted the middle link.

**Depth is bounded:** `MAX_DELEGATION_DEPTH = 4` (`delegation.ts:58`), enforced at
verification (`delegation.ts:249`). Not tidiness — verification is linear in depth
and the whole chain arrives from whoever presents it, so an unbounded chain is a
cheap way to make a verifier do unbounded work. Four links is past any real
supervisor → worker → helper shape.

> **STATUS [BUILT].** `capability.ts` (mint / attenuate / TTL), `delegation.ts`
> (the four-axis attenuating chain + depth cap + subject continuity),
> `control-proof.ts` (human root), `harness-bundle.ts` (the portable "what the
> agent IS" envelope). This is the substrate the rest of the doc composes; it is
> the one part that is not a proposal.

**What this buys the PAI story.** "The PAI has the most access" is expressible
*without* a god-key: the PAI holds a broad capability set with a human ControlProof
at its root, and every agent it spawns gets a **strict subset** with a **shorter
life**. A compromised CMO child can spend down exactly the marketing capabilities
it was handed, until they expire — never the CFO's payment rail, because that
capability was never in its parent chain to attenuate from.

**Granting T12 agents their own delegated access** (Sean's follow-on ask) is the
same mechanism one level out: the operator signs a ControlProof for a T12 lane
PAI; that PAI attenuates to its workers. No new primitive — it is delegation with
the human root being the operator rather than an end user. The Railway/token
grant lands as a **capability name** in that chain (`infra.railway.deploy`, TTL'd),
never as the raw token in an agent's context — which is exactly the
"root credentials never enter agent/model context" rule the capability header
already states.

---

## 2. Loadouts: skills available without installing everything

The ask — CMO gets marketing/creative/social skills ready but not finance — is a
**progressive-disclosure** problem, not an install problem. The answer is that a
skill is *addressable and pinned* long before it is *loaded*, and a role
**loadout** is a curated, reputation-gated manifest of which skills a given PAI
may pull.

### 2.1 The three tiers (borrowing fog-of-war: reveal on approach, not up front)

| tier | what is resident | when it materialises | cost |
|---|---|---|---|
| **L1 — descriptor** | skill *name + content hash* only (`SkillEntry{name, contentHash}`, `harness-bundle.ts`) | always, for every skill in the loadout | bytes |
| **L2 — logic** | the skill's callable definition (its tools, its prompt) | when the router judges the skill *relevant to the task in hand* | a fetch + a hash-check against L1 |
| **L3 — heavy assets** | large corpora, model weights, brand kits, embeddings | at point of use inside L2, never before | the asset transfer, paid once per task |

The pin is what makes this safe: L1 carries the **content hash**, so when L2
materialises it is verified against the hash the loadout was signed with. A
manifest that listed skill *names* without hashes would let the skill be swapped
after the harness is trusted — the exact `SkillScan` concern the bundle header
calls out. **The hashing is [BUILT]** (`SkillEntry`); the tiered *fetch-on-relevance*
loader is [DESIGNED] in `docs/TRUSTHARNESS-STRATEGY.md` (JIT progressive
disclosure) and not yet a running loader.

### 2.2 Loadouts as class-kits (borrowing the RPG class kit)

A **loadout** is a named, signed set of L1 descriptors a PAI is entitled to. It is
not code the PAI runs; it is the *fog map* of what the PAI can reveal.

- **CMO loadout:** `content.longform`, `content.social`, `seo.audit`,
  `creative.image`, `analytics.web`, `campaign.schedule`, plus the marketing MCPs
  (e.g. an AEO/brand-kit connector). **Not** in the map: `pay.usdc`, `ledger.close`,
  `legal.review`.
- **CFO loadout:** `pay.*`, `ledger.*`, `forecast.*`, `treasury.read`. **Not**
  `content.*`, `legal.review`.
- **CLO loadout:** `legal.review`, `contract.redline`, `compliance.check`. **Not**
  `pay.*`, `content.social`.

The loadout is enforced *twice*, and the redundancy is deliberate:

1. **At disclosure** — a skill not in the CMO's loadout has no L1 descriptor, so
   the CMO's router never even sees it as an option (fog-of-war: you cannot route
   to a room you cannot see).
2. **At execution** — even a disclosed skill only runs if a live capability grant
   covers it (kernel policy is default-deny, `kernel/policy.ts`). The loadout says
   "you may know about `content.social`"; the *grant* says "you may exercise it,
   until 14:03Z". The first is visibility, the second is authority; a design that
   collapsed them would let visibility imply permission.

> **STATUS [proposal, cheap].** The pinning and the default-deny gate are BUILT;
> the *role-bundle manifest* + the loader that reads it are the new, small piece.
> **Ceiling UNMEASURED.** The one cheap measurement that sizes it: take a real CMO
> task and compare context/latency with the *full* skill catalogue resident vs a
> role loadout of ~6 skills. If the full catalogue is already cheap to carry, the
> loadout is a safety/clarity win, not a speed one — and it should be sold as that,
> not as an unearned latency number.

---

## 3. The accelerator ledger

Ranked by **honest expected payoff ÷ cost**, most-pays-first. Game/algorithm
lineage named because Sean asked for it, but the tag and the ceiling are what
decide whether to build. **A [proposal] / [research bet] ceiling is UNMEASURED by
definition** — the "measure first" column is the deliverable that turns it into a
decision.

| # | accelerator | lineage | grounding | status | honest ceiling | measure first |
|---|---|---|---|---|---|---|
| 1 | **Semantic caching** — a near-duplicate ask returns the prior verified answer instead of re-running the panel | memoisation / CDN edge cache | none built | **[proposal, high-value]** | UNMEASURED, and could be the biggest real win *because* the fleet repeats work | near-duplicate rate in `llm_call_log` over 30d: what fraction of asks are ~identical to a prior one? That fraction is the ceiling. |
| 2 | **Role loadouts + L1/L2/L3 disclosure** (§2) | class kit + fog-of-war | `harness-bundle.ts` `SkillEntry` (pin BUILT) | **[proposal, cheap]** / loader [DESIGNED] | UNMEASURED — context & latency saved by not carrying the whole catalogue | full-catalogue vs 6-skill-loadout context+latency on one CMO task |
| 3 | **Speedrun memoisation** — cache `task-signature → chosen expert + plan`, skip the *decision*, not the work | speedrun route-memorisation | `harness/router.ts` (decision path) | **[proposal, cheap]** | LATENCY only — top-1 *quality* is CLOSED (1.84pp left); this saves the recompute, not the route | router decision latency as a share of end-to-end; if it's noise, don't build |
| 4 | **Sub-task routing granularity** — route per sub-step, not per task | — | router, Sprint Z4 | **[priced, Sean-gated]** | **+3.11pp at specialisation spread 0.10; +10.57pp at 0.20** (24 seeds, Sprint Z4) — the one large routing prize left, and it is *not* top-1 | the fleet's actual specialisation spread, which needs the **task key** on `repid_score_events` (OPEN, Sean/DDL). Blocked there, not here. |
| 5 | **Cooldowns + aggro** — rate-limit a hot provider, shed load off a failing one | ability cooldown / aggro table | `harness/leaky-bucket.ts`, `harness/circuit-breaker.ts` | **[BUILT]** | already shipping; the win is tail-latency & blast-radius, not top-line quality | — (wired; keep it wired) |
| 6 | **Save-points / respawn** — checkpoint a session so a crashed or handed-off agent resumes instead of restarting | checkpoint + respawn | `identity/handoff.ts` | **[BUILT primitive, UNWIRED]** | crypto to sign/verify a handoff artifact is built; it has **no live caller in `app/`** (OPEN table) — its home is the agent runtime, not a Next.js route | before wiring: confirm a real handoff path exists to call it, so we don't ship a caller for a table nobody writes (the recurring shape here) |
| 7 | **Fog-of-war memory** — recall only the context relevant to the task, not the whole history | fog-of-war | `MemoryRecall.ts` | **[BUILT]** | already shipping; composes directly with the L1/L2/L3 loadout | — |
| 8 | **XP → tier ladder** — earned reputation unlocks capability tiers | skill tree / XP | `EarnedMetrics.ts`, `repid-scoring.ts` `TIER_FLOORS` | **[BUILT]** | already the reputation curve. **Caveat, not new:** a flawless agent scores 4008 and the payment gate is 5000 — the curve's max sits below the threshold it feeds (OPEN table). Fix the ceiling before leaning harder on tiers. | — (the ceiling bug is the open item, not the ladder) |
| 9 | **Speculative execution** — pre-run the *likely* next step while the current one verifies | branch prediction / speculative exec | none built | **[research bet, high-value]** | UNMEASURED; real wasted-work risk if the branch is wrong; pays only if next-step is predictable AND idle capacity exists | branch predictability: given step N, how often is step N+1 the same across similar tasks? Below ~70% the wasted work likely eats the win. |
| 10 | **Content-addressed capability store** — dedupe identical grants/plans by hash | content-addressed storage (git/IPFS) | `capability.ts` `nonce`, evidence `integrityHash` | **[proposal]** | UNMEASURED, likely small; mostly an audit/dedup tidiness win | grant/plan duplication rate; probably not worth it alone |
| 11 | **Bandit expert selection** — Thompson / UCB to explore new experts | multi-armed bandit | adoption simulator | **[research bet, low-value here]** | SMALL: post-join adoption gap is **0.45pp**, of which **0.18pp is irreducible** (Thompson sampling cannot beat it) — CLOSED, Sprint Y | already measured; the ceiling is why this is low-value, not a reason to remeasure |
| 12 | **Elo / TrueSkill pairwise ranking** | ranked ladder MMR | — | **[proposal, low-value]** | per-domain reputation was priced at **+1.64pp** volume-weighted and **declined** as not worth rekeying the ledger (CLOSED, Sprint V) | — (the cheaper alternative named in Sprint V stands) |

**Reading the ledger.** The money is at the top and it is *not* routing: **semantic
caching** (#1) and **loadouts** (#2) are provisioning/compression wins on a fleet
whose defining property is that it repeats work. Routing-shaped ideas (#3, #4,
#11, #12) are either latency-only, Sean-gated on the task key, or already measured
small — because top-1 routing is closed. The BUILT rows (#5–#8) are there to be
*kept wired and composed*, and #8 carries an open ceiling bug worth more than most
of the proposals.

---

## 4. CMO, end to end (the worked example)

A founder signs up, answers the constitution interview, and creates a **CMO PAI**.

1. **Root grant.** The human signs one ControlProof. The CMO PAI receives a broad
   marketing capability set (`content.*`, `seo.*`, `creative.*`, `analytics.web`,
   `campaign.schedule`) with an expiry. `pay.*` and `legal.*` are simply not in it,
   so nothing downstream can attenuate them into being.
2. **Loadout resident.** The CMO's L1 map holds ~6 marketing skill descriptors,
   each pinned by content hash. The finance and legal skills have no descriptor in
   this map — the CMO's router cannot see them (fog-of-war).
3. **A task arrives:** "draft and schedule this week's launch thread."
   - **Semantic cache check (#1):** is this ~identical to a verified prior task?
     If yes, return that answer; done. (This is the accelerator that pays most,
     and it runs first.)
   - **Relevance disclosure (§2.1):** the router judges `content.social` and
     `campaign.schedule` relevant → their L2 logic materialises and is hash-checked
     against L1. `seo.audit` stays at L1 (not relevant this task).
   - **Speedrun memo (#3):** if this task-signature was routed before, reuse the
     expert+plan decision; skip the recompute, re-verify the work fresh.
4. **Spawn a worker** (depth 2): the CMO attenuates `content.social` (write draft)
   to a one-shot child with a 10-minute TTL. The child cannot schedule, cannot
   outlive the parent, cannot retarget to another verifier.
5. **Execute under default-deny:** the file/post side-effect runs only because a
   live grant covers `content.social`; a Trust Receipt is minted; a canonical
   evidence row is appended (append-only, `evidence/canonical-evidence.ts`).
6. **Earn (#8):** *if* an independent checker verifies the work, the verdict path
   — never the CMO itself — produces a reputation event
   (`reputation-event-producer.ts`, no-self-report guard). The CMO's tier is
   computed at read time by a Trust Lens; it is never a baked score.

**Where CFO and CLO differ:** only steps 1–2. A CFO PAI's root grant carries
`pay.*`/`ledger.*` and its loadout resident is finance skills; a CLO's is
`legal.review`/`contract.redline`. Steps 3–6 — cache, disclose-on-relevance,
attenuate-to-worker, gate, earn — are **identical machinery**. That sameness is
the point: roles differ by *loadout and root grant*, not by a fork of the runtime.

---

## 5. Fences — what NOT to build without a measurement or Sean's call

- **Do not optimise top-1 routing.** 98.16% of bound; 1.84pp left; this is the
  CLAUDE.md-opening trap. Sub-task granularity (#4) is the exception and it is
  Sean-gated on the task key.
- **Do not ship a proposal's ceiling as if measured.** Every UNMEASURED row above
  gets its "measure first" done before a build estimate is quoted.
- **Do not wire `handoff.ts` (#6) to a table nobody writes.** Confirm a live
  handoff path first — the repo's recurring defect is a caller built for a dead
  end.
- **Do not let loadout visibility imply permission.** Disclosure (L1 map) and
  authority (a live grant) stay two checks; collapsing them is a privilege bug.
- **Loadout / delegation vocabulary changes** that touch a leaf schema another
  lane's circuit consumes are not unilateral — same standing rule as Poseidon2.

---

## 6. What to measure first (the sizing sprint, in cost order)

1. **Near-duplicate rate in `llm_call_log`** (#1) — one query, and it decides
   whether semantic caching is the top prize or a rounding error.
2. **Full-catalogue vs role-loadout context+latency** on one real CMO task (#2) —
   sizes both the loadout and the disclosure loader.
3. **Router decision latency as a share of end-to-end** (#3) — decides whether
   speedrun memoisation is worth a line of code.
4. **Branch predictability across similar tasks** (#9) — the gate on whether
   speculative execution can pay at all.

Only #1–#4 are worth an hour before any build. #5–#8 are built; keep them wired.
#4 (sub-task routing), #11, #12 are already measured or already gated — do not
re-derive them.

---

_Grounding files (all read 2026-09-03): `lib/trustshell/runtime/capability.ts`,
`lib/trustshell/identity/delegation.ts`, `lib/trustshell/identity/harness-bundle.ts`,
`lib/trustshell/harness/{leaky-bucket,circuit-breaker,router}.ts`,
`lib/trustshell/{MemoryRecall,EarnedMetrics,repid-scoring}.ts`,
`lib/trustshell/identity/handoff.ts`,
`lib/trustshell/evidence/canonical-evidence.ts`,
`lib/trustshell/identity/reputation-event-producer.ts`. Routing/adoption/per-domain
figures from the CLOSED/OPEN tables of this index (Sprints L, X, Y, V, Z4); no
RETRACTED figure is cited._
