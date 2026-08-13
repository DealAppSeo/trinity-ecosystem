# Agent memory for the RepID harness

What TencentDB Agent Memory does, what of it is worth taking, and what Trinity's
memory actually looks like when you measure it instead of counting rows.

Companion to `docs/HARNESS-SPEC.md` (the six-dimension harness) and
`docs/TRUSTSHELL-V1.md` (receipts). This file covers the **memory** dimension
only.

---

## 1. The finding that reorders everything else

Trinity does not have a memory problem. It has a **recall** problem.

Measured live 2026-08-13, now permanently queryable as
`v_memory_recall_readiness` (additive view, changelog #117):

| corpus | rows | retrievable | **ever read** | duplicate rows | orphan owner ids |
|---|---:|---:|---:|---:|---:|
| `agent_memory_nodes` | 429 | 213 | **0** | 124 | **34** |
| `agent_learning_events` | 429 | 0 | **0** | 99 | 0 |
| `trinity_learned_patterns` | 215 | 0 | **0** | 163 | 0 |
| `trinity_skills` | 14 | 0 | **0** | 0 | 0 |

`access_count > 0` matches **zero** of 429 memory nodes. `last_used_at` is null
on all 14 skills. Three months of writes, not one read.

The corpus itself is fine — average content length 134–278 characters, only 17
rows under 30 characters and 10 test-ish out of 429. Real material, written
faithfully, never once retrieved.

Four defects block a read path, ranked by what blocks what:

1. **Identity is broken.** All 34 distinct `agent_memory_nodes.agent_id` values
   resolve to no row in `agents`, `trinity_agents`, `agent_kya_registry` *or*
   `conductor_state`. You cannot scope recall to an agent when the ownership key
   points nowhere. Everything else waits on this.
2. **Half the corpus is unreachable.** 213 of 429 nodes carry an embedding; 0 of
   215 patterns do, despite having the column. A vector search today silently
   misses 50% and 100% respectively — and returns a short list indistinguishable
   from an honest miss.
3. **Nothing links a memory to an outcome.** So reuse credit could only ever
   count retrievals.
4. **No dedup ran.** 429 nodes → 305 distinct contents. 429 events → 330
   distinct lessons. 215 patterns → **52** distinct insights (76% duplication).

A fifth, structural: **13 of 22 memory tables are empty**, including the entire
`memory_warm` / `memory_cold` / `memory_glacier` tier system. And
`trinity_learned_patterns` exists **twice** — `public` (has `embedding`, no
reuse counter) and `private` (has `times_reused`, `verified_by`, no embedding).
Two complementary halves of one table, split across schemas, both wrong alone.

This is the house defect from `CLAUDE.md` in a new component: a system reporting
success it has not earned. "429 memories" is true and means nothing.

---

## 2. What TencentDB Agent Memory actually is

MIT, Node ≥22, three services: **MemoryCore** (the pipeline and stores),
**MemoryHub/Panel** (human control plane), **MemoryProxy** (sits in front of
Claude Code / CodeBuddy and injects on the way in, extracts on the way out).
Claimed benchmark: PersonaMem 48% → 76%.

Five ideas carry the design.

**L0→L3 layered distillation.** Raw conversation (L0) is refined asynchronously
into atoms (L1: facts, preferences, constraints), scenarios (L2: knowledge
blocks per project), and persona (L3: stable long-term profile). Retrieval is
layered to match — L2/L3 give a cheap context bootstrap; L1/L0 are fallen back
to only when a specific fact is needed.

**Memory as governed asset, not chat log.** One `meta_assets` table carries
`confidence`, `usage_count`, `last_used_at`, `version`, `status`, `visibility`,
`expires_at` for every asset type. Visibility is `private` / `team` /
`restricted` / `agent`, with private the default and sharing an explicit act.

**Agent loadout.** `meta_agent_fixed_assets` binds assets to agents with an
`injection_mode` (`direct` / `summary` / `tool` / `reference`) and a `priority`.
Different roles get different loadouts; switching frameworks is re-equipping,
not retraining.

**Hybrid retrieval with RRF.** BM25 and vector results merged by reciprocal rank
fusion at k=60, then capped by item count, character budget and timeout. The
injected prompt also caps the agent at **3 memory searches per turn**.

**Three-tier degradation on the write side too.** Dedup recalls candidates by
vector, falls back to BM25, and if neither index exists skips conflict detection
entirely rather than paying an O(N) scan. Decisions are `store` / `update` /
`merge` / `skip`.

### What is worth taking

RRF at k=60; the item/char/timeout budget triple; the 3-searches-per-turn
ceiling; the tiered degradation; the four-verb dedup vocabulary; the asset
lifecycle fields; loadout-with-injection-mode; private-by-default visibility.
All of it is implemented in `lib/trustshell/MemoryRecall.ts`.

### What is deliberately **not** taken

**Their write-side gate is permissive when unconfigured.** `extraction-gate.ts`
returns `true` for a missing config block, a missing `extractors` field, or a
non-array — documented as "so a partial or misconfigured yaml never silently
disables writes." Reasonable for a product preserving backwards compatibility.
Wrong here: this harness's whole premise is that absence of evidence resolves to
least privilege. `memory.extraction_assets` therefore defaults to `[]` — deny —
and `check-memory-recall.mjs` fails if anyone "fixes" that.

**`usage_count` is a popularity counter.** It increments on retrieval. Rank on
it and a memory recalled constantly and wrong every time outranks one recalled
twice and right both times — and being retrieved makes a memory more
retrievable, with no reference to whether it helped. For a system where
capability is *earned*, that is the wrong signal at the root.
`utilityScore()` replaces it with a net of good and bad outcomes; a harmful
memory scores **below an unproven one**, which is asserted in the test suite.

**The whole three-service deployment.** Trinity already has pgvector, a memory
corpus, and twelve Railway services. Standing up MemoryCore + Hub + Proxy would
be a second memory system beside an unread first one. Take the ideas, not the
containers.

---

## 3. Memory as an earned harness dimension

The upstream design has no notion of reputation governing memory. That is the
part this project has to add, and it is the whole answer to "increase abilities
and autonomy based on experience."

The cut that matters: **recalling your own memory is baseline; recalling
everyone else's is a privilege.** An agent denied its own memory is amnesiac,
which protects nobody. Cross-agent recall is where one agent's wrong conclusion
becomes twelve agents' wrong conclusion — that is worth gating.

Seven settings added to `HARNESS_SETTINGS` (`lib/trustshell/HarnessProfile.ts`):

| key | authority | floor | ceiling |
|---|---|---|---|
| `memory.recall_scope` | **earned** | `own` | `org` |
| `memory.recall_max_items` | **earned** | 5 | 50 |
| `memory.recall_char_budget` | **earned** | 2000 | 20000 |
| `memory.recall_timeout_ms` | user | 5000 | 30000 |
| `memory.max_searches_per_turn` | user | 3 | 20 |
| `memory.extraction_assets` | user | `[]` (deny) | — |
| `memory.reuse_credit_requires_outcome` | **constitutional** | `true` | unsettable |

`earned` is writable by no layer, including the user. The three earned settings
default to exactly their floor — enforced by a guard in the test suite, which
caught the first draft of this spec setting `recall_max_items` to 5 with a floor
of 0.

### The loop that makes it earn

```
recall  →  memory_recall_log   (what was asked, which tier, what was dropped)
work    →  task outcome
link    →  memory_outcome_link (this node, this task, good | bad | unknown)
credit  →  reused_good / reused_bad on the node
rank    →  utilityScore: 0.3·importance + 0.5·outcome + 0.2·recency
grant   →  receipts over sustained good outcomes raise recall_scope / budgets
```

`unknown` is a required outcome value, not a placeholder. Most recalls will
never be reconciled to a verified outcome, and recording that honestly is what
stops the counters being inflated by assumption.

---

## 4. Per-agent loadout for the twelve Railway services

RepID scores from `agent_kya_registry`, **0–10000 scale** — not
`conductor_state.reputation_score`, which is 0–1 for the same concept. Banding
on the wrong one parks every agent in the floor tier while looking like a
working ladder (PR #22 finding).

| agent | RepID | tier | recall scope | items / chars | rationale |
|---|---:|---|---|---|---|
| VERITAS | 9200 | Platinum | `org` | 30 / 12000 | Validator — needs the widest view of prior failures |
| SHOFET | 8800 | Platinum | `org` | 30 / 12000 | Judge; precedent is its working material |
| SOPHIA | 8650 | Platinum | `team` | 25 / 10000 | Holds signing keys — scope capped below its tier |
| ORCH | 8100 | Gold | `team` | 20 / 8000 | Health monitor; fleet-wide symptom patterns |
| NEXUS | 7900 | Gold | `team` | 20 / 8000 | Router; needs peer capability memory |
| W3C | 7700 | Gold | `team` | 20 / 8000 | Chain integration |
| TORCH | 7600 | Silver | `team` | 15 / 6000 | Only agent with work logged in the last hour |
| GCM | 7400 | Silver | `own` | 10 / 4000 | Content; peer recall adds little |
| HDM | 7300 | Silver | `own` | 10 / 4000 | Strategy |
| CHESED | 7200 | Silver | `own` | 10 / 4000 | Never logged work |
| MEL | 7100 | Silver | `own` | 10 / 4000 | Ethics review |
| APM | 6900 | Silver | `own` | 10 / 4000 | Sprint coordination |

**SOPHIA is capped below its tier on purpose.** It holds
`AGENT_SOPHIA_PRIVKEY`; wide cross-agent recall on a key-holding service widens
what a prompt-injected memory could reach. Tier is not the only input.

### The honest caveat on this entire table

**None of these grants is currently valid.** Every RepID score above has **zero
receipts behind it** — the same objection that blocked the ladder migration in
PR #22. Under the resolver, all twelve agents resolve to the floor (`own`, 5
items, 2000 chars) until `memory_outcome_link` has rows and a receipt exists.

That is the correct behaviour, not a gap. The table is the ladder the receipts
will climb, not a set of grants to apply now. Applying it as configuration would
be granting `org`-wide recall on a self-reported number, which is precisely what
the earned authority exists to prevent.

---

## 5. Milestones

| # | What | State |
|---|---|---|
| M0 | Measure the corpus; `v_memory_recall_readiness` | **DONE** — changelog #117 |
| M1 | Recall primitives: RRF, tiers, budget, utility, dedup shape | **DONE** — 44 assertions |
| M2 | Memory as earned harness dimension | **DONE** — 7 settings |
| M3 | Identity repair + outcome tables | **WRITTEN, NOT APPLIED** — Sean-gated |
| M4 | Embedding backfill (216 nodes, 215 patterns) | Blocked on M3 + cost decision |
| M5 | Dedup pass over 124/99/163 duplicates | Blocked on M4 (needs an index) |
| M6 | Wire recall into the Railway agent loop | Blocked on M3; needs Railway access |
| M7 | Receipts → earned grants | Blocked on TRUSTSHELL M2 (§12 Q1/Q2) |

### Blocked, and why

- **M3** alters base tables, beyond the additive-view allowance. Rollback SQL is
  in the migration header.
- **M4** costs one embedding call per row and fixes a model choice permanently —
  mixing embedding models in one index silently degrades every similarity score.
- **M6** needs a Railway deploy. This session cannot reach Railway
  (`connect_rejected` at the sandbox proxy) and holds no Railway token.
- **M7** needs the two open TrustShell §12 decisions: receipt storage, and
  signing key custody.

### Not derivable — do not let anyone backfill it by guess

The mapping from the 34 orphan agent uuids to agent names **is not in this
database**. Zero nodes carry `agent_name` in metadata; only 10 carry a role.
Populating `owner_agent_name` by inference would fabricate provenance for
memories that would then be recalled as though their owner were known. The
column stays null until a real mapping is found — probably in repid-engine,
which wrote these rows and which this session cannot reach.
