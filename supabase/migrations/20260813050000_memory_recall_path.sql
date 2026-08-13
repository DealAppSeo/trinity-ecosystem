-- 20260813050000_memory_recall_path.sql
--
-- STATUS: WRITTEN, NOT APPLIED. Sean-gated (preflight contract §6 — this alters
-- base tables, which is beyond the additive-view allowance).
--
-- ---------------------------------------------------------------------------
-- ROLLBACK (complete, in reverse order):
--
--   drop table if exists public.memory_outcome_link;
--   drop table if exists public.memory_recall_log;
--   drop index if exists public.idx_amn_embedding_hnsw;
--   drop index if exists public.idx_amn_content_trgm;
--   drop index if exists public.idx_tlp_embedding_hnsw;
--   alter table public.agent_memory_nodes
--     drop column if exists reused_good,
--     drop column if exists reused_bad,
--     drop column if exists last_outcome_at;
--
-- No column is dropped and no row is deleted by this migration, so the rollback
-- above returns the schema to its exact prior shape. Data written into the new
-- columns between apply and rollback is lost; nothing pre-existing is.
-- ---------------------------------------------------------------------------
--
-- WHY. Measured on the live database 2026-08-13 (see v_memory_recall_readiness,
-- created additively in changelog #117):
--
--   corpus                    rows  retrievable  ever_read  dup   orphan_owners
--   agent_memory_nodes         429          213          0  124               0
--   agent_learning_events      429            0          0   99               0
--   trinity_learned_patterns   215            0          0  163               0
--   trinity_skills              14            0          0    0               0
--
-- Read that middle column. No memory node has ever been successfully recalled.
-- The corpus is not the problem — three months of writes produced substantive
-- content.
--
-- CORRECTED 2026-08-13 05:1xZ. An earlier draft of this header claimed identity
-- was broken: that all 34 distinct `agent_memory_nodes.agent_id` values resolved
-- to no agent registry, and it added an `owner_agent_name` column to fix it.
-- That was WRONG. It checked `agents`, `trinity_agents`, `agent_kya_registry`
-- and `conductor_state` — but not `repid_agents`, which is the registry the
-- writing code actually uses (repid-engine `scripts/seed-squad-memories.ts`,
-- `src/services/graph-rag/*`). Against `repid_agents`, **34 of 34 owner ids and
-- 429 of 429 nodes resolve.** Identity was never broken; the column that was
-- going to fix it has been removed from this migration. See LESSONS A9.
--
-- What is actually wrong, measured per agent via `v_agent_memory_readiness`:
--
--   1. RETRIEVABILITY, and it is far worse than the 50% aggregate suggests.
--      `graph_rag_match_nodes` filters on `embedding IS NOT NULL`. Of the 429
--      nodes, 204 belong to `test-agent-v11` and carry 192 of the 213
--      embeddings. The twelve production `trinity-*` agents hold 184 nodes with
--      **9 embeddings between them** — and eight of the twelve (nexus, apm,
--      hdm, orch, torch, w3c, gcm, mel) have **zero**. For those eight, recall
--      returns empty by construction, forever, no matter what is asked.
--
--   2. OUTCOME. Nothing records whether a recalled memory helped. Without that
--      link, reuse credit can only count retrievals, which rewards being
--      retrieved rather than being right and is self-reinforcing. See
--      `memory.reuse_credit_requires_outcome` in lib/trustshell/HarnessProfile.ts.
--
-- This migration fixes 2 structurally and gives 1 its indexes. It does NOT
-- backfill embeddings — that costs money per row and is a separate, explicitly
-- costed job, and it is now the single highest-value one.

begin;

-- ---------------------------------------------------------------------------
-- 1. Outcome counters
-- ---------------------------------------------------------------------------
-- Two counters, not one. A single `usage_count` cannot distinguish a memory
-- recalled twice and right both times from one recalled twice and wrong both
-- times, and ranking on it promotes whatever is already being promoted.

alter table public.agent_memory_nodes
  add column if not exists reused_good integer not null default 0,
  add column if not exists reused_bad integer not null default 0,
  add column if not exists last_outcome_at timestamptz;

comment on column public.agent_memory_nodes.reused_good is
  'Recalls after which the surrounding task verifiably succeeded. Incremented '
  'only by outcome reconciliation, never by the act of retrieval.';
comment on column public.agent_memory_nodes.reused_bad is
  'Recalls after which the surrounding task failed. A memory may score net '
  'negative and rank below never-used memories — intended: an actively '
  'misleading memory should be harder to retrieve than an unproven one.';

-- ---------------------------------------------------------------------------
-- 2. Indexes for the two retrieval legs
-- ---------------------------------------------------------------------------
-- HNSW over cosine distance for the vector leg. Partial, because indexing the
-- 216 null-embedding rows buys nothing.

create index if not exists idx_amn_embedding_hnsw
  on public.agent_memory_nodes
  using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

create index if not exists idx_tlp_embedding_hnsw
  on public.trinity_learned_patterns
  using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

-- Trigram over content for the lexical leg. pg_trgm rather than tsvector: the
-- corpus mixes English prose with identifiers like `x402`, `repid_config` and
-- `trinity-shofet`, which an English text-search config stems into uselessness.
create extension if not exists pg_trgm;

create index if not exists idx_amn_content_trgm
  on public.agent_memory_nodes
  using gin (content gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 3. Recall log — the receipt substrate
-- ---------------------------------------------------------------------------
-- Every recall, including the ones that returned nothing. Empty recalls are the
-- most informative rows here: they are how you find out an index is missing
-- rather than a corpus being thin.

create table if not exists public.memory_recall_log (
  id             bigserial primary key,
  agent_name     text        not null,
  session_key    text,
  query_text     text        not null,
  tier           text        not null check (tier in ('hybrid','vector','keyword','none')),
  degraded       boolean     not null,
  degraded_reason text,
  scope          text        not null check (scope in ('own','team','org')),
  returned_count integer     not null,
  dropped_count  integer     not null default 0,
  chars_used     integer     not null default 0,
  latency_ms     integer,
  node_ids       uuid[]      not null default '{}',
  created_at     timestamptz not null default now()
);

comment on table public.memory_recall_log is
  'One row per recall attempt. `degraded` and `degraded_reason` exist so a '
  'keyword-only result during an embedder outage is distinguishable from a '
  'genuine miss; `dropped_count` so budget truncation is never silent.';

create index if not exists idx_mrl_agent_created
  on public.memory_recall_log (agent_name, created_at desc);
create index if not exists idx_mrl_degraded
  on public.memory_recall_log (created_at desc) where degraded;

-- ---------------------------------------------------------------------------
-- 4. Outcome link — what turns a recall into evidence
-- ---------------------------------------------------------------------------
-- This is the table that makes memory *earn*. A recall on its own is not
-- evidence of anything. A recall joined to a task that later verifiably
-- succeeded or failed is the receipt that moves an earned harness setting.

create table if not exists public.memory_outcome_link (
  id           bigserial primary key,
  recall_id    bigint      not null references public.memory_recall_log(id) on delete cascade,
  node_id      uuid        not null references public.agent_memory_nodes(id) on delete cascade,
  task_id      bigint,
  outcome      text        not null check (outcome in ('good','bad','unknown')),
  -- 'unknown' is required, not a placeholder. Most recalls will never be
  -- reconciled to a verified outcome, and recording that honestly is what
  -- stops the two counters above from being inflated by assumption.
  evidence     jsonb       not null default '{}',
  recorded_at  timestamptz not null default now(),
  unique (recall_id, node_id)
);

create index if not exists idx_mol_node_outcome
  on public.memory_outcome_link (node_id, outcome);

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
-- Both new tables carry agent behaviour and must never be anon-readable. This
-- project already has two tables sitting at `USING (true)` for anon (LESSONS
-- S1); these do not join them. Service-role only — the publishable key maps to
-- `anon` and ships in the browser bundle.

alter table public.memory_recall_log   enable row level security;
alter table public.memory_outcome_link enable row level security;

-- No policy is created deliberately. RLS enabled with zero policies denies all
-- access to anon and authenticated while leaving service_role unaffected, which
-- is exactly the intended posture. Adding a permissive policy "so it works" is
-- how the two USING(true) tables happened.

commit;

-- ---------------------------------------------------------------------------
-- NOT DONE BY THIS MIGRATION, on purpose:
--
--   * Embedding backfill for the 216 unembedded nodes and 215 unembedded
--     patterns. Costs one embedding call per row; needs an explicit budget
--     decision and a model choice that must then stay fixed, because mixing
--     embedding models in one index silently degrades every similarity score.
--
--   * Any identity repair. There is nothing to repair — `agent_memory_nodes.
--     agent_id` is a clean FK into `repid_agents` and always was. The earlier
--     `owner_agent_name` column has been removed from this migration entirely.
--
--   * Deduplication of the 124 duplicate node contents, 99 duplicate lessons
--     and 163 duplicate pattern insights. Requires the batch-dedup pass in
--     lib/trustshell/MemoryRecall.ts (`canDedup`), which requires an index,
--     which is what this migration creates. Sequenced after, not with.
-- ---------------------------------------------------------------------------
