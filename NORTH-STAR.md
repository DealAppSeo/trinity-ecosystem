# NORTH STAR

**One page. Repo root. If you read nothing else, read this.**

Live numbers are **not** in this file on purpose — run `npm run north`. A page
of hand-copied counts is how the last nine planning surfaces died.

---

## The one sentence

**TrustShell is the trust harness that makes an AI agent's reputation portable:
HAL decides whether the agent is telling the truth, RepID turns that history
into a score, a ZK proof makes the score checkable without revealing it, and
x402 + ERC-8004 make it spendable and recordable on someone else's rails.**

If a piece of work does not make that sentence more true, it is not the work.

## The spine — four links, in order

```
  HAL ──────────► RepID ──────────► ZKP Postcard ──────────► x402 / ERC-8004
  is it true?     what's it worth?  prove it privately       spend + record it
```

Each link is only as good as the one before it. A ZK proof of a RepID that no
HAL run produced is a proof of nothing — which is the failure mode this whole
codebase keeps re-learning.

## Where the priorities actually live

**One place: `trinity_tasks`, filtered by `v_agent_preflight`.** Everything
below is deprecated as a planning surface. They still hold data; they are not
where you look to decide what to do next.

| Surface | Status |
| :-- | :-- |
| `trinity_tasks` (+ `v_agent_preflight`) | **canonical** |
| `autonomous_tasks`, `evergreen_tasks`, `trinity_evergreen_tasks`, `hal_evergreen_tasks`, `ai_task_registry`, `tasks`, `priority_stack`, `trinity_master_plan` | historical — do not add to |
| `SESSION_SUMMARY.md` | last session's handoff, not a plan |
| `docs/SHIP-CHECKLIST.md` | operational order for one release |
| this file | the spine and the gaps |

There were **nine** "what do I do next" surfaces across ~363k task rows when
this was written. That is the reason things get forgotten — not discipline.

## The gap that matters

**The substrate is alive. The product surface is four months stale.**

HAL classifies and RepID scores every single day, in the tens of thousands per
month. But `kya_compliance_receipts` — TrustShell's own output, the artifact
the whole harness exists to produce — was last written **2026-04-01**.

TrustShell is not under-built. **It is disconnected from its own live
substrate.** Closing that is the v1.

## Claims vs. built

Audited 2026-08-12 against the database, not against the docs. Re-check with
`npm run north`; the verdicts are here, the counts are not.

| Claim | Where claimed | Verdict |
| :-- | :-- | :-- |
| HAL hallucination filtering | npm, README, sites | **LIVE** — the strongest thing here, by far |
| Portable RepID score | everywhere | **LIVE** — scored daily |
| Refused trades as the killer feature | HyperDAG README ("160+ refused") | **UNDERSTATED** — the log holds far more refusals than claimed |
| ZKP Postcard proof | HyperDAG README | **BUILT, COOLING** — large proof corpus, but the rate has fallen off |
| x402 settlement | HyperDAG README, handoff | **REAL BUT THIN** — genuine on-chain settlements, low volume |
| ERC-8004 reputation writes | README, badges | **REAL BUT THIN** — genuine writes, low volume |
| Peer verification mesh | handoff | **STOPPED 2026-07-21** — died with the fleet freeze, not a code fault |
| BFT consensus authorizes every transaction | README | **WIRED, NEVER EXECUTED** against real providers |
| Compliance receipts via IPFS + Solana | one-pager | **OVERSTATED** — Solana yes, IPFS no; none issued since April |
| Insurance proportional to RepID | README | **NOT MEASURED** |
| Fireblocks pre-authorisation | README, one-pager | **STUB** — generates the object, calls no Fireblocks API. Honestly labelled in code |
| Package tier (Shamir M-of-N) | HyperDAG README | **ROADMAP** — self-declared as such. Fine |

Two rules this table exists to enforce: **do not soften a claim to match the
build — build the claim or delete it**, and **never let a stale surface look
current**. Both have been broken here before.

## The surface: what TrustShell.dev should be

Ten nav items today. Evidence supports **seven**, and the ordering is wrong —
it leads with Mission when the product is an install.

**Lead with the thing that works.** HAL is the live, enormous, defensible
asset. The first screen should show an agent being caught, with a real audit
chain entry behind it — not a mission statement.

| Keep, in this order | Why |
| :-- | :-- |
| **Connect** | the product is `npm install`; make it the front door |
| **Run** | HAL catching something, live. The demo *is* the pitch |
| **RepID** | the score, and what it unlocks |
| **History** | the audit chain — the receipt that makes it credible |
| **Leaderboard** | social proof, real rows behind it |
| **Agents** | the registry |
| **Settings** | thresholds, keys, posture |

| Cut or gate | Why |
| :-- | :-- |
| **Stake** | effectively dormant. A nav item over an empty room reads as abandonment |
| **Market** | no evidence found. Either wire it or drop it |
| **Mission** | fold into the footer. Nobody installs an SDK because of a mission page |

**The UX principle**, which is the same one the receipts taught us: *every
surface states whether what it shows was measured, not measured, or failed.*
A dash is a lie when it means "we didn't look." Three states, never two —
LIVE / NOT CHECKED / FAILED — on every panel that renders a number.

## Blocked on a human

These do not move without Sean, and everything downstream waits on them.

1. **Fleet HOLD gated on an impossible action.** `global_pause=true` since
   2026-07-22, gated on "rotate the `service_role` JWT" — Supabase has removed
   that capability. Restate the gate (disable legacy keys → verify → migrate to
   signing keys → revoke), then clear the pause.
2. **Network egress allowlist**: `trustshell.dev`, `trustrepid.dev`,
   `hyperdag.org`, `repid.dev`, `docs.lovable.dev`. Blocks any audit of the
   *shipped* surfaces — this file audits the docs and the database only.
3. **OAuth Lovable + Cloudflare** from an interactive session.
4. **Is `DealAppSeo/repid-engine` public, and does it hold the same
   `service_role` key?** If yes, the credential exposure is materially worse
   than the private-repo case currently assumed.
