# Dual-View launch plan — the Desk, the Floor, and what actually blocks them

**Status:** plan. Nothing in §5–§8 is built yet. §2 is the only section containing
measurements, and every one of them was taken this session against this repo.
**Date:** 2026-08-15
**Branch:** `claude/trustshell-launch-flywheel-6r4zt0`

Read `docs/PRIOR-WORK-INDEX.md` first. This plan defers to it in two places and
says so at both.

---

## 0. The one-paragraph version

The dual-view (human feed | PAI thinking graph) is the right surface and the
scope discipline in the source conversation is right. But the inventory that
scope was built on **was not taken against this repository**, so roughly half
the "wire, don't rebuild" list does not exist here (§1). The good news is
larger than the bad: this repo already holds a *real* verifiable gate and a
*real* twelve-agent swarm with honest liveness, which means **the MVP dual-view
can be built end-to-end inside `trinity-ecosystem` with zero cross-repo
dependency** — if we source the graph from `v_fleet_truth` + `ControlProof`
instead of from HITL. That is the unlock. Everything below follows from it.

---

## 1. Inventory correction — read this before you plan a single hour

The source conversation contains a table headed *"Honest inventory [disk, this
pass]"*. It lists `repid-engine/src/services/dual-auth-gate.ts`,
`src/trust-identity/`, `trustshell/app/start`, `/run/[agentId]`,
`controller-pwa`, `/api/v1/hitl`, `email-otp.ts`, `agent-naming.ts`,
`task-lineage.ts`, `graph-rag/*`, `DESIGN_PRINCIPLES.md`, and
*"Next 16 + React 19"*.

**None of those are in `trinity-ecosystem`.** [VERIFIED 2026-08-15 — `find` and
`grep -ril` over the whole tree excluding `node_modules`/`.git`/`.next`; and
`package.json`, which pins `next ^14.2.0` and `react ^18.3.0`.]

They are presumably in `DealAppSeo/repid-engine`, which that session had in its
workspace and this one does not. That is not a criticism of the inventory — it
is accurate about *somewhere*. It is a criticism of building a parallel plan on
top of it without re-checking, which is exactly PRIOR-WORK-INDEX rule 2
(*suspect the sample before the measurement*) applied to a file listing instead
of a dataset.

**`repid-engine` was NOT CHECKED this session.** `add_repo` requires approval
that did not arrive. Every claim below about that repo is therefore ASSUMED and
marked. Anyone with both repos checked out should correct this section first.

### What is actually here [VERIFIED 2026-08-15]

| Piece | Path | State |
|---|---|---|
| Dual-auth `ControlProof` — issue, attenuate, verify | `lib/trustshell/identity/control-proof.ts` | **REAL.** 104 assertions in `check:identity` |
| Selective disclosure, capability attenuation, delegation chains, `did:key` | `lib/trustshell/identity/` (11 modules) | **REAL** |
| Atomic nonce store (replay defence, in-instance) | `lib/trustshell/identity/nonce-store.ts` | **REAL** |
| ControlProof verify **over HTTP** | `app/api/trustshell/control-proof/verify/route.ts` | **REAL.** Forgery / wrong-audience / replay / escalation / disclosure-tamper all rejected server-side |
| RepID predicates (`repid >= t` with evidence quality) | `lib/trustshell/identity/repid-predicate.ts` | **REAL**, non-ZK |
| Transcript parser (TrustShell M1) | `lib/trustshell/TranscriptParser.ts` | **REAL.** 42 assertions, run against a live session |
| Harness profile — 6 dimensions, `earned` authority | `lib/trustshell/HarnessProfile.ts` | **REAL.** 31 assertions |
| Harness runtime — router, quorum, reputation, replay, transform | `lib/trustshell/harness/` (14 modules) | **REAL**, measured, see PRIOR-WORK-INDEX |
| Memory recall primitives | `lib/trustshell/MemoryRecall.ts` | **REAL.** 44 assertions |
| RepID computed from recorded outcomes | `lib/trustshell/EarnedMetrics.ts` + `app/api/trustrails/pay` | **REAL** |
| Fleet liveness, honest | `v_fleet_truth` / `v_fleet_liveness_strict` (Supabase) | **REAL.** 3/12 live, 12/12 reachable, 9/12 probe-only |
| RepID substrate | `repid_score_events` — 152,136 rows / 104 agents | **REAL** |
| Gate suite | `npm run check` — 15 scripts, 438+ assertions, + `tsc --noEmit` | **REAL**, exit 0 |
| E2E over real HTTP | `npm run test:e2e` — 26 VERIFIED / 4 NOT CHECKED / 0 FAILED | **REAL** |

### What is absent here, and therefore is a real cost, not a wiring job

| Missing | Consequence for this plan |
|---|---|
| Any `/live`, `/start`, or `/run/[agentId]` route | The app has **three** routes total: `/`, `/login`, `/dashboard`. The dual-view is a new route, not an edit. |
| HITL API, `controller-pwa` | The "wire up `listPendingPlaceholder`" bridge **is not available in this repo.** §4 replaces it. |
| `framer-motion`, `@xyflow/react`, any state library | Three new dependencies, not zero. |
| Session receipts (TrustShell M2–M6) | **This is the load-bearing gap.** See §3. |
| Next 16 / React 19 | We are on **14.2 / 18.3**. Every library choice in §7 is pinned to what runs on React 18. |
| `DESIGN_PRINCIPLES.md` | The design canon cited in the source conversation is not in this repo. Lane C writes it or ports it. |

---

## 2. Competitor read

The source conversation's competitor table is directionally right and its
conclusion — *no one pairs a human content world with a living, gated PAI graph
under dual-auth* — survives checking. What it underweights is how crowded the
**graph half** already is, and that matters because the graph is the half people
screenshot.

| Category | Who | What they own | Why it is not us |
|---|---|---|---|
| Agent trace graphs | [Langfuse Agent Graphs](https://langfuse.com/docs/observability/features/agent-graphs), LangSmith, [langgraphics](https://github.com/proactive-agent/langgraphics) | Live and replayable node/edge execution views | Debugger framing. Audience is the engineer who wrote the agent, not its principal. |
| Agent UI kits | [CopilotKit](https://www.copilotkit.ai/blog/easily-build-a-ui-for-your-ai-agent-in-minutes-langgraph-copilotkit), [Workflow Builder](https://www.workflowbuilder.io/integrations/langgraph) | Drop-in LangGraph UI incl. HITL approval flows | Approval as a *form*. No trust artifact behind the approve — nothing to verify afterwards. |
| HITL approval patterns | [StackAI](https://www.stackai.com/insights/human-in-the-loop-ai-agents-how-to-design-approval-workflows-for-safe-and-scalable-automation), OpenAI Agents SDK interrupts | Pause/approve/resume with full state | Same gap: the approval leaves a log entry, not a receipt a stranger can check. |
| Agent marketplaces | [GPT Store, AgentExchange, AWS Marketplace, Apify](https://www.mintmcp.com/blog/ai-agent-marketplaces) | Distribution and discovery at scale | Reputation is stars and installs. No earned, decayed, evidence-backed score. |
| Clip capture | [Clipy](https://clipy.online/for-agents), ScreenApp, [Mux agentic recording](https://www.mux.com/blog/agentic-video-screen-recording) | Recording and 9:16 repurposing as a service | Solves capture. Does not give anyone a reason to watch the clip. |

**The defensible seam is narrow and it is ours:** the approval in our gate
produces a **ControlProof that a third party can verify offline** —
`app/api/trustshell/control-proof/verify/route.ts` already does this today and
already rejects five distinct tamper classes. Nobody in the table above can say
that. So:

> **Design constraint, non-negotiable.** Every gate card in the dual-view must
> end in a verifiable artifact, and the UI must show its verify state. A gate
> that only writes a row is a feature Langfuse and CopilotKit both already ship.

One correction to the competitor framing in the source conversation: *"if our
PAI side looks like a debugger, we lose"* is right, but the fix is not aesthetic.
Langfuse's graph shows **what happened**. Ours must show **who is waiting on
whom and what needs you** — a queue with topology, not a trace with prettier
edges. If the two views would render the same node set, we built the wrong one.

---

## 3. Hard parts first — the honest critical path

The instruction was to build the hard parts first and bridge the wiring gaps.
Ranked by *how much downstream work it unblocks* × *how impossible it is to
fake*:

### H1 — The session receipt (TrustShell M2 + M3). **M2 DONE 2026-08-15; M3 open.**

> **Updated 2026-08-15.** M2 has landed — `lib/trustshell/receipt/`, 89
> assertions, CLI, local SQLite store, per-developer self-attestation. §12 Q1
> and Q2 (storage, key custody) are **decided**; see `TRUSTSHELL-V1.md` §12.
> M3 (`proof-verifier` accepts the receipt) is the next item on this lane, and
> it is what turns a self-attested receipt into something a stranger can check.
> The paragraphs below describe why this ranked first and remain accurate about
> everything M3 still blocks.
>
> One thing the MVP must inherit from M2: the receipt reads **NOT CHECKED**, and
> that is correct output, not a shortfall — claim checking is M4. The dual-view's
> chip must render three states from day one. If it can only show green, it is a
> trust badge.

Nothing in this repo emits, signs, or verifies a session receipt. `TRUSTSHELL-V1.md`
§10 has M1 done and M2–M6 not started, and `SESSION_SUMMARY.md` states the
consequence flatly: *"until receipts exist, the harness is a fully tested
implementation of least privilege for everybody."*

Everything the launch wants to say depends on this:

- Every `earned` harness setting sits at its floor until a receipt can raise it.
- `repid_writes_require_receipt` is declared and enforced by nothing.
- The dual-view's "verified" chip has no artifact to point at.
- TrustMarket cannot price reputation that has no evidence behind it.

M2 is *not* research. M1 already produces the census; M2 is canonical-form
hashing, `audit_hash` stable across re-runs, ed25519 signing. M3 is making
`@hyperdag/proof-verifier@0.2.0` — **already published** — accept it.

**Two open decisions block M2 and they are product calls, not engineering ones**
(`TRUSTSHELL-V1.md` §12 Q1, Q2): receipt storage (Supabase / local SQLite /
both) and signing-key custody (per-developer local / org). See §9.

### H2 — `trustshell init` + the npm/CLI install path (M5)

This is the surface named in the launch ask. `@hyperdag/trustshell@1.3.0`,
`trustshell-mcp@1.0.0` and `proof-verifier@0.2.0` are published;
`trustshell init` is marked **new** and unbuilt. It is mechanical — detect
installed MCP clients, write config, install the `Stop` hook — and it is the
entire first-run experience. There is no launch without it.

### H3 — The normalized PAI event contract (§5)

One TypeScript file and a fixture generator. It is hard only in the sense that
getting it wrong costs every other lane a rewrite. It is the **first** thing to
land because it is what makes the other three lanes independent.

### H4 — Gate 0 / Gate 1 on real `ControlProof`

The source conversation's call here is correct and I am adopting it unchanged:
do not wait on HITL. Gate 0 is *name your PAI*; Gate 1 is *may I remember this*.
Both run through `evaluateControlProof` and the existing verify route. This is
the single design decision that removes the cross-repo dependency from the
critical path.

### NOT on the critical path — stated so nobody builds it early

- **Plonky3 recursion, Poseidon2 in-circuit, nullifier ZK.** Blocked on the
  parameter handover (`docs/POSEIDON2-PARAMETER-REQUEST.md`) and on task #75
  (`static.crates.io` proxy allow-list). Lands in v1 via Lane B. The MVP's trust
  claim is *offline-verifiable signature*, not *zero-knowledge* — and the UI must
  not imply otherwise.
- **Mesh memory, Graph RAG in the task graph.** Graph RAG answers *why this
  node*. It is not the swarm. Drawing memory edges as the swarm is the fastest
  way to make the PAI pane unreadable.
- **Social import, agent rent/sale, data monetization, voice reassign,
  progressive OAuth.** v2, and only after one stranger has cleared a gate.

---

## 4. The unlock: a real graph with no cross-repo dependency

The source conversation assumed the MVP graph needs HITL, which lives in
`repid-engine`. It does not. This repo has two real sources that together give a
graph that is honest on day one:

**Nodes** — `v_fleet_truth` / `v_fleet_liveness_strict`. Twelve agents with
*measured* liveness: 3 live, 12 reachable, 9 probe-only, 0 on heartbeat. That is
not a mock swarm; it is a swarm with an uncomfortable and interesting truth in
it, which is a better demo than a green dashboard. `liveness_signal` maps
directly onto node status.

**Attention items** — `repid_score_events` (152,136 rows, 104 agents,
`task_domain` on 99.6%) gives real `repid_delta` cards. `x402_settlements` gives
spend. `EarnedMetrics` gives measured / insufficient / unmeasured per agent.

**Gate** — `ControlProof` issue → verify, over the existing HTTP route.

That is a complete MVP loop sourced entirely from this repo. HITL, when
`repid-engine` becomes reachable, is *another adapter behind the same contract* —
not a rewrite.

> **Honesty rule for the fleet pane.** 9 of 12 agents are probe-only and 0 have a
> fresh heartbeat. The graph must render that as `stale`, not as `running`.
> `v_fleet_truth` used to score a responding port as a working agent and was
> fixed for exactly this reason (changelog #134). Do not undo that fix in the UI
> layer by mapping `is_reachable` to a green pulse.

---

## 5. The frozen contract — the anti-conflict device

**This is how four lanes work in parallel without colliding.** One file, landed
first, versioned, and changed only by the amendment process in §6.4.

`lib/dual-view/contract.ts` — pure types, zero imports, zero runtime deps.

```ts
export const CONTRACT_VERSION = '1.0.0';

/** Closed set. Adding a member is a MINOR bump and requires §6.4. */
export type NodeStatus =
  | 'running'        // working now
  | 'waiting_human'  // gated — the loud one
  | 'waiting_peer'   // blocked by another node in this graph
  | 'blocked'        // blocked by something outside the graph
  | 'stale'          // reachable but no fresh evidence of work  ← see §4
  | 'done';

export type NodeKind = 'pai_core' | 'agent' | 'tool' | 'task';

export interface PaiNode {
  id: string;
  kind: NodeKind;
  label: string;
  status: NodeStatus;
  /** Why this status. Never render a status without it. */
  reason: string;
  /** VERIFIED | NOT_CHECKED | FAILED — three outcomes, never two. */
  evidence: 'VERIFIED' | 'NOT_CHECKED' | 'FAILED';
  parentId?: string;
  meta?: Record<string, string | number | boolean>;
}

export interface PaiEdge {
  id: string;
  from: string;
  to: string;
  /** 'depends' animates toward the blocker; 'manages' is hierarchy. */
  kind: 'depends' | 'manages' | 'invokes';
}

export type AttentionKind =
  | 'gated' | 'receipt' | 'repid_delta' | 'hal' | 'swarm';

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  title: string;
  body: string;
  at: string;                 // ISO 8601
  nodeId?: string;            // links the card to the graph
  /** Present iff kind==='gated'. */
  gate?: {
    gateId: string;
    action: string;           // what will happen if approved, in plain words
    risk: 'low' | 'medium' | 'high';
    /** Set once resolved. The verify state is the product. */
    proof?: { controlProofId: string; verified: boolean };
  };
}

export type PaiEvent =
  | { t: 'snapshot'; v: string; nodes: PaiNode[]; edges: PaiEdge[]; attention: AttentionItem[] }
  | { t: 'node.upsert'; v: string; node: PaiNode }
  | { t: 'node.remove'; v: string; id: string }
  | { t: 'edge.upsert'; v: string; edge: PaiEdge }
  | { t: 'attention.item'; v: string; item: AttentionItem }
  | { t: 'gate.resolved'; v: string; gateId: string; approved: boolean; controlProofId: string };
```

Shipping alongside it, same PR, same owner:

- `lib/dual-view/fixtures.ts` — deterministic scenarios: `empty`, `calm`,
  `one_gate`, `swarm_12`, `cascade_unblock`, `all_stale`. **Lane C builds the
  entire UI against these and needs no backend, no database, and no network.**
- `scripts/check-dual-view-contract.mjs` — validator + round-trip assertions,
  wired into `npm run check`. A fixture that violates the contract fails the
  build.

**Why a snapshot event exists.** Reconnect and tab-restore must not replay a
week of deltas. The stream opens with `snapshot`, then deltas.

**Why `reason` and `evidence` are required, not optional.** This repo's recurring
defect is a system reporting success it has not earned. A node that renders
green without saying what made it green reproduces that defect in the UI. A
missing `reason` is a contract violation, not a cosmetic gap.

---

## 6. Four lanes, disjoint files, one merge order

### 6.1 Lane assignment

| Lane | Owner | Scope | Depends on |
|---|---|---|---|
| **A — Trust core** | Claude Code (this repo) | Contract, receipt M2/M3, `trustshell init` M5, event adapter, gate wiring | nothing |
| **B — Proving** | XAI / Grok | Poseidon2 params, real `verify_proof`, `get_agent_repid`, cargo-in-CI, Plonky3 recursion | task #75, param handover |
| **C — Dual-view UI** | Gemini | `/live` route, graph pane, feed pane, motion, share capture, design canon | **contract only** (§5) |
| **D — RepID / HAL tuning** | either, continuous | Weight and setting evaluation via replay | nothing — unblocked today |

### 6.2 File ownership — no two lanes touch the same path

| Path | Lane |
|---|---|
| `lib/dual-view/contract.ts`, `lib/dual-view/fixtures.ts` | **A** (frozen after landing) |
| `lib/dual-view/adapters/**` | **A** |
| `lib/trustshell/receipt/**`, `lib/trustshell/identity/**` | **A** |
| `packages/trustshell-cli/**` | **A** |
| `services/zkp-postcard/**`, `lib/trustshell/identity/proof-provider.ts` | **B** |
| `app/live/**`, `components/dual-view/**`, `app/globals.css` | **C** |
| `scripts/harness-experiment.mjs`, `scripts/repid-replay.mjs` | **D** |
| `scripts/check-*.mjs` | owner of the feature it checks |

**Shared, and therefore sequenced:** `package.json`, `docs/PRIOR-WORK-INDEX.md`,
the `check` script chain. Rule: append only, never reorder, and rebase before
touching. Lane C adds its three dependencies in **one** commit, first, so nobody
else resolves a lockfile conflict.

### 6.3 Branches

`claude/trustshell-launch-flywheel-6r4zt0` is the integration branch. Lanes cut
from it and merge back small. No lane branches from another lane.

### 6.4 Amending the contract

Contract changes are the only cross-lane risk that matters. Process: open an
issue titled `contract: <change>`, state which lanes are affected, bump
`CONTRACT_VERSION`, land contract + fixtures + validator in **one** commit. Never
add a field and a consumer of that field in the same PR.

---

## 7. Stack — pinned to what actually runs here

We are on **Next 14.2 / React 18.3 / Tailwind 4.2**, not Next 16 / React 19.
Everything below is chosen against that.

| Need | Choice | Note |
|---|---|---|
| Graph | `@xyflow/react` v12 | Supports React 17–19. Custom node components, not the default renderer. |
| Motion | `motion` (Framer Motion 12) | `layoutId` for orb→graph morph; `AnimatePresence` for gate cards; springs `bounce: 0.1–0.2`. Honour `prefers-reduced-motion`. |
| State | `zustand` v5 | Small, React 18 safe. One store, contract-shaped. |
| Transport | **SSE** (`/api/dual-view/stream`) | Not WebSocket. One-directional, survives the proxy, trivially resumable via `Last-Event-ID`, and Next 14 route handlers do it natively. Actions go over normal POSTs. |
| Share | see below | |

**Correction on the share pipeline.** The source conversation proposes
`canvas.captureStream()` on the dual-view container. **That does not work** — a
DOM subtree is not a canvas, and `captureStream` exists only on
`HTMLCanvasElement` and media elements. Rendering DOM to video means
rasterising every frame through `html-to-image`, which will not hold 30fps on a
30-node animated graph. So:

- **MVP share = a still.** `html-to-image` → 1080×1920 PNG. One tap, no infra,
  works today, and a still of a loud amber "needs you" card is genuinely
  shareable.
- **v1 clip = `getDisplayMedia()`** — the user grants tab capture, `MediaRecorder`
  writes 15–30s of real video at real framerate. Costs one permission prompt and
  removes the rasterisation problem entirely.
- **v2 = Remotion**, server-side, branded and captioned, once there is demand
  evidence.

**Not adopting:** LangGraph as the runtime or as a UI dependency. It is one
future adapter behind §5, nothing more. Also not adopting Clerk — email OTP is
sufficient until social import is real.

---

## 8. Scope

### MVP — a stranger understands it in 10s and clears one gate

1. Split layout, side-by-side and stacked, either pane primary, one swap.
2. Human pane: attention feed from real `repid_delta` / `receipt` / `swarm`
   items. Not a social firehose.
3. PAI pane: orb → graph. PAI core + fleet nodes from `v_fleet_truth`. Five
   statuses, each with its `reason` visible on hover.
4. **Gate 0 (name the PAI) and Gate 1 (first persist)**, both producing a real
   `ControlProof`, both showing verify state.
5. Demo mode before signup, labelled as demo where it is demo.
6. Share v0: 1080×1920 PNG.
7. Persona label on the PAI chrome.

**Done when:** a stranger opens `/live`, says "left is me, right is my AI"
unprompted, clears one gate, and the resulting ControlProof verifies through the
existing route. No account required for that loop.

**Explicitly out:** OAuth, social import, marketplace listings, drag-drop, voice,
recursion visuals, multi-device sync, live co-watch.

### v1 — sticky

Node detail drawer (why / tool / evidence / RepID impact); live SSE updates;
drag to reassign; dual-auth chip with honest `doesNotAttest`; persisted layout;
`getDisplayMedia` clip; mobile stacked + PiP; assertiveness calibrated from
overrides, three questions per new context, always skippable; TrustMarket
`/live` as a share destination stub; **HITL adapter** if `repid-engine` is
reachable by then; Lane B's real proofs land here.

### v2 — growth, and only after one external user has cleared a gate on MVP

9:16 branded export, multi-persona visual languages, replay scrubber, social
import + progressive OAuth, agent/skill listings, depersonalized data opt-in,
nullifier/recursion visuals, live co-watch.

---

## 9. Testing in parallel — and the one trap to avoid

The ask was to keep testing and improving HAL and RepID weights while the UI is
built. Lane D is unblocked **today**: `npm run repid:replay`,
`scripts/harness-experiment.mjs`, and `sim:harness` all run without the UI.

**But do not tune the weights.** `docs/PRIOR-WORK-INDEX.md` closes this:

- Top-1 routing is at **97.9%** of the omniscient bound — 2.00pp total remaining
  for any router, scheduler, capacity or timeout change.
- Panel membership is at **99.23%** of its bound — 0.75pp left.
- Panel size **3** is the cost-adjusted optimum, settled.

A sprint spent retuning those returns approximately nothing, and this repo has
already paid for that lesson once.

**The actual open problem is data capture, not scoring.** `bftAccuracy` carries
RepID's heaviest weight — **0.40** — and has **zero rows** in both BFT tables. No
table records latency per agent. That is 50% of RepID's weight that can only
resolve to zero, no matter how the weights are tuned. Lane D's task is therefore:

1. Capture `bftAccuracy` — find or create the writer. `hal_quorum_receipts` was
   deliberately declined (Sprint K) because inventing its schema was the wrong
   move; that decision should be revisited *with* a writer, not without one.
2. Capture per-agent latency.
3. Only then re-run the replay and see whether anything moves.

Success metric: a RepID that provably changes when behaviour does, with
`bftAccuracy` measured rather than zero.

**Gate for every lane, every merge:** `npm run check` exit 0 (438+ assertions),
`tsc --noEmit` diffed against base, `npm run test:e2e` core steps green. Three
outcomes in every report — VERIFIED / NOT CHECKED / FAILED.

---

## 10. Decisions needed from Sean

Ordered by what they block.

1. ~~**Receipt storage**~~ — **DECIDED 2026-08-15: local SQLite first**, Supabase
   as a separate explicit publish step. Shipped on built-in `node:sqlite`; no new
   dependency, no RLS to get wrong.
2. ~~**Signing-key custody**~~ — **DECIDED 2026-08-15: per-developer local key.**
   Receipts are self-attested and say so in `attestation.kind`; the CLI refuses
   to generate a key rather than mint provenance nobody kept.
3. **Board exception** — confirm `/live` is a TrustShell + TrustMarket route, not
   a thirteenth vertical, so the freeze holds.
4. **`repid-engine` access for agent sessions** — `add_repo` approval, so the
   HITL adapter and the inventory in §1 can be checked rather than assumed.
5. **Task #75** — `static.crates.io` on the proxy allow-list. Unblocks Lane B's
   CI verification. Not a global blocker; a dev machine builds today.
6. **Poseidon2 parameter handover** — `docs/POSEIDON2-HANDOVER-MESSAGE.md` is
   paste-ready. Lane B is idle on the recursion half until it lands.

### BLOCKED_FOR_SEAN (carried forward, unchanged)

- Rotate the Base Sepolia deployer key (task #73) — owns ERC-8004 ids
  3747/3748/3750, in git history. Do not cite those three as provenance.
- `repid_config` `anon` read policy + `enterprise_api_key`.
- `20260813210000_agent_repid_earned_observations.sql` — written, unapplied.
- Task key on `repid_score_events` — still THE blocker for co-failure.

---

## 11. What would make this fail

- **The graph looks like a debugger.** Mitigation in §2: if our node set matches
  what Langfuse would render, we built the wrong thing.
- **The gate is theatre.** A gate that writes a row and shows a checkmark is
  strictly worse than no gate, because it teaches users the checkmark means
  nothing. Mitigation: verify state is rendered from the actual verify route, and
  a verify failure is visible, not swallowed.
- **The contract thaws.** Four lanes against a moving type is the collision this
  plan exists to prevent. Mitigation: §6.4, and the validator in `npm run check`.
- **We ship the graph before the receipt.** Then the trust claim is a label. H1
  is first in §3 for this reason, and the MVP's honest claim is
  *offline-verifiable signature*, not *zero-knowledge*.
- **Fleet liveness gets prettied up.** 9 of 12 probe-only rendering as green
  would reproduce the exact bug fixed in changelog #134, in a surface designed to
  be screenshotted.

---

## Sources

- [Langfuse Agent Graphs](https://langfuse.com/docs/observability/features/agent-graphs)
- [langgraphics — live LangGraph execution visualisation](https://github.com/proactive-agent/langgraphics)
- [CopilotKit + LangGraph agent UI](https://www.copilotkit.ai/blog/easily-build-a-ui-for-your-ai-agent-in-minutes-langgraph-copilotkit)
- [Workflow Builder — LangGraph visual editor / HITL](https://www.workflowbuilder.io/integrations/langgraph)
- [StackAI — designing HITL approval workflows](https://www.stackai.com/insights/human-in-the-loop-ai-agents-how-to-design-approval-workflows-for-safe-and-scalable-automation)
- [MintMCP — AI agent marketplaces, 2026 landscape](https://www.mintmcp.com/blog/ai-agent-marketplaces)
- [Clipy — agent-native screen recording](https://clipy.online/for-agents)
- [Mux — agentic screen recording in the browser](https://www.mux.com/blog/agentic-video-screen-recording)
