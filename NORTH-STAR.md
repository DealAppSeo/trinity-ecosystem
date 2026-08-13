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

## Before mainnet — preconditions that are cheap now and expensive later

None of these matter on devnet/testnet. All of them must be true before value
moves on a real chain. Written down here because each one currently looks like
a non-issue, which is exactly how it gets shipped past.

- **Replace the Solana signing keypair.** `AGENT_SOPHIA_PRIVKEY` and
  `AGENT_SOPHIA_SECRET_BYTES` are the *same* keypair — one
  `Keypair.generate()` in `scripts/create-solana-wallet.js` — and the base58
  form is in git history. `SolanaExecutor` still signs with it. On devnet that
  is harmless: the funds are worthless, there is no signature-based auth
  anywhere in the app, and the on-chain compliance memos it writes are never
  read back. Any one of those three changing makes it live. Fix is five
  minutes: regenerate, set `AGENT_SOPHIA_SECRET_BYTES`, delete
  `AGENT_SOPHIA_PRIVKEY`.
- **Stop baking secrets into container images.** `repid-engine`'s Dockerfile
  passes `BASE_SEPOLIA_PRIVATE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` as build
  `ARG`/`ENV` (Railway build log flags `SecretsUsedInArgOrEnv`, lines 11-12), so
  a funded wallet key persists in the image layers. Unlike the settled Supabase
  key, this one has **no disabled-key defence behind it**. Read them at runtime
  only.
- **Re-check the memo threat once anything reads memos.** The moment a verifier
  reads compliance memos back from chain — or a counterparty does — a leaked
  signing key can forge RepID and `bft: 1` claims into the audit trail the
  product sells. Write-only memos are why this is currently theoretical.

## Blocked on a human

Live list. Items move to *Done* the moment they are done — a stale blocker list
is how a fleet stays paused for three weeks behind a gate nobody re-read.

1. **Network egress allowlist**: `qnnpjhlxljtqyigedwkb.supabase.co`,
   `repid-engine-production.up.railway.app`, `trustshell.dev`,
   `trustrepid.dev`, `hyperdag.org`, `repid.dev`, `docs.lovable.dev`.
   Set on the Claude Code environment. **Attempted 2026-08-13 and still
   `connect_rejected`** — egress policy appears to bind at container start, so
   a fresh session is the first thing to try. Until this lands, no agent
   session can audit the *shipped* surfaces; this file grades docs and database
   only.
2. **`BASE_SEPOLIA_PRIVATE_KEY` is baked into `repid-engine`'s image** as a
   build `ARG`/`ENV`. A funded wallet key in image layers, with nothing
   disabled standing behind it. The most live credential issue open.
3. **Railway env vars** on the service behind `app.aitrinitysymphony.com`:
   `INTERNAL_ROUTE_SECRET`, `CRON_SECRET`. Without them the BFT worker cannot be
   scheduled and every receipt stays `bft_passed = NULL`.
4. **OAuth Cloudflare + Stripe** from an interactive session — a
   non-interactive session cannot complete the handshake.
5. **Deploy merged `main`, then apply the phase-2 RLS migration**
   (`20260812220000_rls_phase2_after_deploy.sql`). ⚠ In that order. Reversed,
   the agent grid and receipt feed go blank.

### Done — kept so they are not re-opened

- **Legacy Supabase keys** — SETTLED. Disabled project-wide, so the publicly
  leaked `service_role` JWT is inert. Not an incident. One standing rule:
  **never press "Re-enable JWT-based API keys"**. `docs/KEY-ROTATION.md` plus
  the DB's settled facts.
- **Fleet HOLD** — cleared 2026-08-13. `verdict=GO`, `global_pause=false`,
  first time since 2026-07-22. The gate ("rotate the `service_role` JWT") was
  unsatisfiable as written and substantively met. `trinity_changelog` id 111,
  rollback SQL included. *`orphaned_claims` is still 23,113 — the other half of
  the original gate, and it does not block the fleet.*
- **PR #21** — merged as `acc94c8`.
- **Is `repid-engine` public and does it hold the same key?** — yes to both;
  see the settled item above. A 923-commit scan plus seven more public repos
  found no other credential.
- **Ecosystem repos attached, scanned, graphed** — `npm run graph:ecosystem`.
